import { Injectable } from '@nestjs/common';
import { EventStatus, MemberStatus, Prisma, ResourceTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { memberScopeToSql } from '../common/scope/member-scope-sql';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const MEMBER_STATUSES: MemberStatus[] = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
const EVENT_STATUSES: EventStatus[] = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
  ) {}

  // ---- Membership ----

  async getMembershipReport(actor: AuthenticatedUser) {
    const memberScope = this.orgScope.memberScopeWhere(actor);
    const baseWhere: Prisma.MemberWhereInput = { deletedAt: null, ...memberScope };

    const [total, byStatusCounts, lgas, wards, visibleUnits] = await Promise.all([
      this.prisma.member.count({ where: baseWhere }),
      Promise.all(
        MEMBER_STATUSES.map(async (status) => ({
          status,
          count: await this.prisma.member.count({ where: { ...baseWhere, status } }),
        })),
      ),
      this.prisma.lGA.findMany({ select: { id: true, name: true } }),
      this.prisma.ward.findMany({ select: { id: true, name: true, lgaId: true } }),
      this.orgScope.resolveVisibleUnits(actor),
    ]);

    // Restrict which units even get enumerated to ones the actor can see.
    // This matters beyond just trimming the list: `{ ...baseWhere, lgaId }`
    // below only stays correct because every remaining `lgaId`/`wardId` is
    // consistent with the actor's own scope — for an unfiltered list, a
    // scoped actor's own constraint (e.g. wardId) would be silently
    // *overwritten* by the loop's same-named key for every other unit,
    // leaking counts the actor isn't supposed to see.
    const visibleLgas =
      visibleUnits.lgaIds === 'ALL' ? lgas : lgas.filter((l) => visibleUnits.lgaIds.includes(l.id));
    const visibleWards =
      visibleUnits.wardIds === 'ALL'
        ? wards
        : wards.filter((w) => visibleUnits.wardIds.includes(w.id));

    // Small, bounded lists for a single senatorial district — counting per
    // unit directly is simpler and clear enough at this scale. A rollout
    // covering many more LGAs/wards should switch this to a single
    // groupBy('lgaId')/groupBy('wardId') query instead.
    const [byLga, byWard] = await Promise.all([
      Promise.all(
        visibleLgas.map(async (lga) => ({
          lgaId: lga.id,
          name: lga.name,
          total: await this.prisma.member.count({ where: { ...baseWhere, lgaId: lga.id } }),
        })),
      ),
      Promise.all(
        visibleWards.map(async (ward) => ({
          wardId: ward.id,
          name: ward.name,
          lgaId: ward.lgaId,
          total: await this.prisma.member.count({ where: { ...baseWhere, wardId: ward.id } }),
        })),
      ),
    ]);

    const scopeSql = memberScopeToSql(memberScope);
    const registrationTrend = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>(
      Prisma.sql`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as month, count(*)::bigint as count
        FROM "Member"
        WHERE "deletedAt" IS NULL AND ${scopeSql}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      `,
    );

    return {
      total,
      byStatus: byStatusCounts,
      byLga,
      byWard,
      registrationTrend: registrationTrend.map((r) => ({ month: r.month, count: Number(r.count) })).reverse(),
    };
  }

  // ---- Activities (events & attendance) ----

  async getActivityReport(actor: AuthenticatedUser) {
    const eventScope = await this.orgScope.eventScopeWhere(actor);

    const [total, byStatusCounts, totalAttendance, events] = await Promise.all([
      this.prisma.event.count({ where: eventScope }),
      Promise.all(
        EVENT_STATUSES.map(async (status) => ({
          status,
          count: await this.prisma.event.count({ where: { ...eventScope, status } }),
        })),
      ),
      this.prisma.attendance.count({ where: { event: eventScope } }),
      this.prisma.event.findMany({
        where: eventScope,
        select: {
          id: true,
          title: true,
          status: true,
          startTime: true,
          _count: { select: { attendances: true } },
        },
      }),
    ]);

    const topEvents = events
      .map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        startTime: e.startTime,
        attendanceCount: e._count.attendances,
      }))
      .sort((a, b) => b.attendanceCount - a.attendanceCount)
      .slice(0, 10);

    return { totalEvents: total, eventsByStatus: byStatusCounts, totalAttendance, topEvents };
  }

  // ---- Resources ----

  async getResourceReport(actor: AuthenticatedUser) {
    const allocationScope = this.orgScope.resourceAllocationScopeWhere(actor);

    const [resources, allocations, usageAgg] = await Promise.all([
      this.prisma.resource.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.resourceAllocation.findMany({
        where: allocationScope,
        select: {
          quantity: true,
          remainingQuantity: true,
          targetLga: { select: { id: true, name: true } },
        },
      }),
      this.prisma.resourceTransaction.aggregate({
        where: { type: ResourceTransactionType.USAGE, allocation: allocationScope },
        _sum: { quantity: true },
      }),
    ]);

    const byLga = new Map<string, { lgaId: string; name: string; totalAllocated: number; totalRemaining: number }>();
    for (const a of allocations) {
      const entry = byLga.get(a.targetLga.id) ?? {
        lgaId: a.targetLga.id,
        name: a.targetLga.name,
        totalAllocated: 0,
        totalRemaining: 0,
      };
      entry.totalAllocated += a.quantity;
      entry.totalRemaining += a.remainingQuantity;
      byLga.set(a.targetLga.id, entry);
    }

    return {
      resources: resources.map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        totalQuantity: r.totalQuantity,
        allocatedQuantity: r.totalQuantity - r.remainingQuantity,
        remainingQuantity: r.remainingQuantity,
      })),
      allocationsByLga: [...byLga.values()],
      totalUsage: usageAgg._sum.quantity ?? 0,
    };
  }

  // ---- Distributions ----

  async getDistributionReport(actor: AuthenticatedUser) {
    const allocationScope = this.orgScope.resourceAllocationScopeWhere(actor);

    const distributions = await this.prisma.distribution.findMany({
      include: { resource: { select: { name: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = await Promise.all(
      distributions.map(async (d) => {
        const allocations = await this.prisma.resourceAllocation.findMany({
          where: { distributionId: d.id, ...allocationScope },
          select: { quantity: true, remainingQuantity: true },
        });
        const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0);
        const totalRemaining = allocations.reduce((sum, a) => sum + a.remainingQuantity, 0);

        const recipientCount = await this.prisma.distributionReceipt.count({
          where: { distributionId: d.id, status: 'CONFIRMED', allocation: allocationScope },
        });

        return {
          id: d.id,
          title: d.title,
          status: d.status,
          resourceName: d.resource.name,
          unit: d.resource.unit,
          totalAllocated,
          totalDistributed: totalAllocated - totalRemaining,
          totalRemaining,
          recipientCount,
        };
      }),
    );

    const receipts = await this.prisma.distributionReceipt.findMany({
      where: { status: 'CONFIRMED', allocation: allocationScope },
      select: { allocation: { select: { targetLga: { select: { id: true, name: true } } } } },
    });

    const byLga = new Map<string, { lgaId: string; name: string; count: number }>();
    for (const r of receipts) {
      const entry = byLga.get(r.allocation.targetLga.id) ?? {
        lgaId: r.allocation.targetLga.id,
        name: r.allocation.targetLga.name,
        count: 0,
      };
      entry.count += 1;
      byLga.set(r.allocation.targetLga.id, entry);
    }

    return { distributions: summaries, receiptsByLga: [...byLga.values()] };
  }
}
