import { Injectable } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
  must_change_password: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly kysely: KyselyService) {}

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const clean = identifier.trim();
    if (!clean) return null;

    const db = this.kysely.db;
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where((eb: any) =>
        eb.or([
          eb('username', '=', clean),
          eb('email', '=', clean),
          sql`LOWER(username) = LOWER(${clean})`,
          sql`LOWER(email) = LOWER(${clean})`,
        ]),
      )
      .executeTakeFirst();

    return (user as unknown as UserRecord) || null;
  }

  async findById(id: string | number): Promise<UserRecord | null> {
    const db = this.kysely.db;
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    return (user as unknown as UserRecord) || null;
  }

  async createUser(data: {
    username: string;
    email: string;
    passwordHash: string;
    status?: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
  }): Promise<UserRecord> {
    const db = this.kysely.db;
    const [user] = await db
      .insertInto('users')
      .values({
        username: data.username,
        email: data.email,
        password_hash: data.passwordHash,
        status: data.status || 'ACTIVE',
      })
      .returningAll()
      .execute();

    return user as unknown as UserRecord;
  }

  async assignRoleToUser(userId: string | number, roleId: string | number): Promise<void> {
    const db = this.kysely.db;
    await db
      .insertInto('user_roles')
      .values({
        user_id: userId as any,
        role_id: roleId as any,
      })
      .onConflict((oc: any) => oc.doNothing())
      .execute();
  }

  async updatePassword(userId: string | number, passwordHash: string): Promise<void> {
    const db = this.kysely.db;
    await db
      .updateTable('users')
      .set({
        password_hash: passwordHash,
        must_change_password: false,
        updated_at: new Date() as any,
      })
      .where('id', '=', userId as any)
      .execute();
  }
}
