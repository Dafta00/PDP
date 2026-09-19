import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { decryptField, encryptField, hashForLookup } from '../common/crypto/field-encryption';
import { normalizeNigerianPhone, normalizeNin, normalizePvc } from '../common/utils/identity-normalization';
import { MembershipIdService } from './membership-id.service';
import { QrService } from '../qr/qr.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto, UpdateMemberStatusDto } from './dto/query-member.dto';

const DUPLICATE_NIN_MESSAGE = 'Registration failed: This NIN is already associated with another member.';
const DUPLICATE_PVC_MESSAGE = 'Registration failed: This PVC identifier is already associated with another member.';

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
  educationLevel: true,
  dateJoined: true,
  lga: { select: { id: true, name: true, senatorialDistrict: { select: { id: true, name: true } } } },
  ward: { select: { id: true, name: true } },
  pollingUnit: { select: { id: true, name: true } },
} satisfies Prisma.MemberSelect;

// Never selects ninEncrypted/ninHash directly into a plain object that could
// be spread verbatim into a response — shapeMemberDetail is the only place
// that reads those two columns, and only to derive `hasNin`/decrypt `nin`.

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
    private readonly authorization: AuthorizationService,
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

    const { ninEncrypted, ninHash } = await this.prepareNin(dto.nin, actor);
    const pvcNumber = await this.preparePvc(dto.pvcNumber, actor);

    const membershipId = await this.membershipIdService.next(pollingUnit.ward.lga.senatorialDistrict.name);

    let member;
    try {
      member = await this.prisma.member.create({
        data: {
          membershipId,
          firstName: dto.firstName,
          middleName: dto.middleName,
          surname: dto.surname,
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          phone: normalizeNigerianPhone(dto.phone),
          email: dto.email,
          address: dto.address,
          occupation: dto.occupation,
          educationLevel: dto.educationLevel,
          educationLevelOther: dto.educationLevel === 'OTHER' ? dto.educationLevelOther : null,
          ninEncrypted,
          ninHash,
          pvcNumber,
          photoUrl: dto.photoUrl,
          pollingUnitId: pollingUnit.id,
          wardId: pollingUnit.wardId,
          lgaId: pollingUnit.ward.lgaId,
          status: 'PENDING',
          createdById: actor.id,
        },
      });
    } catch (error) {
      throw await this.translateUniqueConstraintError(error, actor);
    }

    await this.qrService.issueForMember(member.id);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_CREATED,
      entityType: 'Member',
      entityId: member.id,
      metadata: { membershipId: member.membershipId, hasNin: !!ninHash, hasPvc: !!pvcNumber },
    });

    return this.shapeMemberDetail(member, actor);
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
      ...(query.educationLevel ? { educationLevel: query.educationLevel } : {}),
      ...(query.pvcNumber ? { pvcNumber: normalizePvc(query.pvcNumber) } : {}),
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
        lga: { include: { senatorialDistrict: { select: { id: true, name: true } } } },
        ward: true,
        pollingUnit: true,
        qrCode: { select: { status: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found.');

    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: member.lgaId,
      wardId: member.wardId,
      pollingUnitId: member.pollingUnitId,
    });

    return this.shapeMemberDetail(member, actor);
  }

  async update(id: string, dto: UpdateMemberDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.member.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Member not found.');
    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: existing.lgaId,
      wardId: existing.wardId,
      pollingUnitId: existing.pollingUnitId,
    });

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

    let ninUpdate: { ninEncrypted?: string; ninHash?: string } = {};
    if (dto.nin) {
      ninUpdate = await this.prepareNin(dto.nin, actor, id);
    }

    let pvcUpdate: { pvcNumber?: string } = {};
    if (dto.pvcNumber) {
      const pvcNumber = await this.preparePvc(dto.pvcNumber, actor, id);
      pvcUpdate = { pvcNumber };
    }

    const photoChanged = dto.photoUrl !== undefined && dto.photoUrl !== existing.photoUrl;

    let member;
    try {
      member = await this.prisma.member.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          middleName: dto.middleName,
          surname: dto.surname,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          phone: dto.phone ? normalizeNigerianPhone(dto.phone) : undefined,
          email: dto.email,
          address: dto.address,
          occupation: dto.occupation,
          educationLevel: dto.educationLevel,
          educationLevelOther:
            dto.educationLevel === undefined
              ? undefined
              : dto.educationLevel === 'OTHER'
                ? dto.educationLevelOther
                : null,
          ...ninUpdate,
          ...pvcUpdate,
          photoUrl: dto.photoUrl,
          ...orgFields,
        },
      });
    } catch (error) {
      throw await this.translateUniqueConstraintError(error, actor, id);
    }

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.MEMBER_UPDATED,
      entityType: 'Member',
      entityId: member.id,
    });

    if (photoChanged) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MEMBER_PHOTO_CHANGED,
        entityType: 'Member',
        entityId: member.id,
      });
    }

    return this.shapeMemberDetail(member, actor);
  }

  async updateStatus(id: string, dto: UpdateMemberStatusDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.member.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Member not found.');
    await this.orgScope.assertCanAccessOrgUnit(actor, {
      lgaId: existing.lgaId,
      wardId: existing.wardId,
      pollingUnitId: existing.pollingUnitId,
    });

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

    return this.shapeMemberDetail(member, actor);
  }

  async getQrImage(id: string, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.qrService.getQrImageForMember(id);
  }

  // ─────────────────────────── NIN / PVC handling ───────────────────────────

  private async prepareNin(
    rawNin: string | undefined,
    actor: AuthenticatedUser,
    excludeMemberId?: string,
  ): Promise<{ ninEncrypted?: string; ninHash?: string }> {
    if (!rawNin) return {};
    const normalized = normalizeNin(rawNin);
    const ninHash = hashForLookup(normalized);

    // Checked even against soft-deleted/inactive members — a deactivated
    // member's NIN is never silently freed up for reuse by someone else.
    const existing = await this.prisma.member.findFirst({
      where: { ninHash, ...(excludeMemberId ? { NOT: { id: excludeMemberId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MEMBER_DUPLICATE_NIN_ATTEMPT,
        entityType: 'Member',
        entityId: excludeMemberId ?? null,
      });
      throw new ConflictException(DUPLICATE_NIN_MESSAGE);
    }

    return { ninEncrypted: encryptField(normalized), ninHash };
  }

  private async preparePvc(
    rawPvc: string | undefined,
    actor: AuthenticatedUser,
    excludeMemberId?: string,
  ): Promise<string | undefined> {
    if (!rawPvc) return undefined;
    const pvcNumber = normalizePvc(rawPvc);

    const existing = await this.prisma.member.findFirst({
      where: { pvcNumber, ...(excludeMemberId ? { NOT: { id: excludeMemberId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MEMBER_DUPLICATE_PVC_ATTEMPT,
        entityType: 'Member',
        entityId: excludeMemberId ?? null,
      });
      throw new ConflictException(DUPLICATE_PVC_MESSAGE);
    }

    return pvcNumber;
  }

  /** Final race-condition backstop: the pre-checks above narrow the window, but only the DB unique index is authoritative. */
  private async translateUniqueConstraintError(
    error: unknown,
    actor: AuthenticatedUser,
    excludeMemberId?: string,
  ): Promise<Error> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target;
      const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
      if (targetStr.includes('ninHash')) {
        await this.auditService.record({
          actorId: actor.id,
          action: AuditAction.MEMBER_DUPLICATE_NIN_ATTEMPT,
          entityType: 'Member',
          entityId: excludeMemberId ?? null,
          metadata: { race: true },
        });
        return new ConflictException(DUPLICATE_NIN_MESSAGE);
      }
      if (targetStr.includes('pvcNumber')) {
        await this.auditService.record({
          actorId: actor.id,
          action: AuditAction.MEMBER_DUPLICATE_PVC_ATTEMPT,
          entityType: 'Member',
          entityId: excludeMemberId ?? null,
          metadata: { race: true },
        });
        return new ConflictException(DUPLICATE_PVC_MESSAGE);
      }
    }
    return error as Error;
  }

  // ─────────────────────────── Response shaping ────────────────────────────

  /**
   * The single place that decides whether a decrypted NIN reaches the
   * response. `ninEncrypted`/`ninHash` are always stripped from the output;
   * `nin` is only ever attached when AuthorizationService.canViewMemberNIN
   * passes, and every time it is, that reveal is audit-logged. Every
   * create/findOne/update/updateStatus response goes through this — do not
   * add a second path that returns a raw Prisma Member row.
   */
  private async shapeMemberDetail(
    member: { ninEncrypted: string | null; ninHash: string | null } & Record<string, unknown>,
    actor: AuthenticatedUser,
  ) {
    const { ninEncrypted, ninHash, ...rest } = member;
    const canViewNin = this.authorization.canViewMemberNIN(actor);

    let nin: string | undefined;
    if (canViewNin && ninEncrypted) {
      nin = decryptField(ninEncrypted);
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.MEMBER_NIN_VIEWED,
        entityType: 'Member',
        entityId: (member as { id?: string }).id ?? null,
      });
    }

    return {
      ...rest,
      hasNin: !!ninHash,
      ...(canViewNin ? { nin: nin ?? null } : {}),
    };
  }
}
