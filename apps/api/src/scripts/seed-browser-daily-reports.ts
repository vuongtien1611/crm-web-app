import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { KyselyService } from '../database/kysely.service';
import { PasswordService } from '../modules/auth/services/password.service';
import { sql } from 'kysely';

async function seedBrowserDailyReportsUsers() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get(KyselyService);
  const passwordService = app.get(PasswordService);
  const db = kysely.db;

  console.log('🌱 Seeding browser test users for daily reports verification...');

  const passwordHash = await passwordService.hashPassword('Password123!@#');

  // Roles
  const devRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();
  const leaderRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();
  const pos = await db.selectFrom('positions').selectAll().executeTakeFirstOrThrow();

  // 1. Teams
  let teamA = await db.selectFrom('teams').selectAll().where('code', '=', 'TEAM-BRW-DEV-A').executeTakeFirst();
  if (!teamA) {
    [teamA] = await db.insertInto('teams').values({
      code: 'TEAM-BRW-DEV-A',
      name: 'Browser Verification Dev Team A',
      department: 'DEV',
    }).returningAll().execute();
  }

  let teamB = await db.selectFrom('teams').selectAll().where('code', '=', 'TEAM-BRW-DEV-B').executeTakeFirst();
  if (!teamB) {
    [teamB] = await db.insertInto('teams').values({
      code: 'TEAM-BRW-DEV-B',
      name: 'Browser Verification Dev Team B',
      department: 'DEV',
    }).returningAll().execute();
  }

  // Helper to upsert user + employee + role + team membership
  async function setupUser(
    username: string,
    email: string,
    employeeCode: string,
    fullName: string,
    roleId: number,
    teamId: number,
    isLeader: boolean,
  ) {
    let user = await db.selectFrom('users').selectAll().where('username', '=', username).executeTakeFirst();
    if (!user) {
      [user] = await db.insertInto('users').values({
        username,
        email,
        password_hash: passwordHash,
        status: 'ACTIVE',
        must_change_password: false,
      }).returningAll().execute();
    } else {
      await db.updateTable('users').set({
        password_hash: passwordHash,
        status: 'ACTIVE',
        must_change_password: false,
      }).where('id', '=', user.id).execute();
    }

    // Role
    const existingUr = await db.selectFrom('user_roles')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('role_id', '=', roleId as any)
      .executeTakeFirst();
    if (!existingUr) {
      await db.insertInto('user_roles').values({
        user_id: user.id,
        role_id: roleId as any,
      }).execute();
    }

    // Employee
    let emp = await db.selectFrom('employees').selectAll().where('user_id', '=', user.id).executeTakeFirst();
    if (!emp) {
      [emp] = await db.insertInto('employees').values({
        employee_code: employeeCode,
        full_name: fullName,
        phone: '0901234567',
        user_id: user.id,
        position_id: pos.id,
        status: 'ACTIVE',
      }).returningAll().execute();
    }

    // Team membership
    const existingTm = await db.selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', emp.id)
      .where('team_id', '=', teamId as any)
      .executeTakeFirst();

    if (!existingTm) {
      await db.insertInto('team_memberships').values({
        employee_id: emp.id,
        team_id: teamId as any,
        is_leader: isLeader,
        effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any,
      }).execute();
    } else {
      await db.updateTable('team_memberships')
        .set({
          is_leader: isLeader,
          effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any,
        })
        .where('id', '=', existingTm.id)
        .execute();
    }

    return { user, emp };
  }

  // Emp A
  const empA = await setupUser(
    'brw_emp_a',
    'brw_emp_a@crm.local',
    'EMP-BRW-DEV-A1',
    'Dev A Member Browser',
    devRole.id,
    teamA.id,
    false,
  );

  // Leader A
  const leaderA = await setupUser(
    'brw_leader_a',
    'brw_leader_a@crm.local',
    'EMP-BRW-DEV-LA',
    'Dev A Leader Browser',
    leaderRole.id,
    teamA.id,
    true,
  );

  // Emp B
  const empB = await setupUser(
    'brw_emp_b',
    'brw_emp_b@crm.local',
    'EMP-BRW-DEV-B1',
    'Dev B Member Browser',
    devRole.id,
    teamB.id,
    false,
  );

  // Leader B
  const leaderB = await setupUser(
    'brw_leader_b',
    'brw_leader_b@crm.local',
    'EMP-BRW-DEV-LB',
    'Dev B Leader Browser',
    leaderRole.id,
    teamB.id,
    true,
  );

  console.log('✅ Seeded browser test users successfully:');
  console.log(' - brw_emp_a (Dev in Team A)');
  console.log(' - brw_leader_a (Dev Leader in Team A)');
  console.log(' - brw_emp_b (Dev in Team B)');
  console.log(' - brw_leader_b (Dev Leader in Team B)');
  console.log(' - admin (Boss / Admin)');

  await app.close();
}

seedBrowserDailyReportsUsers().catch((err) => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
