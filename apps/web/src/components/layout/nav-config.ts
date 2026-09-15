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
} from 'lucide-react';
import type { Role } from '@/lib/auth-context';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'STATE_ADMIN', 'SENATORIAL_ADMIN'];
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
    heading: 'Administration',
    items: [
      { label: 'Users & Roles', href: '/users', icon: UserCog, roles: ADMIN_ROLES },
      { label: 'Audit Logs', href: '/audit-logs', icon: History, roles: ADMIN_ROLES },
    ],
  },
];

export function canSeeNavItem(item: NavItem, role: Role | undefined): boolean {
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}
