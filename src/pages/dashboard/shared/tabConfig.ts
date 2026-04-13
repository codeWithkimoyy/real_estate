import {
  Home,
  MessageSquare,
  Calendar,
  Heart,
  Users,
  ShieldCheck,
  BarChart3,
  FileText,
  Settings,
  UserCog,
  CreditCard,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '../../../lib/rbac';

export type TabKey =
  | 'my-listings'
  | 'inquiries'
  | 'appointments'
  | 'favorites'
  | 'payments'
  | 'reservations'
  | 'approvals'
  | 'users'
  | 'analytics'
  | 'audit'
  | 'system'
  | 'profile';

export interface DashboardTab {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  group?: string;
}

export function buildTabsForRole(role?: UserRole | null): DashboardTab[] {
  if (role === 'buyer') {
    return [
      { key: 'favorites', label: 'Favorites', icon: Heart, group: 'Main' },
      { key: 'reservations', label: 'Reservations', icon: Bookmark, group: 'Main' },
      { key: 'inquiries', label: 'My Inquiries', icon: MessageSquare, group: 'Main' },
      { key: 'appointments', label: 'Appointments', icon: Calendar, group: 'Main' },
      { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Main' },
      { key: 'profile', label: 'My Profile', icon: UserCog, group: 'Account' },
    ];
  }

  if (role === 'clerk') {
    return [
      { key: 'appointments', label: 'Appointments', icon: Calendar, group: 'Front Desk' },
      { key: 'inquiries', label: 'Inquiries', icon: MessageSquare, group: 'Front Desk' },
      { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Front Desk' },
      { key: 'reservations', label: 'Reservations', icon: Bookmark, group: 'Front Desk' },
      { key: 'users', label: 'User Verification', icon: ShieldCheck, group: 'Verification' },
      { key: 'profile', label: 'My Profile', icon: UserCog, group: 'Account' },
    ];
  }

  if (role === 'administrator') {
    return [
      { key: 'approvals', label: 'Approvals', icon: ShieldCheck, group: 'Management' },
      { key: 'my-listings', label: 'All Listings', icon: Home, group: 'Management' },
      { key: 'inquiries', label: 'Inquiries', icon: MessageSquare, group: 'Communication' },
      { key: 'appointments', label: 'Appointments', icon: Calendar, group: 'Communication' },
      { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Finance' },
      { key: 'reservations', label: 'Reservations', icon: Bookmark, group: 'Finance' },
      { key: 'users', label: 'Users', icon: Users, group: 'Administration' },
      { key: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Administration' },
      { key: 'audit', label: 'Audit Logs', icon: FileText, group: 'Administration' },
      { key: 'system', label: 'System', icon: Settings, group: 'Administration' },
      { key: 'profile', label: 'My Profile', icon: UserCog, group: 'Account' },
    ];
  }

  return [
    { key: 'my-listings', label: 'My Listings', icon: Home, group: 'Properties' },
    { key: 'reservations', label: 'Reservations', icon: Bookmark, group: 'Properties' },
    { key: 'inquiries', label: 'Inquiries', icon: MessageSquare, group: 'Communication' },
    { key: 'appointments', label: 'Appointments', icon: Calendar, group: 'Communication' },
    { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Finance' },
    { key: 'profile', label: 'My Profile', icon: UserCog, group: 'Account' },
  ];
}
