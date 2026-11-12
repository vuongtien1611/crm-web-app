import React from 'react';
import { useAuthStore } from '../store/authStore';
import { hasCapability, isRouteAllowed } from '../config/navigation.config';

interface PermissionGateProps {
  /** Capability / permission string, e.g. 'crm:lead:write', 'crm:deal:approve' */
  capability?: string;
  /** List of roles that are permitted to view the child element */
  allowedRoles?: readonly string[];
  /** Strict mode: ignores BOSS/ADMIN bypass if true */
  strict?: boolean;
  /** Optional fallback content if unauthorized */
  fallback?: React.ReactNode;
  /** Protected elements */
  children: React.ReactNode;
}

/**
 * PermissionGate: standard declarative component to show/hide action buttons or controls
 * based on user capabilities and canonical roles.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  capability,
  allowedRoles,
  strict = false,
  fallback = null,
  children,
}) => {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <>{fallback}</>;
  }

  // Capability check takes precedence if provided
  if (capability && !hasCapability(user, capability)) {
    return <>{fallback}</>;
  }

  // Role check if provided
  if (allowedRoles && allowedRoles.length > 0) {
    const roles = user.roles || [];
    if (!isRouteAllowed(roles, allowedRoles, strict)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
};

export default PermissionGate;

