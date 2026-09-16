import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { MembershipIdService } from './membership-id.service';
import { QrService } from '../qr/qr.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto, UpdateMemberStatusDto } from './dto/query-member.dto';

const MEMBER_LIST_SELECT = {
  id: true,
  membershipId: true,
  firstName: true,
  middleName: true,
  surname: true,
  gender: true,
  phone: true,
  status: true,
  photoUrl: true,
  dateJoined: true,
  lga: { select: { id: true, name: true, senatorialDistrict: { select: { id: true, name: true } } } },
  ward: { select: { id: true, name: true } },
  pollingUnit: { select: { id: true, name: true } },
} satisfies Prisma.MemberSelect;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
    private readonly membershipIdService: MembershipIdService,
    private readonly qrService: QrService,
  ) {}

  async create(dto: CreateMemberDto, actor: AuthenticatedUser) {
    const pollingUnit = await this.prisma.pollingUnit.findUniqueOrThrow({
      where: { id: dto.pollingUnitId },
      select: {
        id: true,
        wardId: true,
        ward: { select: { lgaId: true, lga: { select: { senatorialDistrict: { select: { name: true } } } } } },
      },
    });

    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: pollingUnit.ward.lgaId,
      wardId: pollingUnit.wardId,
      pollingUnitId: pollingUnit.id,
    });

    const membershipId = await this.membershipIdService.next(pollingUnit.ward.lga.senatorialDistrict.name);

    const member = await this.prisma.member.create({
      data: {
        membershipId,
        firstName: dto.firstName,
        middleName: dto.middleName,
        surname: dto.surname,
        gender: dto.gender,
        dateOfBirth: new Date(dto.dateOfBirth),
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        occupation: dto.occupation,
        photoUrl: dto.photoUrl,
        pollingUnitId: pollingUnit.id,
        wardId: pollingUnit.wardId,
        lgaId: pollingUnit.ward.lgaId,
        status: 'PENDING',
        createdById: actor.id,
      },
    });

    await this.qrService.issueForMember(member.id);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_CREATED,
      entityType: 'Member',
      entityId: member.id,
      metadata: { membershipId: member.membershipId },
    });

    return member;
  }

  async findAll(query: QueryMemberDto, actor: AuthenticatedUser) {
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '25', 10) || 25, 1), 100);

    const scopeWhere = this.orgScope.memberScopeWhere(actor);

    // Query-supplied filters live in their own object and are combined with
    // scopeWhere via `AND`, never a flat spread — a flat spread would let a
    // query param with the same key (e.g. `lgaId`) silently *overwrite*
    // scopeWhere's restriction instead of narrowing it, which would let a
    // scoped actor (e.g. an LGA_ADMIN) view another LGA just by passing a
    // different id in the URL.
    const queryFilters: Prisma.MemberWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.senatorialDistrictId
        ? { lga: { senatorialDistrictId: query.senatorialDistrictId } }
        : {}),
      ...(query.lgaId ? { lgaId: query.lgaId } : {}),
      ...(query.wardId ? { wardId: query.wardId } : {}),
      ...(query.pollingUnitId ? { pollingUnitId: query.pollingUnitId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { surname: { contains: query.search, mode: 'insensitive' } },
              { middleName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { membershipId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const filters: Prisma.MemberWhereInput = {
      deletedAt: null,
      AND: [scopeWhere, queryFilters],
    };

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where: filters,
        select: MEMBER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.member.count({ where: filters }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const member = await this.prisma.member.findFirst({
      where: { id, deletedAt: null },
      include: {
        lga: true,
        ward: true,
        pollingUnit: true,
        qrCode: { select: { status: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found.');

    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: member.lgaId,
      wardId: member.wardId,
      pollingUnitId: member.pollingUnitId,
    });

    return member;
  }

  async update(id: string, dto: UpdateMemberDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);

    let orgFields: { pollingUnitId?: string; wardId?: string; lgaId?: string } = {};
    if (dto.pollingUnitId && dto.pollingUnitId !== existing.pollingUnitId) {
      const pollingUnit = await this.prisma.pollingUnit.findUniqueOrThrow({
        where: { id: dto.pollingUnitId },
        select: { id: true, wardId: true, ward: { select: { lgaId: true } } },
      });
      await this.orgScope.assertCanAccessOrgUnit(actor, {
        lgaId: pollingUnit.ward.lgaId,
        wardId: pollingUnit.wardId,
        pollingUnitId: pollingUnit.id,
      });
      orgFields = {
        pollingUnitId: pollingUnit.id,
        wardId: pollingUnit.wardId,
        lgaId: pollingUnit.ward.lgaId,
      };
    }

    const member = await this.prisma.member.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        middleName: dto.middleName,
        surname: dto.surname,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        occupation: dto.occupation,
        photoUrl: dto.photoUrl,
        ...orgFields,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_UPDATED,
      entityType: 'Member',
      entityId: member.id,
    });

    return member;
  }

  async updateStatus(id: string, dto: UpdateMemberStatusDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);

    const member = await this.prisma.member.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_STATUS_CHANGED,
      entityType: 'Member',
      entityId: member.id,
      metadata: { from: existing.status, to: dto.status },
    });

    return member;
  }

  async getQrImage(id: string, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.qrService.getQrImageForMember(id);
  }
}
