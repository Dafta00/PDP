import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateLgaDto,
  CreatePollingUnitDto,
  CreateSenatorialDistrictDto,
  CreateStateDto,
  CreateWardDto,
  RenameDto,
} from './dto/org-unit.dto';

const TOP_LEVEL_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---- States ----
  listStates() {
    return this.prisma.state.findMany({ orderBy: { name: 'asc' } });
  }

  async createState(dto: CreateStateDto, actorId: string) {
    const state = await this.prisma.state.create({ data: { name: dto.name } });
    await this.audit(actorId, 'State', state.id, { name: state.name });
    return state;
  }

  // ---- Senatorial Districts ----
  listDistricts(stateId?: string) {
    return this.prisma.senatorialDistrict.findMany({
      where: stateId ? { stateId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createDistrict(dto: CreateSenatorialDistrictDto, actorId: string) {
    const district = await this.prisma.senatorialDistrict.create({
      data: { name: dto.name, stateId: dto.stateId },
    });
    await this.audit(actorId, 'SenatorialDistrict', district.id, { name: district.name });
    return district;
  }

  // ---- LGAs ----
  listLgas(senatorialDistrictId?: string) {
    return this.prisma.lGA.findMany({
      where: senatorialDistrictId ? { senatorialDistrictId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createLga(dto: CreateLgaDto, actorId: string) {
    const lga = await this.prisma.lGA.create({
      data: { name: dto.name, senatorialDistrictId: dto.senatorialDistrictId },
    });
    await this.audit(actorId, 'LGA', lga.id, { name: lga.name });
    return lga;
  }

  // ---- Wards ----
  listWards(lgaId?: string, user?: AuthenticatedUser) {
    const where = { ...(lgaId ? { lgaId } : {}) };
    if (user?.role === Role.LGA_ADMIN && user.lgaId) {
      Object.assign(where, { lgaId: user.lgaId });
    }
    return this.prisma.ward.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createWard(dto: CreateWardDto, actor: AuthenticatedUser) {
    this.assertLgaScope(actor, dto.lgaId);
    const ward = await this.prisma.ward.create({ data: { name: dto.name, lgaId: dto.lgaId } });
    await this.audit(actor.id, 'Ward', ward.id, { name: ward.name });
    return ward;
  }

  async renameWard(id: string, dto: RenameDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ward.findUniqueOrThrow({ where: { id } });
    this.assertLgaScope(actor, existing.lgaId);
    const ward = await this.prisma.ward.update({ where: { id }, data: { name: dto.name } });
    await this.audit(actor.id, 'Ward', ward.id, { renamedTo: ward.name }, 'ORG_UNIT_UPDATED');
    return ward;
  }

  // ---- Polling Units ----
  listPollingUnits(wardId?: string, user?: AuthenticatedUser) {
    const where = { ...(wardId ? { wardId } : {}) };
    if (user?.role === Role.WARD_ADMIN && user.wardId) {
      Object.assign(where, { wardId: user.wardId });
    }
    return this.prisma.pollingUnit.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createPollingUnit(dto: CreatePollingUnitDto, actor: AuthenticatedUser) {
    await this.assertWardScope(actor, dto.wardId);
    const unit = await this.prisma.pollingUnit.create({
      data: { name: dto.name, code: dto.code, wardId: dto.wardId },
    });
    await this.audit(actor.id, 'PollingUnit', unit.id, { name: unit.name });
    return unit;
  }

  async renamePollingUnit(id: string, dto: RenameDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.pollingUnit.findUniqueOrThrow({ where: { id } });
    await this.assertWardScope(actor, existing.wardId);
    const unit = await this.prisma.pollingUnit.update({ where: { id }, data: { name: dto.name } });
    await this.audit(actor.id, 'PollingUnit', unit.id, { renamedTo: unit.name }, 'ORG_UNIT_UPDATED');
    return unit;
  }

  private assertLgaScope(actor: AuthenticatedUser, lgaId: string) {
    if (TOP_LEVEL_ADMINS.includes(actor.role)) return;
    if (actor.role === Role.LGA_ADMIN && actor.lgaId === lgaId) return;
    throw new ForbiddenException('This LGA is outside your assigned scope.');
  }

  private async assertWardScope(actor: AuthenticatedUser, wardId: string) {
    if (TOP_LEVEL_ADMINS.includes(actor.role)) return;
    if (actor.role === Role.WARD_ADMIN && actor.wardId === wardId) return;
    if (actor.role === Role.LGA_ADMIN && actor.lgaId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
      if (ward?.lgaId === actor.lgaId) return;
    }
    throw new ForbiddenException('This ward is outside your assigned scope.');
  }

  private async audit(
    actorId: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
    action: AuditAction | string = AuditAction.ORG_UNIT_CREATED,
  ) {
    await this.auditService.record({ actorId, action, entityType, entityId, metadata });
  }
}
