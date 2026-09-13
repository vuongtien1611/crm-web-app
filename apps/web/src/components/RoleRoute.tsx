import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface RoleRouteProps {
  allowedRoles: string[];
  strict?: boolean;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRoles, strict = false }) => {
  const user = useAuthStore((state) => state.user);
  const roles = user?.roles || [];

  // When not strict, ADMIN and BOSS can access standard management routes
  if (!strict && (roles.includes('ADMIN') || roles.includes('BOSS'))) {
    return <Outlet />;
  }

  const isAllowed = roles.some((r) => allowedRoles.includes(r));
  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
