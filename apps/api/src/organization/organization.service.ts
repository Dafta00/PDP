import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateLgaDto,
  CreatePollingUnitDto,
  CreateSenatorialDistrictDto,
  CreateStateDto,
  CreateWardDto,
  RenameDto,
} from './dto/org-unit.dto';

// Genuinely state-wide — every other role sees only its own subtree, enforced
// below (not just in the UI). SENATORIAL_ADMIN is deliberately excluded: it
// is scoped to exactly one district via assertDistrictScope/assertLgaScope.
const TOP_LEVEL_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN];

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
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
  listDistricts(stateId?: string, user?: AuthenticatedUser) {
    const where: Prisma.SenatorialDistrictWhereInput = stateId ? { stateId } : {};
    if (user && user.role === Role.SENATORIAL_ADMIN) {
      Object.assign(where, { id: user.senatorialDistrictId ?? '__none__' });
    }
    return this.prisma.senatorialDistrict.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createDistrict(dto: CreateSenatorialDistrictDto, actorId: string) {
    const district = await this.prisma.senatorialDistrict.create({
      data: { name: dto.name, stateId: dto.stateId },
    });
    await this.audit(actorId, 'SenatorialDistrict', district.id, { name: district.name });
    return district;
  }

  // ---- LGAs ----
  async listLgas(senatorialDistrictId?: string, user?: AuthenticatedUser) {
    const where: Prisma.LGAWhereInput = senatorialDistrictId ? { senatorialDistrictId } : {};
    if (user) {
      const visible = await this.orgScope.resolveVisibleUnits(user);
      if (visible.lgaIds !== 'ALL') Object.assign(where, { id: { in: visible.lgaIds } });
    }
    return this.prisma.lGA.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createLga(dto: CreateLgaDto, actor: AuthenticatedUser) {
    // LGAs are fixed, official divisions (11 for the whole state) — creating
    // one is state-level only, unlike wards/polling units which routinely
    // need local data entry from district/LGA/ward administrators.
    if (!TOP_LEVEL_ADMINS.includes(actor.role)) {
      throw new ForbiddenException('Only state-level administrators can create an LGA.');
    }
    const lga = await this.prisma.lGA.create({
      data: { name: dto.name, senatorialDistrictId: dto.senatorialDistrictId },
    });
    await this.audit(actor.id, 'LGA', lga.id, { name: lga.name });
    return lga;
  }

  // ---- Wards ----
  async listWards(lgaId?: string, user?: AuthenticatedUser) {
    const where: Prisma.WardWhereInput = lgaId ? { lgaId } : {};
    if (user) {
      const visible = await this.orgScope.resolveVisibleUnits(user);
      if (visible.wardIds !== 'ALL') Object.assign(where, { id: { in: visible.wardIds } });
    }
    return this.prisma.ward.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createWard(dto: CreateWardDto, actor: AuthenticatedUser) {
    await this.assertLgaScope(actor, dto.lgaId);
    const ward = await this.prisma.ward.create({ data: { name: dto.name, lgaId: dto.lgaId } });
    await this.audit(actor.id, 'Ward', ward.id, { name: ward.name });
    return ward;
  }

  async renameWard(id: string, dto: RenameDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ward.findUniqueOrThrow({ where: { id } });
    await this.assertLgaScope(actor, existing.lgaId);
    const ward = await this.prisma.ward.update({ where: { id }, data: { name: dto.name } });
    await this.audit(actor.id, 'Ward', ward.id, { renamedTo: ward.name }, 'ORG_UNIT_UPDATED');
    return ward;
  }

  // ---- Polling Units ----
  async listPollingUnits(wardId?: string, user?: AuthenticatedUser) {
    const where: Prisma.PollingUnitWhereInput = wardId ? { wardId } : {};
    if (user) {
      if (user.role === Role.POLLING_UNIT_OFFICER) {
        Object.assign(where, { id: user.pollingUnitId ?? '__none__' });
      } else {
        const visible = await this.orgScope.resolveVisibleUnits(user);
        if (visible.wardIds !== 'ALL') Object.assign(where, { wardId: { in: visible.wardIds } });
      }
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

  private async assertLgaScope(actor: AuthenticatedUser, lgaId: string) {
    if (TOP_LEVEL_ADMINS.includes(actor.role)) return;
    if (actor.role === Role.LGA_ADMIN && actor.lgaId === lgaId) return;
    if (actor.role === Role.SENATORIAL_ADMIN && actor.senatorialDistrictId) {
      const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId }, select: { senatorialDistrictId: true } });
      if (lga?.senatorialDistrictId === actor.senatorialDistrictId) return;
    }
    throw new ForbiddenException('This LGA is outside your assigned scope.');
  }

  private async assertWardScope(actor: AuthenticatedUser, wardId: string) {
    if (TOP_LEVEL_ADMINS.includes(actor.role)) return;
    if (actor.role === Role.WARD_ADMIN && actor.wardId === wardId) return;
    if (actor.role === Role.LGA_ADMIN && actor.lgaId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
      if (ward?.lgaId === actor.lgaId) return;
    }
    if (actor.role === Role.SENATORIAL_ADMIN && actor.senatorialDistrictId) {
      const ward = await this.prisma.ward.findUnique({
        where: { id: wardId },
        select: { lga: { select: { senatorialDistrictId: true } } },
      });
      if (ward?.lga.senatorialDistrictId === actor.senatorialDistrictId) return;
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
