import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SCOPE_REQUIREMENTS: Partial<Record<Role, 'lgaId' | 'wardId' | 'pollingUnitId'>> = {
  [Role.LGA_ADMIN]: 'lgaId',
  [Role.WARD_ADMIN]: 'wardId',
  [Role.POLLING_UNIT_OFFICER]: 'pollingUnitId',
};

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  lgaId: true,
  wardId: true,
  pollingUnitId: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string) {
    this.assertScopeMatchesRole(dto.role, dto);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        lgaId: dto.lgaId,
        wardId: dto.wardId,
        pollingUnitId: dto.pollingUnitId,
      },
      select: SAFE_SELECT,
    });

    await this.auditService.record({
      actorId,
      action: AuditAction.USER_CREATED,
      entityType: 'User',
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    return user;
  }

  async findAll(params: { skip: number; take: number }) {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const nextRole = dto.role ?? existing.role;

    this.assertScopeMatchesRole(nextRole, {
      lgaId: dto.lgaId ?? existing.lgaId ?? undefined,
      wardId: dto.wardId ?? existing.wardId ?? undefined,
      pollingUnitId: dto.pollingUnitId ?? existing.pollingUnitId ?? undefined,
    });

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        status: dto.status,
        lgaId: dto.lgaId,
        wardId: dto.wardId,
        pollingUnitId: dto.pollingUnitId,
      },
      select: SAFE_SELECT,
    });

    if (dto.role && dto.role !== existing.role) {
      await this.auditService.record({
        actorId,
        action: AuditAction.USER_ROLE_CHANGED,
        entityType: 'User',
        entityId: user.id,
        metadata: { from: existing.role, to: dto.role },
      });
    }
    if (dto.status && dto.status !== existing.status) {
      await this.auditService.record({
        actorId,
        action: AuditAction.USER_STATUS_CHANGED,
        entityType: 'User',
        entityId: user.id,
        metadata: { from: existing.status, to: dto.status },
      });
    }
    await this.auditService.record({
      actorId,
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  private assertScopeMatchesRole(
    role: Role,
    target: { lgaId?: string; wardId?: string; pollingUnitId?: string },
  ) {
    const requiredField = SCOPE_REQUIREMENTS[role];
    if (requiredField && !target[requiredField]) {
      throw new BadRequestException(
        `A ${role.replaceAll('_', ' ').toLowerCase()} must be assigned a ${requiredField.replace('Id', '')}.`,
      );
    }
  }
}
