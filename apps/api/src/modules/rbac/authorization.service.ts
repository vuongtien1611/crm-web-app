import { Injectable } from '@nestjs/common';

export interface AuthorizationPrincipal {
  employeeId?: string | number | null;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export interface EmployeeScopePolicy {
  elevatedRoles?: readonly string[];
  elevatedPermissions?: readonly string[];
  teamRoles?: readonly string[];
  teamEmployeeIds?: readonly (string | number)[];
}

export type EmployeeScope =
  | { type: 'all'; employeeIds: [] }
  | { type: 'team' | 'self' | 'none'; employeeIds: string[] };

@Injectable()
export class AuthorizationService {
  hasAnyRole(principal: AuthorizationPrincipal, roles: readonly string[]): boolean {
    return roles.some((role) => principal.roles?.includes(role));
  }

  resolveEmployeeScope(
    principal: AuthorizationPrincipal,
    policy: EmployeeScopePolicy = {},
  ): EmployeeScope {
    if (
      this.hasAnyRole(principal, policy.elevatedRoles ?? ['ADMIN', 'BOSS', 'SUPER_ADMIN']) ||
      (policy.elevatedPermissions ?? []).some((permission) =>
        principal.permissions?.includes(permission),
      )
    ) {
      return { type: 'all', employeeIds: [] };
    }

    if (principal.employeeId === undefined || principal.employeeId === null) {
      return { type: 'none', employeeIds: [] };
    }

    const employeeId = String(principal.employeeId);
    if (this.hasAnyRole(principal, policy.teamRoles ?? [])) {
      const employeeIds = new Set([
        employeeId,
        ...(policy.teamEmployeeIds ?? []).map(String),
      ]);
      return { type: 'team', employeeIds: [...employeeIds] };
    }

    return { type: 'self', employeeIds: [employeeId] };
  }

  canAccessEmployee(scope: EmployeeScope, employeeId: string | number | null | undefined): boolean {
    return (
      scope.type === 'all' ||
      (employeeId !== undefined &&
        employeeId !== null &&
        scope.employeeIds.includes(String(employeeId)))
    );
  }
}
