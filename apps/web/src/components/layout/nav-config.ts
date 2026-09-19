import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ShieldCheck,
  MapPinned,
  CalendarDays,
  ClipboardCheck,
  Boxes,
  ArrowLeftRight,
  Truck,
  FileText,
  BarChart3,
  UserCog,
  History,
  Megaphone,
  UserSquare2,
  Compass,
  UsersRound,
  HeartHandshake,
  CalendarClock,
  ListChecks,
  PackageSearch,
  Activity,
  MessageSquare,
} from 'lucide-react';
import type { Role } from '@/lib/auth-context';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
  /** Visible only to a user with an active campaign membership — checked separately from `roles`, see canSeeNavItem. */
  campaignOnly?: boolean;
  /** Fine-grained permission gate (checked via useAuth().hasPermission), in addition to any `roles` gate. */
  permission?: string;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];
// Every role that can manage at least one lower role — POLLING_UNIT_OFFICER
// is included here even though most of them can't create anyone yet; the
// per-account `canCreateUsers` grant is checked separately in canSeeNavItem.
const USER_MANAGEMENT_ROLES: Role[] = [...ADMIN_ROLES, 'LGA_ADMIN', 'WARD_ADMIN', 'POLLING_UNIT_OFFICER'];
const FIELD_ROLES: Role[] = [
  'SUPER_ADMIN',
  'STATE_ADMIN',
  'SENATORIAL_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_OFFICER',
];

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'Membership',
    items: [
      { label: 'Members', href: '/members', icon: Users },
      { label: 'Register Member', href: '/members/new', icon: UserPlus },
      { label: 'Verification', href: '/verification', icon: ShieldCheck },
    ],
  },
  {
    heading: 'Organization',
    items: [{ label: 'LGAs, Wards & Polling Units', href: '/organization', icon: MapPinned }],
  },
  {
    heading: 'Activities',
    items: [
      { label: 'Events', href: '/events', icon: CalendarDays, roles: FIELD_ROLES },
      { label: 'Attendance', href: '/attendance', icon: ClipboardCheck, roles: FIELD_ROLES },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { label: 'Inventory', href: '/resources', icon: Boxes, roles: FIELD_ROLES },
      { label: 'Allocations', href: '/resources/allocations', icon: ArrowLeftRight, roles: FIELD_ROLES },
      { label: 'Distributions', href: '/distributions', icon: Truck, roles: FIELD_ROLES },
    ],
  },
  {
    items: [
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    heading: 'Communications',
    items: [{ label: 'Messages', href: '/messages', icon: MessageSquare, permission: 'messages.view' }],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Users & Roles', href: '/users', icon: UserCog, roles: USER_MANAGEMENT_ROLES },
      { label: 'Audit Logs', href: '/audit-logs', icon: History, roles: ADMIN_ROLES },
    ],
  },
  {
    heading: 'Campaign',
    items: [
      { label: 'Overview', href: '/campaign', icon: Megaphone, campaignOnly: true },
      { label: 'Candidate', href: '/campaign/candidate', icon: UserSquare2, campaignOnly: true },
      { label: 'Organization', href: '/campaign/organization', icon: Compass, campaignOnly: true },
      { label: 'Teams', href: '/campaign/teams', icon: UsersRound, campaignOnly: true },
      { label: 'Volunteers', href: '/campaign/volunteers', icon: HeartHandshake, campaignOnly: true },
      { label: 'Events', href: '/campaign/events', icon: CalendarClock, campaignOnly: true },
      { label: 'Tasks', href: '/campaign/tasks', icon: ListChecks, campaignOnly: true },
      { label: 'Resources', href: '/campaign/resources', icon: PackageSearch, campaignOnly: true },
      { label: 'Activity', href: '/campaign/activity', icon: Activity, campaignOnly: true },
      { label: 'Access', href: '/campaign/access', icon: UserCog, campaignOnly: true },
      { label: 'Reports', href: '/campaign/reports', icon: BarChart3, campaignOnly: true },
    ],
  },
];

export function canSeeNavItem(
  item: NavItem,
  user: { role: Role; canCreateUsers?: boolean } | undefined,
  hasCampaignMembership = false,
  hasPermission: (permission: string) => boolean = () => true,
): boolean {
  if (item.campaignOnly) return hasCampaignMembership;
  if (item.permission && !hasPermission(item.permission)) return false;
  if (!item.roles) return true;
  if (!user) return false;
  if (!item.roles.includes(user.role)) return false;
  // A Polling Unit Officer only gets the Users & Roles link once a Super
  // Admin has actually granted them user-creation rights — otherwise the
  // page would be empty/useless for them.
  if (item.href === '/users' && user.role === 'POLLING_UNIT_OFFICER') return !!user.canCreateUsers;
  return true;
}
