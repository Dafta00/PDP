import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { memberScopeToSql } from '../common/scope/member-scope-sql';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const UNRESTRICTED_ROLES: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
  ) {}

  async getStats(actor: AuthenticatedUser) {
    const memberScope = { deletedAt: null, ...this.orgScope.memberScopeWhere(actor) };
    const eventScope = await this.orgScope.eventScopeWhere(actor);
    const visibleUnits = await this.orgScope.resolveVisibleUnits(actor);

    const [totalMembers, activeMembers, pendingMembers, lgas, wards, pollingUnits, upcomingEvents] =
      await Promise.all([
        this.prisma.member.count({ where: memberScope }),
        this.prisma.member.count({ where: { ...memberScope, status: 'ACTIVE' } }),
        this.prisma.member.count({ where: { ...memberScope, status: 'PENDING' } }),
        this.prisma.lGA.count(visibleUnits.lgaIds === 'ALL' ? undefined : { where: { id: { in: visibleUnits.lgaIds } } }),
        this.prisma.ward.count(visibleUnits.wardIds === 'ALL' ? undefined : { where: { id: { in: visibleUnits.wardIds } } }),
        this.prisma.pollingUnit.count(
          visibleUnits.wardIds === 'ALL' ? undefined : { where: { wardId: { in: visibleUnits.wardIds } } },
        ),
        this.prisma.event.count({
          where: { ...eventScope, status: { in: ['UPCOMING', 'ACTIVE'] } },
        }),
      ]);

    const scopeSql = memberScopeToSql(this.orgScope.memberScopeWhere(actor));
    const registrationsByMonth = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>(
      Prisma.sql`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as month, count(*)::bigint as count
        FROM "Member"
        WHERE "deletedAt" IS NULL AND ${scopeSql}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 6
      `,
    );

    const districtBreakdown = UNRESTRICTED_ROLES.includes(actor.role)
      ? await this.getDistrictBreakdown()
      : [];

    return {
      totalMembers,
      activeMembers,
      pendingMembers,
      lgas,
      wards,
      pollingUnits,
      upcomingEvents,
      registrationTrend: registrationsByMonth
        .map((r) => ({ month: r.month, count: Number(r.count) }))
        .reverse(),
      districtBreakdown,
    };
  }

  /** State Overview tiles for SUPER_ADMIN/STATE_ADMIN — one row per senatorial district. */
  private async getDistrictBreakdown() {
    const districts = await this.prisma.senatorialDistrict.findMany({
      select: { id: true, name: true, lgas: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      districts.map(async (district) => {
        const lgaIds = district.lgas.map((l) => l.id);
        const totalMembers = await this.prisma.member.count({
          where: { deletedAt: null, lgaId: { in: lgaIds } },
        });
        return {
          id: district.id,
          name: district.name,
          lgaCount: district.lgas.length,
          totalMembers,
        };
      }),
    );
  }
}
