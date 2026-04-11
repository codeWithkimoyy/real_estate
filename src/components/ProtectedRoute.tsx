import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredAuth, isLoggedIn } from '../lib/auth';
import type { Permission } from '../lib/rbac';
import { roleHasPermission } from '../lib/rbac';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: Permission;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission) {
    const role = getStoredAuth()?.user.role;
    if (!roleHasPermission(role, requiredPermission)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
