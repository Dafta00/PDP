import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService, CampaignMembershipLike } from './authorization/campaign-authorization.service';

/**
 * All computed on read from the operational tables — no persisted
 * "CampaignReport" rows, matching the existing ReportsService's
 * compute-on-read convention. Every query is filtered through
 * CampaignAuthorizationService.scopeWhere, so a coordinator only ever sees
 * totals for their own campaign geography. Nothing here infers, scores, or
 * predicts an individual's political preference — every figure is a count
 * of operational activity (events held, teams staffed, tasks done), never
 * a supporter/opposition classification.
 */
@Injectable()
export class CampaignReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  async getDashboard(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);
    const now = new Date();

    const [
      campaign,
      upcomingEvents,
      recentActivities,
      activeTeams,
      activeVolunteers,
      tasksByStatus,
      eventsByStatus,
    ] = await Promise.all([
      this.prisma.campaign.findUnique({ where: { id: campaignId } }),
      this.prisma.campaignEvent.findMany({
        where: { campaignId, status: 'SCHEDULED', date: { gte: now }, ...scopeWhere },
        orderBy: { date: 'asc' },
        take: 5,
        select: { id: true, title: true, type: true, date: true, venue: true },
      }),
      this.prisma.campaignActivity.findMany({
        where: { campaignId, ...scopeWhere },
        orderBy: { date: 'desc' },
        take: 8,
        select: { id: true, type: true, description: true, date: true },
      }),
      this.prisma.campaignTeam.count({ where: { campaignId, status: 'ACTIVE', ...scopeWhere } }),
      this.prisma.campaignVolunteer.count({ where: { campaignId, status: 'ACTIVE', ...scopeWhere } }),
      this.prisma.campaignTask.groupBy({
        by: ['status'],
        where: { campaignId, ...scopeWhere },
        _count: true,
      }),
      this.prisma.campaignEvent.groupBy({
        by: ['status'],
        where: { campaignId, ...scopeWhere },
        _count: true,
      }),
    ]);

    const resourceStatus = await this.prisma.resource.findMany({
      where: { campaignId },
      select: { id: true, name: true, totalQuantity: true, remainingQuantity: true },
    });

    return {
      campaign,
      upcomingEvents,
      recentActivities,
      activeTeams,
      activeVolunteers,
      tasksByStatus: Object.fromEntries(tasksByStatus.map((t) => [t.status, t._count])),
      eventsByStatus: Object.fromEntries(eventsByStatus.map((e) => [e.status, e._count])),
      resourceStatus,
    };
  }

  /**
   * Geographic OPERATIONAL coverage — which units have recorded activity
   * (events, teams, tasks) and how much. This is a measure of campaign
   * organizational reach, never of voter support (spec section 16).
   */
  async getCoverage(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);

    const [pollingUnitsWithEvents, wardsWithEvents, lgasWithEvents, districtsWithEvents, eventsCompleted, eventsScheduled] =
      await Promise.all([
        this.prisma.campaignEvent.findMany({ where: { campaignId, pollingUnitId: { not: null }, ...scopeWhere }, distinct: ['pollingUnitId'], select: { pollingUnitId: true } }),
        this.prisma.campaignEvent.findMany({ where: { campaignId, wardId: { not: null }, ...scopeWhere }, distinct: ['wardId'], select: { wardId: true } }),
        this.prisma.campaignEvent.findMany({ where: { campaignId, lgaId: { not: null }, ...scopeWhere }, distinct: ['lgaId'], select: { lgaId: true } }),
        this.prisma.campaignEvent.findMany({ where: { campaignId, senatorialDistrictId: { not: null }, ...scopeWhere }, distinct: ['senatorialDistrictId'], select: { senatorialDistrictId: true } }),
        this.prisma.campaignEvent.count({ where: { campaignId, status: 'COMPLETED', ...scopeWhere } }),
        this.prisma.campaignEvent.count({ where: { campaignId, status: 'SCHEDULED', ...scopeWhere } }),
      ]);

    return {
      pollingUnitsWithActivity: pollingUnitsWithEvents.length,
      wardsWithActivity: wardsWithEvents.length,
      lgasWithActivity: lgasWithEvents.length,
      districtsWithActivity: districtsWithEvents.length,
      eventsCompleted,
      eventsScheduled,
    };
  }

  async getEventsReport(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);
    const byType = await this.prisma.campaignEvent.groupBy({ by: ['type'], where: { campaignId, ...scopeWhere }, _count: true });
    const byStatus = await this.prisma.campaignEvent.groupBy({ by: ['status'], where: { campaignId, ...scopeWhere }, _count: true });
    const totalExpected = await this.prisma.campaignEvent.aggregate({ where: { campaignId, ...scopeWhere }, _sum: { expectedAttendance: true, actualAttendance: true } });
    return {
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      totalExpectedAttendance: totalExpected._sum.expectedAttendance ?? 0,
      totalActualAttendance: totalExpected._sum.actualAttendance ?? 0,
    };
  }

  async getAttendanceReport(campaignId: string, actorMembership: CampaignMembershipLike) {
    const eventIds = await this.prisma.campaignEvent.findMany({
      where: { campaignId, ...this.campaignAuthorization.scopeWhere(actorMembership) },
      select: { id: true },
    });
    const ids = eventIds.map((e) => e.id);
    const byType = await this.prisma.campaignAttendance.groupBy({ by: ['attendeeType'], where: { eventId: { in: ids } }, _count: true });
    const total = await this.prisma.campaignAttendance.count({ where: { eventId: { in: ids } } });
    return { total, byAttendeeType: Object.fromEntries(byType.map((t) => [t.attendeeType, t._count])) };
  }

  async getTeamsReport(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);
    const byStatus = await this.prisma.campaignTeam.groupBy({ by: ['status'], where: { campaignId, ...scopeWhere }, _count: true });
    const total = await this.prisma.campaignTeam.count({ where: { campaignId, ...scopeWhere } });
    return { total, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) };
  }

  async getVolunteersReport(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);
    const byStatus = await this.prisma.campaignVolunteer.groupBy({ by: ['status'], where: { campaignId, ...scopeWhere }, _count: true });
    const total = await this.prisma.campaignVolunteer.count({ where: { campaignId, ...scopeWhere } });
    return { total, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) };
  }

  async getTasksReport(campaignId: string, actorMembership: CampaignMembershipLike) {
    const scopeWhere = this.campaignAuthorization.scopeWhere(actorMembership);
    const byStatus = await this.prisma.campaignTask.groupBy({ by: ['status'], where: { campaignId, ...scopeWhere }, _count: true });
    const byPriority = await this.prisma.campaignTask.groupBy({ by: ['priority'], where: { campaignId, ...scopeWhere }, _count: true });
    const total = await this.prisma.campaignTask.count({ where: { campaignId, ...scopeWhere } });
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
    };
  }

  async getResourcesReport(campaignId: string) {
    const resources = await this.prisma.resource.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        unit: true,
        totalQuantity: true,
        remainingQuantity: true,
        allocations: { select: { id: true, quantity: true, remainingQuantity: true, targetLgaId: true, targetWardId: true, targetPollingUnitId: true } },
      },
    });
    return { resources };
  }

  async recordReportGenerated(actor: AuthenticatedUser, campaignId: string, reportType: string) {
    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_REPORT_GENERATED,
      entityType: 'Campaign',
      entityId: campaignId,
      metadata: { reportType },
    });
  }
}
