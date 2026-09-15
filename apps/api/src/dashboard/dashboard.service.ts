import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { memberScopeToSql } from '../common/scope/member-scope-sql';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
  ) {}

  async getStats(actor: AuthenticatedUser) {
    const memberScope = { deletedAt: null, ...this.orgScope.memberScopeWhere(actor) };
    const eventScope = await this.orgScope.eventScopeWhere(actor);

    const [totalMembers, activeMembers, pendingMembers, lgas, wards, pollingUnits, upcomingEvents] =
      await Promise.all([
        this.prisma.member.count({ where: memberScope }),
        this.prisma.member.count({ where: { ...memberScope, status: 'ACTIVE' } }),
        this.prisma.member.count({ where: { ...memberScope, status: 'PENDING' } }),
        this.prisma.lGA.count(),
        this.prisma.ward.count(),
        this.prisma.pollingUnit.count(),
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
    };
  }
}
