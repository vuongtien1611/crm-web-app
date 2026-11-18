import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { hasCapability, isRouteAllowed } from '../config/navigation.config';

interface RoleRouteProps {
  allowedRoles?: readonly string[];
  strict?: boolean;
  requiredPermission?: string;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({
  allowedRoles = [],
  strict = false,
  requiredPermission,
}) => {
  const user = useAuthStore((state) => state.user);
  const roles = user?.roles || [];

  // Check required permission capability if provided
  if (requiredPermission && !hasCapability(user, requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  // When not strict, ADMIN and BOSS can access standard management routes
  if (allowedRoles.length > 0 && !isRouteAllowed(roles, allowedRoles, strict)) {
    return <Navigate to="/dashboard" replace />;
  }

  // If allowedRoles is explicitly empty and not strict, check if user is BOSS/ADMIN
  if (allowedRoles.length === 0 && !strict && !roles.includes('ADMIN') && !roles.includes('BOSS')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
