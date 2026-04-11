/* ================================================================
   Role-Based Access Control (RBAC)
   ================================================================ */

export type UserRole = 'administrator' | 'agent' | 'seller' | 'buyer' | 'clerk';

export type Permission =
  | 'view_dashboard'
  | 'create_listing'
  | 'manage_own_listings'
  | 'approve_listing'
  | 'send_inquiry'
  | 'manage_inquiries'
  | 'view_favorites'
  | 'manage_favorites'
  | 'view_appointments'
  | 'manage_appointments'
  | 'verify_users'
  | 'view_audit_logs'
  | 'manage_users'
  | 'manage_system';

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  agent: 'Agent',
  seller: 'Seller',
  buyer: 'Buyer',
  clerk: 'Clerk',
};

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  administrator: [
    'view_dashboard',
    'create_listing',
    'manage_own_listings',
    'approve_listing',
    'send_inquiry',
    'manage_inquiries',
    'view_favorites',
    'manage_favorites',
    'view_appointments',
    'manage_appointments',
    'view_audit_logs',
    'manage_users',
    'manage_system',
  ],
  agent: [
    'view_dashboard',
    'create_listing',
    'manage_own_listings',
    'manage_inquiries',
    'view_appointments',
    'manage_appointments',
  ],
  seller: [
    'view_dashboard',
    'create_listing',
    'manage_own_listings',
    'manage_inquiries',
    'view_appointments',
    'manage_appointments',
  ],
  buyer: [
    'view_dashboard',
    'send_inquiry',
    'view_favorites',
    'manage_favorites',
    'view_appointments',
  ],
  clerk: [
    'view_dashboard',
    'view_appointments',
    'manage_appointments',
    'manage_inquiries',
    'verify_users',
  ],
};

/** Roles available for public sign-up (admin is excluded). */
export const PUBLIC_SIGNUP_ROLES: readonly UserRole[] = ['buyer', 'seller', 'agent', 'clerk'];

export function roleHasPermission(
  role: UserRole | undefined | null,
  permission: Permission,
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}
