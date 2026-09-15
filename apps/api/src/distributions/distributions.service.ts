import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ResourcesService } from '../resources/resources.service';
import { VerificationService } from '../verification/verification.service';
import { CreateDistributionDto, UpdateDistributionStatusDto } from './dto/create-distribution.dto';
import { CreateDistributionAllocationDto } from './dto/create-distribution-allocation.dto';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';

const UNRESTRICTED_ROLES: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];
const CAN_REVERSE_ROLES: Role[] = [...UNRESTRICTED_ROLES, Role.LGA_ADMIN, Role.WARD_ADMIN];

const DISTRIBUTION_INCLUDE = {
  resource: { select: { id: true, name: true, unit: true } },
  organizer: { select: { id: true, fullName: true } },
} as const;

const ALLOCATION_INCLUDE = {
  resource: { select: { id: true, name: true, unit: true } },
  targetLga: { select: { id: true, name: true } },
  targetWard: { select: { id: true, name: true } },
  targetPollingUnit: { select: { id: true, name: true } },
  allocatedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class DistributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
    private readonly resourcesService: ResourcesService,
    private readonly verificationService: VerificationService,
  ) {}

  // ---- Campaign lifecycle ----

  async create(dto: CreateDistributionDto, actor: AuthenticatedUser) {
    const resource = await this.prisma.resource.findUnique({ where: { id: dto.resourceId } });
    if (!resource) throw new BadRequestException('The selected resource does not exist.');

    const distribution = await this.prisma.distribution.create({
      data: {
        title: dto.title,
        description: dto.description,
        resourceId: dto.resourceId,
        organizerId: actor.id,
        status: 'DRAFT',
      },
      include: DISTRIBUTION_INCLUDE,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.DISTRIBUTION_CREATED,
      entityType: 'Distribution',
      entityId: distribution.id,
      metadata: { title: distribution.title, resourceId: dto.resourceId },
    });

    return distribution;
  }

  findAll() {
    return this.prisma.distribution.findMany({
      include: DISTRIBUTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const distribution = await this.prisma.distribution.findUnique({
      where: { id },
      include: DISTRIBUTION_INCLUDE,
    });
    if (!distribution) throw new NotFoundException('Distribution not found.');
    return distribution;
  }

  async updateStatus(id: string, dto: UpdateDistributionStatusDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id);

    const distribution = await this.prisma.distribution.update({
      where: { id },
      data: { status: dto.status },
      include: DISTRIBUTION_INCLUDE,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.DISTRIBUTION_STATUS_CHANGED,
      entityType: 'Distribution',
      entityId: distribution.id,
      metadata: { from: existing.status, to: dto.status },
    });

    return distribution;
  }

  // ---- Allocations (delegates the atomic quantity work to ResourcesService) ----

  async createAllocation(distributionId: string, dto: CreateDistributionAllocationDto, actor: AuthenticatedUser) {
    const distribution = await this.findOne(distributionId);

    return this.resourcesService.createAllocation(
      {
        resourceId: distribution.resourceId,
        quantity: dto.quantity,
        targetLevel: dto.targetLevel,
        targetId: dto.targetId,
        notes: dto.notes,
      },
      actor,
      distributionId,
    );
  }

  listAllocations(distributionId: string, actor: AuthenticatedUser) {
    return this.resourcesService.listAllocations(actor, undefined, distributionId);
  }

  /** Finds the allocation this officer operates against by default: the one matching their own assigned unit. */
  private async resolveOfficerAllocation(distributionId: string, actor: AuthenticatedUser) {
    const where: Prisma.ResourceAllocationWhereInput = { distributionId };

    if (actor.role === Role.LGA_ADMIN && actor.lgaId) {
      Object.assign(where, { targetLgaId: actor.lgaId, targetWardId: null });
    } else if (actor.role === Role.WARD_ADMIN && actor.wardId) {
      Object.assign(where, { targetWardId: actor.wardId, targetPollingUnitId: null });
    } else if (actor.role === Role.POLLING_UNIT_OFFICER && actor.pollingUnitId) {
      Object.assign(where, { targetPollingUnitId: actor.pollingUnitId });
    } else {
      return null;
    }

    return this.prisma.resourceAllocation.findFirst({
      where,
      include: ALLOCATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Receipts ----

  async confirmReceipt(distributionId: string, dto: ConfirmReceiptDto, actor: AuthenticatedUser) {
    const distribution = await this.findOne(distributionId);
    if (distribution.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Receipts can't be confirmed for a distribution that is ${distribution.status.toLowerCase()}.`,
      );
    }

    const member = await this.verificationService.resolveMember(dto);
    if (!member) {
      throw new NotFoundException('No member matches that QR code, membership ID, or search term.');
    }

    let allocation;
    if (dto.allocationId) {
      allocation = await this.resourcesService.findAllocationOne(dto.allocationId, actor);
      if (allocation.distributionId !== distributionId) {
        throw new BadRequestException('That allocation does not belong to this distribution.');
      }
    } else {
      allocation = await this.resolveOfficerAllocation(distributionId, actor);
    }

    if (!allocation) {
      throw new BadRequestException(
        'No resource allocation was found for your assigned unit under this distribution. Ask an administrator to allocate stock first.',
      );
    }

    const quantity = dto.quantity ?? 1;
    const method = dto.token ? 'QR' : dto.membershipId ? 'MEMBERSHIP_ID' : 'SEARCH';

    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        // Postgres aborts an entire transaction on the first failing
        // statement — a later query in the same transaction can't recover
        // from a unique-constraint violation (it fails with "current
        // transaction is aborted"). So we check for an existing receipt
        // with a plain SELECT *before* writing anything, rather than
        // attempting an insert and reacting to its failure.
        const existing = await tx.distributionReceipt.findUnique({
          where: { distributionId_memberId: { distributionId, memberId: member.id } },
        });
        if (existing && existing.status === 'CONFIRMED') {
          throw new ConflictException('This member has already received an item from this distribution.');
        }

        const decremented = await tx.resourceAllocation.updateMany({
          where: { id: allocation.id, remainingQuantity: { gte: quantity } },
          data: { remainingQuantity: { decrement: quantity } },
        });
        if (decremented.count === 0) {
          throw new BadRequestException(
            `Not enough remaining stock in this allocation. Only ${allocation.remainingQuantity} remain.`,
          );
        }

        if (existing) {
          // Only reachable when existing.status === 'REVERSED' — reactivate
          // the same row in place rather than creating a second one.
          return tx.distributionReceipt.update({
            where: { id: existing.id },
            data: {
              allocationId: allocation.id,
              quantity,
              method,
              officerId: actor.id,
              status: 'CONFIRMED',
              reversedAt: null,
              reversedById: null,
            },
          });
        }

        return tx.distributionReceipt.create({
          data: {
            distributionId,
            allocationId: allocation.id,
            memberId: member.id,
            quantity,
            method,
            officerId: actor.id,
            status: 'CONFIRMED',
          },
        });
      });

      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.RECEIPT_CONFIRMED,
        entityType: 'DistributionReceipt',
        entityId: receipt.id,
        metadata: { distributionId, memberId: member.id, allocationId: allocation.id, quantity },
      });

      return {
        receipt,
        member: {
          id: member.id,
          membershipId: member.membershipId,
          fullName: [member.firstName, member.middleName, member.surname].filter(Boolean).join(' '),
          photoUrl: member.photoUrl,
          status: member.status,
        },
      };
    } catch (error) {
      // Defense in depth: two near-simultaneous requests for the same
      // member could both pass the pre-check before either commits, in
      // which case the loser's insert hits the unique constraint for real.
      // Translate that into the same friendly conflict rather than a raw
      // Prisma error.
      const isRaceDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      const outcome = isRaceDuplicate
        ? new ConflictException('This member has already received an item from this distribution.')
        : error;

      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.RECEIPT_REJECTED,
        entityType: 'Distribution',
        entityId: distributionId,
        metadata: {
          memberId: member.id,
          reason: outcome instanceof Error ? outcome.message : 'unknown',
        },
      });
      throw outcome;
    }
  }

  async reverseReceipt(distributionId: string, receiptId: string, actor: AuthenticatedUser) {
    if (!CAN_REVERSE_ROLES.includes(actor.role)) {
      throw new BadRequestException('You are not permitted to reverse a receipt.');
    }

    const receipt = await this.prisma.distributionReceipt.findUnique({
      where: { id: receiptId },
      include: { allocation: true },
    });
    if (!receipt || receipt.distributionId !== distributionId) {
      throw new NotFoundException('Receipt not found.');
    }
    if (receipt.status === 'REVERSED') {
      throw new BadRequestException('This receipt has already been reversed.');
    }

    this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: receipt.allocation.targetLgaId,
      wardId: receipt.allocation.targetWardId,
      pollingUnitId: receipt.allocation.targetPollingUnitId,
    });

    const updatedReceipt = await this.prisma.$transaction(async (tx) => {
      await tx.resourceAllocation.update({
        where: { id: receipt.allocationId },
        data: { remainingQuantity: { increment: receipt.quantity } },
      });
      return tx.distributionReceipt.update({
        where: { id: receiptId },
        data: { status: 'REVERSED', reversedAt: new Date(), reversedById: actor.id },
      });
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.RECEIPT_REVERSED,
      entityType: 'DistributionReceipt',
      entityId: receiptId,
      metadata: { distributionId, memberId: receipt.memberId },
    });

    return updatedReceipt;
  }

  async listReceipts(distributionId: string, actor: AuthenticatedUser) {
    const allocationScope = this.orgScope.resourceAllocationScopeWhere(actor);

    return this.prisma.distributionReceipt.findMany({
      where: { distributionId, allocation: allocationScope },
      include: {
        member: {
          select: { id: true, membershipId: true, firstName: true, middleName: true, surname: true },
        },
        officer: { select: { id: true, fullName: true } },
        allocation: {
          select: {
            targetLga: { select: { name: true } },
            targetWard: { select: { name: true } },
            targetPollingUnit: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
