export type CampaignRole =
  | 'CAMPAIGN_SUPER_ADMIN'
  | 'STATE_CAMPAIGN_COORDINATOR'
  | 'DISTRICT_COORDINATOR'
  | 'LGA_COORDINATOR'
  | 'WARD_COORDINATOR'
  | 'POLLING_UNIT_COORDINATOR'
  | 'CAMPAIGN_DATA_OFFICER'
  | 'EVENT_COORDINATOR'
  | 'LOGISTICS_OFFICER'
  | 'VOLUNTEER_COORDINATOR'
  | 'REPORT_VIEWER';

export interface CampaignScopeIds {
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateBio: string | null;
  candidatePhotoUrl: string | null;
  party: string;
  electionType: string;
  electionYear: number;
  status: 'PLANNED' | 'ACTIVE' | 'SUSPENDED' | 'CONCLUDED';
  startDate: string | null;
  endDate: string | null;
  stateId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMembership extends CampaignScopeIds {
  id: string;
  campaignId: string;
  userId: string;
  role: CampaignRole;
  status: 'ACTIVE' | 'DISABLED';
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string; email: string };
}

export interface CampaignTeam extends CampaignScopeIds {
  id: string;
  campaignId: string;
  name: string;
  teamType: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  coordinatorId: string | null;
  coordinator: { id: string; user: { fullName: string } } | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number };
  members?: {
    id: string;
    roleInTeam: string | null;
    membership: { id: string; user: { fullName: string } } | null;
    volunteer: { id: string; fullName: string } | null;
  }[];
}

export interface CampaignVolunteer extends CampaignScopeIds {
  id: string;
  campaignId: string;
  memberId: string | null;
  fullName: string;
  phone: string | null;
  role: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  availability: string | null;
  coordinatorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignEventType =
  | 'RALLY'
  | 'TOWN_HALL'
  | 'WARD_MEETING'
  | 'LGA_MEETING'
  | 'DISTRICT_MEETING'
  | 'STAKEHOLDER_MEETING'
  | 'VOLUNTEER_TRAINING'
  | 'COMMUNITY_OUTREACH'
  | 'INTERNAL_PARTY_MEETING';

export interface CampaignEvent extends CampaignScopeIds {
  id: string;
  campaignId: string;
  title: string;
  type: CampaignEventType;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  organizerId: string;
  organizer: { id: string; user: { fullName: string } };
  expectedAttendance: number | null;
  actualAttendance: number | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  attachmentUrls: string[];
  createdAt: string;
  updatedAt: string;
  _count: { attendances: number; tasks: number };
}

export interface CampaignAttendanceEntry {
  id: string;
  eventId: string;
  attendeeType: 'MEMBER' | 'VOLUNTEER' | 'GUEST';
  memberId: string | null;
  member: { id: string; firstName: string; surname: string } | null;
  volunteerId: string | null;
  volunteer: { id: string; fullName: string } | null;
  guestName: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT' | 'NO_SHOW';
  verificationMethod: string;
}

export interface CampaignTask extends CampaignScopeIds {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  assignedToMembershipId: string | null;
  assignedToMembership: { id: string; user: { fullName: string } } | null;
  assignedToTeamId: string | null;
  assignedToTeam: { id: string; name: string } | null;
  eventId: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdById: string;
  completedById: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignActivity extends CampaignScopeIds {
  id: string;
  campaignId: string;
  type: 'MEETING_HELD' | 'EVENT_COMPLETED' | 'TEAM_CREATED' | 'VOLUNTEER_ASSIGNED' | 'RESOURCE_ALLOCATED' | 'TASK_COMPLETED' | 'GENERAL';
  description: string;
  date: string;
  responsibleId: string | null;
  responsible: { id: string; user: { fullName: string } } | null;
  teamId: string | null;
  eventId: string | null;
  attachmentUrls: string[];
  createdAt: string;
}

export interface CampaignDashboard {
  campaign: Campaign;
  upcomingEvents: { id: string; title: string; type: CampaignEventType; date: string; venue: string | null }[];
  recentActivities: { id: string; type: string; description: string; date: string }[];
  activeTeams: number;
  activeVolunteers: number;
  tasksByStatus: Record<string, number>;
  eventsByStatus: Record<string, number>;
  resourceStatus: { id: string; name: string; totalQuantity: number; remainingQuantity: number }[];
}

export interface CampaignCoverage {
  pollingUnitsWithActivity: number;
  wardsWithActivity: number;
  lgasWithActivity: number;
  districtsWithActivity: number;
  eventsCompleted: number;
  eventsScheduled: number;
}
