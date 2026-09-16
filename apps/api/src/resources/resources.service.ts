import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResourceTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateResourceDto, RestockResourceDto } from './dto/create-resource.dto';
import { AllocationTargetLevel, CreateAllocationDto } from './dto/create-allocation.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';

interface ResolvedTarget {
  targetLgaId: string;
  targetWardId: string | null;
  targetPollingUnitId: string | null;
}

const ALLOCATION_INCLUDE = {
  resource: { select: { id: true, name: true, unit: true } },
  targetLga: { select: { id: true, name: true } },
  targetWard: { select: { id: true, name: true } },
  targetPollingUnit: { select: { id: true, name: true } },
  allocatedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
  ) {}

  // ---- Resources (catalog) ----

  async createResource(dto: CreateResourceDto, actor: AuthenticatedUser) {
    const resource = await this.prisma.resource.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        description: dto.description,
        totalQuantity: dto.initialQuantity,
        remainingQuantity: dto.initialQuantity,
        campaignId: dto.campaignId,
        createdById: actor.id,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.RESOURCE_CREATED,
      entityType: 'Resource',
      entityId: resource.id,
      metadata: { name: resource.name, initialQuantity: dto.initialQuantity },
    });

    return resource;
  }

  async findAllResources() {
    const resources = await this.prisma.resource.findMany({ orderBy: { createdAt: 'desc' } });
    return resources.map((r) => ({ ...r, allocatedQuantity: r.totalQuantity - r.remainingQuantity }));
  }

  async findResourceOne(id: string) {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found.');
    return { ...resource, allocatedQuantity: resource.totalQuantity - resource.remainingQuantity };
  }

  async restock(id: string, dto: RestockResourceDto, actor: AuthenticatedUser) {
    const resource = await this.prisma.resource.update({
      where: { id },
      data: {
        totalQuantity: { increment: dto.quantity },
        remainingQuantity: { increment: dto.quantity },
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.RESOURCE_RESTOCKED,
      entityType: 'Resource',
      entityId: resource.id,
      metadata: { quantity: dto.quantity, notes: dto.notes },
    });

    return { ...resource, allocatedQuantity: resource.totalQuantity - resource.remainingQuantity };
  }

  // ---- Allocations ----

  private async resolveTarget(
    targetLevel: AllocationTargetLevel,
    targetId: string,
  ): Promise<ResolvedTarget> {
    switch (targetLevel) {
      case AllocationTargetLevel.LGA: {
        const lga = await this.prisma.lGA.findUnique({ where: { id: targetId } });
        if (!lga) throw new BadRequestException('The selected LGA does not exist.');
        return { targetLgaId: lga.id, targetWardId: null, targetPollingUnitId: null };
      }
      case AllocationTargetLevel.WARD: {
        const ward = await this.prisma.ward.findUnique({ where: { id: targetId } });
        if (!ward) throw new BadRequestException('The selected ward does not exist.');
        return { targetLgaId: ward.lgaId, targetWardId: ward.id, targetPollingUnitId: null };
      }
      case AllocationTargetLevel.POLLING_UNIT: {
        const pollingUnit = await this.prisma.pollingUnit.findUnique({
          where: { id: targetId },
          include: { ward: true },
        });
        if (!pollingUnit) throw new BadRequestException('The selected polling unit does not exist.');
        return {
          targetLgaId: pollingUnit.ward.lgaId,
          targetWardId: pollingUnit.wardId,
          targetPollingUnitId: pollingUnit.id,
        };
      }
    }
  }

  async createAllocation(dto: CreateAllocationDto, actor: AuthenticatedUser, distributionId?: string) {
    const target = await this.resolveTarget(dto.targetLevel, dto.targetId);
    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: target.targetLgaId,
      wardId: target.targetWardId,
      pollingUnitId: target.targetPollingUnitId,
    });

    try {
      const allocation = await this.prisma.$transaction(async (tx) => {
        const decremented = await tx.resource.updateMany({
          where: { id: dto.resourceId, remainingQuantity: { gte: dto.quantity } },
          data: { remainingQuantity: { decrement: dto.quantity } },
        });

        if (decremented.count === 0) {
          const resource = await tx.resource.findUnique({ where: { id: dto.resourceId } });
          if (!resource) throw new NotFoundException('Resource not found.');
          throw new BadRequestException(
            `Not enough unallocated stock. Only ${resource.remainingQuantity} ${resource.unit ?? 'units'} remain unallocated.`,
          );
        }

        return tx.resourceAllocation.create({
          data: {
            resourceId: dto.resourceId,
            quantity: dto.quantity,
            remainingQuantity: dto.quantity,
            notes: dto.notes,
            allocatedById: actor.id,
            distributionId,
            ...target,
          },
          include: ALLOCATION_INCLUDE,
        });
      });

      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.ALLOCATION_CREATED,
        entityType: 'ResourceAllocation',
        entityId: allocation.id,
        metadata: { resourceId: dto.resourceId, quantity: dto.quantity, distributionId },
      });

      return allocation;
    } catch (error) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.RESOURCE_ALLOCATION_REJECTED,
        entityType: 'Resource',
        entityId: dto.resourceId,
        metadata: { quantity: dto.quantity, reason: error instanceof Error ? error.message : 'unknown' },
      });
      throw error;
    }
  }

  async listAllocations(actor: AuthenticatedUser, resourceId?: string, distributionId?: string) {
    const scopeWhere = this.orgScope.resourceAllocationScopeWhere(actor);
    const where: Prisma.ResourceAllocationWhereInput = {
      ...scopeWhere,
      ...(resourceId ? { resourceId } : {}),
      ...(distributionId ? { distributionId } : {}),
    };

    return this.prisma.resourceAllocation.findMany({
      where,
      include: ALLOCATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllocationOne(id: string, actor: AuthenticatedUser) {
    const allocation = await this.prisma.resourceAllocation.findUnique({
      where: { id },
      include: ALLOCATION_INCLUDE,
    });
    if (!allocation) throw new NotFoundException('Allocation not found.');

    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: allocation.targetLgaId,
      wardId: allocation.targetWardId,
      pollingUnitId: allocation.targetPollingUnitId,
    });

    return allocation;
  }

  // ---- Transactions (usage / adjustment against an allocation) ----

  async createTransaction(allocationId: string, dto: CreateTransactionDto, actor: AuthenticatedUser) {
    const allocation = await this.findAllocationOne(allocationId, actor);

    if (dto.type === ResourceTransactionType.USAGE && dto.quantity <= 0) {
      throw new BadRequestException('Usage quantity must be greater than zero.');
    }
    if (dto.type === ResourceTransactionType.ADJUSTMENT && dto.quantity === 0) {
      throw new BadRequestException('Adjustment quantity cannot be zero.');
    }

    const delta = dto.type === ResourceTransactionType.USAGE ? -dto.quantity : dto.quantity;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (delta < 0) {
          const decremented = await tx.resourceAllocation.updateMany({
            where: { id: allocationId, remainingQuantity: { gte: -delta } },
            data: { remainingQuantity: { decrement: -delta } },
          });
          if (decremented.count === 0) {
            throw new BadRequestException(
              `Not enough remaining in this allocation. Only ${allocation.remainingQuantity} remain.`,
            );
          }
        } else {
          await tx.resourceAllocation.update({
            where: { id: allocationId },
            data: { remainingQuantity: { increment: delta } },
          });
        }

        const transaction = await tx.resourceTransaction.create({
          data: {
            allocationId,
            type: dto.type,
            quantity: dto.quantity,
            notes: dto.notes,
            recordedById: actor.id,
          },
        });

        await this.auditService.record({
          actorId: actor.id,
          action: AuditAction.RESOURCE_TRANSACTION_RECORDED,
          entityType: 'ResourceAllocation',
          entityId: allocationId,
          metadata: { type: dto.type, quantity: dto.quantity },
        });

        return transaction;
      });
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.RESOURCE_TRANSACTION_REJECTED,
        entityType: 'ResourceAllocation',
        entityId: allocationId,
        metadata: { type: dto.type, quantity: dto.quantity, reason: error.message },
      });
      throw error;
    }
  }

  async listTransactions(allocationId: string, actor: AuthenticatedUser) {
    await this.findAllocationOne(allocationId, actor);
    return this.prisma.resourceTransaction.findMany({
      where: { allocationId },
      include: { recordedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
