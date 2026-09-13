import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../modules/users/users.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { PasswordService } from '../modules/auth/services/password.service';
import { KyselyService } from '../database/kysely.service';
import { sql } from 'kysely';

interface StagingAccountConfig {
  username: string;
  email: string;
  fullName: string;
  employeeCode: string;
  roleCode: string;
  positionCode: string;
  department: string;
  teamCode: string;
  teamName: string;
  isLeader?: boolean;
}

// Danh sách 12 tài khoản staging cho 9 roles và các team khác nhau để test phân quyền
const STAGING_ACCOUNTS: StagingAccountConfig[] = [
  {
    username: 'staging_admin',
    email: 'admin@staging.crm.local',
    fullName: 'Quản Trị Viên Staging',
    employeeCode: 'STG-ADMIN-01',
    roleCode: 'ADMIN',
    positionCode: 'ADMIN',
    department: 'OPERATION',
    teamCode: 'STG-TEAM-OPS',
    teamName: 'Đội Vận Hành Hệ Thống',
    isLeader: true,
  },
  {
    username: 'staging_boss',
    email: 'boss@staging.crm.local',
    fullName: 'Giám Đốc Điều Hành Staging',
    employeeCode: 'STG-BOSS-01',
    roleCode: 'BOSS',
    positionCode: 'BOSS',
    department: 'OPERATION',
    teamCode: 'STG-TEAM-BOD',
    teamName: 'Ban Giám Đốc',
    isLeader: true,
  },
  {
    username: 'staging_accountant',
    email: 'accountant@staging.crm.local',
    fullName: 'Kế Toán Trưởng Staging',
    employeeCode: 'STG-ACC-01',
    roleCode: 'ACCOUNTANT',
    positionCode: 'ACCOUNTANT',
    department: 'OPERATION',
    teamCode: 'STG-TEAM-ACC',
    teamName: 'Phòng Kế Toán',
    isLeader: true,
  },
  {
    username: 'staging_sales_leader',
    email: 'sales_leader@staging.crm.local',
    fullName: 'Trưởng Nhóm Sales 1',
    employeeCode: 'STG-SALE-LD1',
    roleCode: 'SALES_TEAM_LEADER',
    positionCode: 'SALES_TEAM_LEADER',
    department: 'SALES',
    teamCode: 'STG-TEAM-SALE1',
    teamName: 'Team Kinh Doanh Alpha',
    isLeader: true,
  },
  {
    username: 'staging_sale',
    email: 'sale@staging.crm.local',
    fullName: 'Chuyên Viên Sales Team 1',
    employeeCode: 'STG-SALE-01',
    roleCode: 'SALE',
    positionCode: 'SALE',
    department: 'SALES',
    teamCode: 'STG-TEAM-SALE1',
    teamName: 'Team Kinh Doanh Alpha',
    isLeader: false,
  },
  {
    username: 'staging_sale_t2',
    email: 'sale_t2@staging.crm.local',
    fullName: 'Chuyên Viên Sales Team 2',
    employeeCode: 'STG-SALE-02',
    roleCode: 'SALE',
    positionCode: 'SALE',
    department: 'SALES',
    teamCode: 'STG-TEAM-SALE2',
    teamName: 'Team Kinh Doanh Beta',
    isLeader: false,
  },
  {
    username: 'staging_dev_leader',
    email: 'dev_leader@staging.crm.local',
    fullName: 'Trưởng Nhóm Lập Trình 1',
    employeeCode: 'STG-DEV-LD1',
    roleCode: 'DEV_TEAM_LEADER',
    positionCode: 'DEV_TEAM_LEADER',
    department: 'DEV',
    teamCode: 'STG-TEAM-DEV1',
    teamName: 'Team Lập Trình Web',
    isLeader: true,
  },
  {
    username: 'staging_dev',
    email: 'dev@staging.crm.local',
    fullName: 'Lập Trình Viên Team 1',
    employeeCode: 'STG-DEV-01',
    roleCode: 'DEV',
    positionCode: 'DEV',
    department: 'DEV',
    teamCode: 'STG-TEAM-DEV1',
    teamName: 'Team Lập Trình Web',
    isLeader: false,
  },
  {
    username: 'staging_dev_t2',
    email: 'dev_t2@staging.crm.local',
    fullName: 'Lập Trình Viên Team 2',
    employeeCode: 'STG-DEV-02',
    roleCode: 'DEV',
    positionCode: 'DEV',
    department: 'DEV',
    teamCode: 'STG-TEAM-DEV2',
    teamName: 'Team Lập Trình Mobile',
    isLeader: false,
  },
  {
    username: 'staging_seo_leader',
    email: 'seo_leader@staging.crm.local',
    fullName: 'Trưởng Nhóm SEO 1',
    employeeCode: 'STG-SEO-LD1',
    roleCode: 'SEO_TEAM_LEADER',
    positionCode: 'SEO_TEAM_LEADER',
    department: 'SEO',
    teamCode: 'STG-TEAM-SEO1',
    teamName: 'Team Nội Dung & SEO 1',
    isLeader: true,
  },
  {
    username: 'staging_seo',
    email: 'seo@staging.crm.local',
    fullName: 'Chuyên Viên SEO Team 1',
    employeeCode: 'STG-SEO-01',
    roleCode: 'SEO',
    positionCode: 'SEO',
    department: 'SEO',
    teamCode: 'STG-TEAM-SEO1',
    teamName: 'Team Nội Dung & SEO 1',
    isLeader: false,
  },
  {
    username: 'staging_seo_t2',
    email: 'seo_t2@staging.crm.local',
    fullName: 'Chuyên Viên SEO Team 2',
    employeeCode: 'STG-SEO-02',
    roleCode: 'SEO',
    positionCode: 'SEO',
    department: 'SEO',
    teamCode: 'STG-TEAM-SEO2',
    teamName: 'Team Nội Dung & SEO 2',
    isLeader: false,
  },
];

const STAGING_DEFAULT_PASSWORD = 'Staging@2026Pass!';

async function seedStaging() {
  console.log('==================================================');
  console.log('KHỞI TẠO TÀI KHOẢN VÀ TEAM CHO MÔI TRƯỜNG STAGING');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const employeesService = app.get(EmployeesService);
  const rbacService = app.get(RbacService);
  const passwordService = app.get(PasswordService);
  const kyselyService = app.get(KyselyService);
  const db = kyselyService.db;

  try {
    // Hash mật khẩu chung cho tài khoản staging bằng Argon2id
    const passwordHash = await passwordService.hashPassword(STAGING_DEFAULT_PASSWORD);

    for (const acc of STAGING_ACCOUNTS) {
      console.log(`\n▶ Xử lý tài khoản: ${acc.username} (${acc.roleCode})...`);

      // 1. Kiểm tra vị trí công việc trong database
      let position = await db
        .selectFrom('positions')
        .where('code', '=', acc.positionCode)
        .select(['id', 'code'])
        .executeTakeFirst();

      if (!position) {
        const newPos = await db
          .insertInto('positions')
          .values({
            code: acc.positionCode,
            name: acc.fullName,
            description: `Vị trí ${acc.positionCode} môi trường Staging`,
          })
          .returning(['id', 'code'])
          .executeTakeFirstOrThrow();
        position = newPos;
        console.log(`  + Đã tạo vị trí: ${acc.positionCode}`);
      }

      // 2. Tìm hoặc tạo team cho nhân viên
      let team = await db
        .selectFrom('teams')
        .where('code', '=', acc.teamCode)
        .select(['id', 'code'])
        .executeTakeFirst();

      if (!team) {
        const newTeam = await db
          .insertInto('teams')
          .values({
            code: acc.teamCode,
            name: acc.teamName,
            department: acc.department as any,
            description: `Team ${acc.teamName} Staging`,
          })
          .returning(['id', 'code'])
          .executeTakeFirstOrThrow();
        team = newTeam;
        console.log(`  + Đã tạo team: ${acc.teamName} (${acc.department})`);
      }

      // 3. Tìm hoặc tạo hồ sơ nhân viên
      let employee = await employeesService.findByEmployeeCode(acc.employeeCode);
      if (!employee) {
        employee = await employeesService.createEmployee({
          employeeCode: acc.employeeCode,
          fullName: acc.fullName,
          positionId: position.id,
          status: 'ACTIVE',
        });
        console.log(`  + Đã tạo nhân viên: ${employee.full_name} (${employee.employee_code})`);
      } else {
        // Cập nhật lại chức vụ nếu nhân viên đã tồn tại
        await db
          .updateTable('employees')
          .set({
            position_id: position.id,
            status: 'ACTIVE',
          })
          .where('id', '=', employee.id)
          .execute();
      }

      // Gán nhân viên vào team và lưu lịch sử vào bảng team_memberships
      const currentMembership = await db
        .selectFrom('team_memberships')
        .where('employee_id', '=', employee.id)
        .where(sql`effective_range @> NOW()` as any)
        .select(['id', 'team_id', 'is_leader'])
        .executeTakeFirst();

      if (!currentMembership) {
        // Chưa có team thì thêm mới vào team
        await db
          .insertInto('team_memberships')
          .values({
            team_id: team.id as any,
            employee_id: employee.id as any,
            is_leader: acc.isLeader ?? false,
            effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
          })
          .execute();
        console.log(`  + Đã gán vào team: ${acc.teamName}`);
      } else if (
        currentMembership.team_id !== team.id ||
        Boolean(currentMembership.is_leader) !== Boolean(acc.isLeader)
      ) {
        // Nếu chuyển team hoặc đổi chức vụ leader thì kết thúc đợt cũ và mở đợt mới
        await db
          .updateTable('team_memberships')
          .set({
            effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
          })
          .where('id', '=', currentMembership.id)
          .execute();

        await db
          .insertInto('team_memberships')
          .values({
            team_id: team.id as any,
            employee_id: employee.id as any,
            is_leader: acc.isLeader ?? false,
            effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
          })
          .execute();
        console.log(`  + Đã cập nhật lại team: ${acc.teamName}`);
      }


      // 4. Tìm hoặc tạo tài khoản đăng nhập
      let user = await usersService.findByIdentifier(acc.username);
      if (!user) {
        user = await usersService.createUser({
          username: acc.username,
          email: acc.email,
          passwordHash,
          status: 'ACTIVE',
        });
        console.log(`  + Đã tạo user: ${user.username}`);
      } else {
        // Reset lại mật khẩu staging cho tài khoản có sẵn
        await db
          .updateTable('users')
          .set({ password_hash: passwordHash, status: 'ACTIVE' })
          .where('id', '=', user.id)
          .execute();
      }

      // 5. Liên kết user với employee nếu chưa liên kết
      if (!employee.user_id || employee.user_id !== user.id) {
        await employeesService.linkUser(employee.id, user.id);
      }

      // 6. Gán đúng role cho tài khoản
      const role = await rbacService.findRoleByCode(acc.roleCode);
      if (role) {
        // Xóa các role cũ và gán đúng role mới của staging
        await db
          .deleteFrom('user_roles')
          .where('user_id', '=', user.id)
          .execute();

        await usersService.assignRoleToUser(user.id, role.id);
        console.log(`  + Đã gán quyền: [${acc.roleCode}]`);
      } else {
        console.warn(`  ⚠️ Cảnh báo: Không tìm thấy role ${acc.roleCode}`);
      }

      // 7. Cấu hình lương cơ bản cho nhân viên nếu chưa có
      const existingSalary = await db
        .selectFrom('salary_history')
        .where('employee_id', '=', employee.id as any)
        .where(sql`effective_range @> NOW()` as any)
        .select('id')
        .executeTakeFirst();

      if (!existingSalary) {
        // Lương cơ bản theo cấp bậc: Giám đốc 20M, Trưởng nhóm 15M, Nhân viên 10M
        const baseSalary = acc.roleCode === 'BOSS' ? 20000000 : acc.isLeader ? 15000000 : 10000000;
        await db
          .insertInto('salary_history')
          .values({
            employee_id: employee.id as any,
            base_salary: baseSalary as any,
            effective_range: sql`tstzrange('2026-01-01', NULL, '[)')` as any,
            note: 'Mức lương cơ bản Staging UAT',
          })
          .execute();
        console.log(`  + Đã cấu hình lương cơ bản: ${baseSalary.toLocaleString('vi-VN')} VND`);
      }
    }

    console.log('\n==================================================');
    console.log('HOÀN TẤT KHỞI TẠO 12 TÀI KHOẢN STAGING THÀNH CÔNG! ✅');
    console.log('Mật khẩu đăng nhập mặc định: ' + STAGING_DEFAULT_PASSWORD);
    console.log('==================================================');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedStaging()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Lỗi khi khởi tạo staging accounts:', err);
      process.exit(1);
    });
}
