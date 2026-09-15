import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateEventDto, EventTargetLevel } from './dto/create-event.dto';
import { UpdateEventDto, UpdateEventStatusDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';

const TOP_LEVEL_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];

interface ResolvedTarget {
  targetLgaId: string | null;
  targetWardId: string | null;
  targetPollingUnitId: string | null;
}

const EVENT_INCLUDE = {
  organizer: { select: { id: true, fullName: true } },
  targetLga: { select: { id: true, name: true } },
  targetWard: { select: { id: true, name: true } },
  targetPollingUnit: { select: { id: true, name: true } },
  _count: { select: { attendances: true } },
} as const;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
  ) {}

  private async resolveTarget(
    targetLevel: EventTargetLevel,
    targetId: string | undefined,
  ): Promise<ResolvedTarget> {
    switch (targetLevel) {
      case EventTargetLevel.DISTRICT:
        return { targetLgaId: null, targetWardId: null, targetPollingUnitId: null };

      case EventTargetLevel.LGA: {
        if (!targetId) throw new BadRequestException('targetId is required for an LGA-level event.');
        const lga = await this.prisma.lGA.findUnique({ where: { id: targetId } });
        if (!lga) throw new BadRequestException('The selected LGA does not exist.');
        return { targetLgaId: lga.id, targetWardId: null, targetPollingUnitId: null };
      }

      case EventTargetLevel.WARD: {
        if (!targetId) throw new BadRequestException('targetId is required for a Ward-level event.');
        const ward = await this.prisma.ward.findUnique({ where: { id: targetId } });
        if (!ward) throw new BadRequestException('The selected ward does not exist.');
        return { targetLgaId: ward.lgaId, targetWardId: ward.id, targetPollingUnitId: null };
      }

      case EventTargetLevel.POLLING_UNIT: {
        if (!targetId) {
          throw new BadRequestException('targetId is required for a Polling-Unit-level event.');
        }
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

  private assertCanTarget(actor: AuthenticatedUser, target: ResolvedTarget) {
    if (TOP_LEVEL_ADMINS.includes(actor.role)) return;

    if (!target.targetLgaId) {
      throw new ForbiddenException('Only district-level administrators can create district-wide events.');
    }
    this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: target.targetLgaId,
      wardId: target.targetWardId,
      pollingUnitId: target.targetPollingUnitId,
    });
  }

  async create(dto: CreateEventDto, actor: AuthenticatedUser) {
    if (new Date(dto.endTime) <= new Date(dto.startTime)) {
      throw new BadRequestException('End time must be after start time.');
    }

    const target = await this.resolveTarget(dto.targetLevel, dto.targetId);
    this.assertCanTarget(actor, target);

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        location: dto.location,
        organizerId: actor.id,
        status: 'DRAFT',
        ...target,
      },
      include: EVENT_INCLUDE,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.EVENT_CREATED,
      entityType: 'Event',
      entityId: event.id,
      metadata: { title: event.title },
    });

    return event;
  }

  async findAll(query: QueryEventDto, actor: AuthenticatedUser) {
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '25', 10) || 25, 1), 100);

    const scopeWhere = await this.orgScope.eventScopeWhere(actor);
    const where = { ...scopeWhere, ...(query.status ? { status: query.status } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const event = await this.prisma.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!event) throw new NotFoundException('Event not found.');

    await this.orgScope.assertCanViewEvent(actor, event);

    return event;
  }

  async update(id: string, dto: UpdateEventDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);

    let target: ResolvedTarget | undefined;
    if (dto.targetLevel) {
      target = await this.resolveTarget(dto.targetLevel, dto.targetId);
      this.assertCanTarget(actor, target);
    } else if (!TOP_LEVEL_ADMINS.includes(actor.role)) {
      this.assertCanTarget(actor, {
        targetLgaId: existing.targetLgaId,
        targetWardId: existing.targetWardId,
        targetPollingUnitId: existing.targetPollingUnitId,
      });
    }

    if (dto.startTime && dto.endTime && new Date(dto.endTime) <= new Date(dto.startTime)) {
      throw new BadRequestException('End time must be after start time.');
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        location: dto.location,
        ...target,
      },
      include: EVENT_INCLUDE,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.EVENT_UPDATED,
      entityType: 'Event',
      entityId: event.id,
    });

    return event;
  }

  async updateStatus(id: string, dto: UpdateEventStatusDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);
    if (!TOP_LEVEL_ADMINS.includes(actor.role)) {
      this.assertCanTarget(actor, {
        targetLgaId: existing.targetLgaId,
        targetWardId: existing.targetWardId,
        targetPollingUnitId: existing.targetPollingUnitId,
      });
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: { status: dto.status },
      include: EVENT_INCLUDE,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.EVENT_STATUS_CHANGED,
      entityType: 'Event',
      entityId: event.id,
      metadata: { from: existing.status, to: dto.status },
    });

    return event;
  }
}
