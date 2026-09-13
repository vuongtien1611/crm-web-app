import { Injectable } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';

export interface UserPermissionsResult {
  roles: string[];
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(private readonly kysely: KyselyService) {}

  async getUserRolesAndPermissions(userId: string | number): Promise<UserPermissionsResult> {
    const db = this.kysely.db;

    // Fetch Role Codes
    const roleRows = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select('roles.code as code')
      .where('user_roles.user_id', '=', userId as any)
      .execute();

    const roles: string[] = Array.from(
      new Set(
        roleRows
          .map((r: any) => (r && r.code ? String(r.code) : ''))
          .filter((code: string): code is string => Boolean(code)),
      ),
    );

    // Fetch Permission Codes
    const permRows = await db
      .selectFrom('user_roles')
      .innerJoin('role_permissions', 'role_permissions.role_id', 'user_roles.role_id')
      .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select('permissions.code as code')
      .where('user_roles.user_id', '=', userId as any)
      .execute();

    const permissions: string[] = Array.from(
      new Set(
        permRows
          .map((p: any) => (p && p.code ? String(p.code) : ''))
          .filter((code: string): code is string => Boolean(code)),
      ),
    );

    return { roles, permissions };
  }

  async findRoleByCode(code: string): Promise<{ id: string; code: string; name: string } | null> {
    const db = this.kysely.db;
    const role = await db
      .selectFrom('roles')
      .select(['id', 'code', 'name'])
      .where('code', '=', code)
      .executeTakeFirst();

    return (role as unknown as { id: string; code: string; name: string }) || null;
  }
}
