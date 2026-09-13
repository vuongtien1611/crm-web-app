import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../modules/users/users.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { PasswordService } from '../modules/auth/services/password.service';
import { KyselyService } from '../database/kysely.service';

async function bootstrapAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);
  const employeesService = app.get(EmployeesService);
  const rbacService = app.get(RbacService);
  const passwordService = app.get(PasswordService);
  const kyselyService = app.get(KyselyService);

  const adminConfig = configService.get('bootstrapAdmin');
  const db = kyselyService.db;

  console.log('🔄 Checking Bootstrap Admin User...');

  // 1. Verify ADMIN role exists
  const adminRole = await rbacService.findRoleByCode('ADMIN');
  if (!adminRole) {
    console.error('❌ Error: ADMIN role does not exist in roles table!');
    await app.close();
    process.exit(1);
  }

  // 2. Check if Admin User already exists
  const existingUser = await usersService.findByIdentifier(adminConfig.username);
  if (existingUser) {
    console.log(`✅ Bootstrap Admin user [${adminConfig.username}] already exists. Skipping initialization.`);
    await app.close();
    return;
  }

  // 3. Find or Create Position for Admin (e.g., BOSS or FIRST position)
  const pos = await db
    .selectFrom('positions')
    .select('id')
    .executeTakeFirst();

  if (!pos) {
    console.error('❌ Error: No positions seeded in database!');
    await app.close();
    process.exit(1);
  }

  // 4. Find or Create Employee
  let employee = await employeesService.findByEmployeeCode(adminConfig.employeeCode);
  if (!employee) {
    employee = await employeesService.createEmployee({
      employeeCode: adminConfig.employeeCode,
      fullName: 'System Administrator',
      positionId: pos.id,
      status: 'ACTIVE',
    });
    console.log(`👤 Created Bootstrap Employee: ${employee.employee_code}`);
  }

  // 5. Hash Password with Argon2id
  const passwordHash = await passwordService.hashPassword(adminConfig.password);

  // 6. Create User
  const newUser = await usersService.createUser({
    username: adminConfig.username,
    email: adminConfig.email,
    passwordHash,
    status: 'ACTIVE',
  });

  // 7. Link Employee to User
  await employeesService.linkUser(employee.id, newUser.id);

  // 8. Assign ADMIN role
  await usersService.assignRoleToUser(newUser.id, adminRole.id);

  console.log(`🎉 Bootstrap Admin User [${newUser.username}] created successfully and linked to Employee [${employee.employee_code}].`);
  await app.close();
}

bootstrapAdmin().catch((err) => {
  console.error('❌ Bootstrap Admin Error:', err);
  process.exit(1);
});
