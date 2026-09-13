import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { AuthService } from '../auth/auth.service';
import { RbacService } from '../rbac/rbac.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from '../orders/orders.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { CommissionsService } from '../commissions/commissions.service';
import { KpiService } from '../kpi/kpi.service';
import { PayrollService } from '../payroll/payroll.service';
import { ExpensesService } from '../expenses/expenses.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DailyReportsService } from '../daily-reports/daily-reports.service';
import { StorageService } from '../storage/storage.service';
import { ExportService } from '../export/export.service';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { LeadQuality } from '../leads/dto/update-lead-quality.dto';
import { ExpenseSourceType } from '../expenses/dto/create-expense.dto';
import { sql } from 'kysely';

// Hàm kiểm tra kết quả ngắn gọn và dễ hiểu
function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${detail || 'Điều kiện không thỏa mãn'}`);
    throw new Error(`UAT Test thất bại: ${testName} (${detail})`);
  }
}

async function runPhaseSUat() {
  console.log('================================================================');
  console.log('🚀 PHASE S: BỘ KIỂM THỬ UAT VÀ NGHIỆP VỤ MÔI TRƯỜNG STAGING');
  console.log('Kiểm thử luồng nghiệp vụ thực tế và phân quyền 9 vai trò');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const db = app.get(KyselyService).db;
  const authService = app.get(AuthService);
  const rbacService = app.get(RbacService);
  const leadsService = app.get(LeadsService);
  const dealsService = app.get(DealsService);
  const ordersService = app.get(OrdersService);
  const projectsService = app.get(ProjectsService);
  const paymentsService = app.get(PaymentsService);
  const commissionsService = app.get(CommissionsService);
  const kpiService = app.get(KpiService);
  const payrollService = app.get(PayrollService);
  const expensesService = app.get(ExpensesService);
  const dashboardService = app.get(DashboardService);
  const dailyReportsService = app.get(DailyReportsService);
  const storageService = app.get(StorageService);
  const exportService = app.get(ExportService);

  const testSuffix = Math.floor(Math.random() * 100000);
  const stagingPassword = 'Staging@2026Pass!';

  try {
    // ----------------------------------------------------------------
    // 1. UAT-AUTH & RBAC: ĐĂNG NHẬP & PHÂN QUYỀN 9 VAI TRÒ
    // ----------------------------------------------------------------
    console.log('>>> 1. UAT-AUTH & RBAC MATRIX AUDIT <<<');

    const accountsToTest = [
      { username: 'staging_admin', expectedRole: 'ADMIN' },
      { username: 'staging_boss', expectedRole: 'BOSS' },
      { username: 'staging_accountant', expectedRole: 'ACCOUNTANT' },
      { username: 'staging_sales_leader', expectedRole: 'SALES_TEAM_LEADER' },
      { username: 'staging_sale', expectedRole: 'SALE' },
      { username: 'staging_sale_t2', expectedRole: 'SALE' },
      { username: 'staging_dev_leader', expectedRole: 'DEV_TEAM_LEADER' },
      { username: 'staging_dev', expectedRole: 'DEV' },
      { username: 'staging_dev_t2', expectedRole: 'DEV' },
      { username: 'staging_seo_leader', expectedRole: 'SEO_TEAM_LEADER' },
      { username: 'staging_seo', expectedRole: 'SEO' },
      { username: 'staging_seo_t2', expectedRole: 'SEO' },
    ];

    const loggedInUsers: Record<string, any> = {};

    for (const acc of accountsToTest) {
      // Đăng nhập bằng mật khẩu staging
      const loginRes = await authService.login({
        identifier: acc.username,
        password: stagingPassword,
      });

      assert(Boolean(loginRes.accessToken), `Đăng nhập thành công: ${acc.username}`);
      assert(
        loginRes.user.roles.includes(acc.expectedRole),
        `Tài khoản ${acc.username} có vai trò [${acc.expectedRole}]`
      );

      loggedInUsers[acc.username] = loginRes.user;
    }

    const bossUser = loggedInUsers['staging_boss'];
    const accountantUser = loggedInUsers['staging_accountant'];
    const saleLeaderUser = loggedInUsers['staging_sales_leader'];
    const saleUser = loggedInUsers['staging_sale'];
    const saleT2User = loggedInUsers['staging_sale_t2'];
    const devLeaderUser = loggedInUsers['staging_dev_leader'];
    const devUser = loggedInUsers['staging_dev'];
    const devT2User = loggedInUsers['staging_dev_t2'];

    // Kiểm tra ma trận quyền hạn cốt lõi: Boss có quyền duyệt đơn và xác nhận thanh toán
    const bossRbac = await rbacService.getUserRolesAndPermissions(bossUser.id);
    const saleRbac = await rbacService.getUserRolesAndPermissions(saleUser.id);
    const accountantRbac = await rbacService.getUserRolesAndPermissions(accountantUser.id);

    assert(bossRbac.permissions.includes('ORDER_APPROVE'), 'Boss có quyền ORDER_APPROVE');
    assert(bossRbac.permissions.includes('PAYMENT_CONFIRM'), 'Boss có quyền PAYMENT_CONFIRM');
    assert(!saleRbac.permissions.includes('ORDER_APPROVE'), 'Sale KHÔNG có quyền ORDER_APPROVE (chặn đúng quyền)');
    assert(!accountantRbac.permissions.includes('PAYMENT_CONFIRM'), 'Kế toán KHÔNG có quyền PAYMENT_CONFIRM (chỉ Boss được xác nhận)');

    // ----------------------------------------------------------------
    // 2. UAT-FLOW: LEAD -> DEAL -> ĐƠN HÀNG
    // ----------------------------------------------------------------
    console.log('\n>>> 2. UAT-FLOW: LEAD -> DEAL -> ĐƠN HÀNG <<<');

    let channel = await db.selectFrom('channels').selectAll().executeTakeFirst();
    if (!channel) {
      channel = await db
        .insertInto('channels')
        .values({ code: `CH-${testSuffix}`, name: 'Facebook Ads' })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    let platform = await db.selectFrom('platforms').selectAll().executeTakeFirst();
    if (!platform) {
      platform = await db
        .insertInto('platforms')
        .values({ code: `PL-${testSuffix}`, name: 'Meta Platform' })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Sale Team 1 tạo khách hàng tiềm năng mới
    const lead = await leadsService.createLead(
      {
        fullName: `Khách Hàng Staging ${testSuffix}`,
        phone: `0987${testSuffix.toString().padStart(6, '0')}`,
        email: `lead_${testSuffix}@staging.crm.local`,
        channelId: String(channel.id),
        platformId: String(platform.id),
        creatorEmployeeId: String(saleUser.employeeId),
      },
      saleUser
    );
    assert(Boolean(lead.id), 'Sale tạo Lead thành công');

    // Cập nhật đánh giá chất lượng Lead
    const qualifiedLead = await leadsService.qualifyLead(String(lead.id), {
      quality: LeadQuality.POTENTIAL,
    });
    assert(qualifiedLead.quality === 'POTENTIAL', 'Đánh giá chất lượng Lead thành công (POTENTIAL)');

    // Chuyển đổi Lead thành Deal
    const convertResult = await leadsService.convertToDeal(
      String(lead.id),
      {
        companyName: `Công Ty Cổ Phần Staging UAT ${testSuffix}`,
        contactName: `Nguyễn Văn Đại Diện ${testSuffix}`,
        dealName: `Hợp Đồng Website Staging ${testSuffix}`,
        expectedValue: 15000000,
      },
      String(saleUser.employeeId)
    );

    const deal = convertResult.deal;
    assert(deal.status === 'OPEN', 'Chuyển Lead thành Deal thành công');

    // Chốt deal thành công (WON)
    await dealsService.startNegotiation(String(deal.id));
    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleUser.employeeId) });
    const wonResult = await dealsService.markWon(String(deal.id));

    const order = wonResult.order;
    const orderItem = wonResult.orderItem;
    assert(Boolean(order && orderItem), 'Chốt Deal thành công và sinh đơn hàng DRAFT');

    // ----------------------------------------------------------------
    // 3. UAT-APPROVAL: SALE NỘP ĐƠN & BOSS PHÊ DUYỆT
    // ----------------------------------------------------------------
    console.log('\n>>> 3. UAT-APPROVAL: PHÊ DUYỆT ĐƠN HÀNG <<<');

    // Sale nộp đơn hàng
    await ordersService.submitOrder(String(order.id), String(saleUser.employeeId));
    await ordersService.submitOrderItem(String(orderItem.id), String(saleUser.employeeId));

    // Boss phê duyệt đơn hàng
    await ordersService.approveOrder(String(order.id), String(bossUser.employeeId));
    await ordersService.approveOrderItem(String(orderItem.id), String(bossUser.employeeId));

    const approvedItem = await db
      .selectFrom('order_items')
      .selectAll()
      .where('id', '=', orderItem.id)
      .executeTakeFirstOrThrow();
    assert(approvedItem.approval_status === 'APPROVED', 'Boss phê duyệt đơn hàng thành công');

    // ----------------------------------------------------------------
    // 4. UAT-PROJECT: PHÂN CÔNG DỰ ÁN VÀ THỰC HIỆN TIẾN ĐỘ
    // ----------------------------------------------------------------
    console.log('\n>>> 4. UAT-PROJECT: TRIỂN KHAI DỰ ÁN & TIẾN ĐỘ <<<');

    // Trưởng nhóm kỹ thuật gán lập trình viên vào dự án
    const { project } = await projectsService.assignProject(
      String(orderItem.id),
      {
        employeeId: String(devUser.employeeId),
        assignmentType: AssignmentType.PRIMARY,
      },
      String(devLeaderUser.employeeId)
    );
    assert(project.status === 'ASSIGNED', 'Trưởng nhóm kỹ thuật phân công lập trình viên thành công');

    const projectId = String(project.id);
    await projectsService.markReadyToStart(projectId, String(bossUser.employeeId));
    await projectsService.startProject(projectId, String(bossUser.employeeId));

    // Lập trình viên tạo và hoàn thành các đầu việc (tasks)
    const task1 = await projectsService.createTask(
      projectId,
      { title: 'Thiết kế giao diện', weight: 50 },
      String(devUser.employeeId)
    );
    const task2 = await projectsService.createTask(
      projectId,
      { title: 'Tích hợp tính năng và kiểm thử', weight: 50 },
      String(devUser.employeeId)
    );

    await projectsService.startTask(String(task1.id), String(devUser.employeeId));
    await projectsService.completeTask(String(task1.id), String(devUser.employeeId));
    await projectsService.startTask(String(task2.id), String(devUser.employeeId));
    await projectsService.completeTask(String(task2.id), String(devUser.employeeId));

    const projectDetail = await projectsService.findProjectById(projectId);
    assert(Number(projectDetail.materialized_progress_percent) === 100, 'Tiến độ dự án hoàn thành 100%');

    // ----------------------------------------------------------------
    // 5. UAT-ACCEPTANCE: TẢI TÀI LIỆU VÀ KÝ NGHIỆM THU KHÁCH HÀNG
    // ----------------------------------------------------------------
    console.log('\n>>> 5. UAT-ACCEPTANCE: NGHIỆM THU KHÁCH HÀNG <<<');

    await projectsService.updateProjectStatus(projectId, 'REVIEW', undefined, String(bossUser.employeeId));

    // Upload biên bản nghiệm thu qua StorageService
    const docBuffer = Buffer.from('%PDF-1.4\n%Bien Ban Nghiem Thu Staging\n%%EOF');
    const uploadRes = await storageService.uploadFile({
      entityType: 'projects',
      entityId: project.id,
      filename: `bien_ban_nghiem_thu_${testSuffix}.pdf`,
      buffer: docBuffer,
      claimedMimeType: 'application/pdf',
    });
    assert(Boolean(uploadRes.objectKey), 'Tải tài liệu nghiệm thu lên hệ thống lưu trữ thành công');

    // Ghi nhận nghiệm thu khách hàng
    const { project: completedProj, acceptance } = await projectsService.recordAcceptance(
      projectId,
      {
        customerContactId: String(convertResult.contact.id),
        acceptedByName: `Đại Diện Khách Hàng ${testSuffix}`,
        evidenceDocument: uploadRes.objectKey,
      },
      String(bossUser.employeeId)
    );
    assert(completedProj.status === 'COMPLETED', 'Dự án chuyển sang trạng thái COMPLETED sau khi nghiệm thu');
    assert(Boolean(acceptance.id), 'Lưu vết biên bản nghiệm thu thành công');

    // ----------------------------------------------------------------
    // 6. UAT-PAYMENT: KẾ TOÁN LẬP PHIẾU THU & BOSS XÁC NHẬN
    // ----------------------------------------------------------------
    console.log('\n>>> 6. UAT-PAYMENT: THANH TOÁN VÀ XÁC NHẬN TIỀN VỀ <<<');

    // Tạo kế hoạch thanh toán và đợt thu tiền
    const [plan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: bossUser.employeeId,
        config_snapshot: { type: 'FULL_UPFRONT' },
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan.id,
        installment_number: 1,
        due_date: new Date().toISOString().split('T')[0] as any,
        gross_amount_due: 15000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    // Kế toán tạo phiếu thu tiền
    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 15000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        evidenceUrl: uploadRes.objectKey,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 15000000,
            closingSaleId: String(saleUser.employeeId),
          },
        ],
      },
      String(accountantUser.employeeId)
    );
    assert(payment.status === 'PENDING_CONFIRMATION', 'Kế toán tạo phiếu thu (chờ Boss duyệt)');

    // Boss xác nhận thanh toán đã vào tài khoản công ty
    const confirmedPayment = await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 15000000,
            vatAllocatedAmount: 0,
            serviceAmount: 15000000,
            netEligibleAmount: 15000000,
            closingSaleId: String(saleUser.employeeId),
          },
        ],
      },
      String(bossUser.employeeId)
    );
    assert(confirmedPayment.status === 'CONFIRMED', 'Boss xác nhận thanh toán thành công');

    const updatedItemPaid = await db
      .selectFrom('order_items')
      .selectAll()
      .where('id', '=', orderItem.id)
      .executeTakeFirstOrThrow();
    assert(updatedItemPaid.payment_status === 'FULLY_PAID', 'Đơn hàng cập nhật trạng thái FULLY_PAID');

    // ----------------------------------------------------------------
    // 7. UAT-COMMISSION & KPI: GIẢI PHÓNG HOA HỒNG & GHI NHẬN KPI
    // ----------------------------------------------------------------
    console.log('\n>>> 7. UAT-COMMISSION & KPI: TÍNH THƯỞNG HOA HỒNG & KPI <<<');

    const itemComms = await db
      .selectFrom('commissions')
      .selectAll()
      .where('order_item_id', '=', orderItem.id)
      .execute();

    const saleComm = itemComms.find(
      (c) => c.commission_type === 'SALE' && c.beneficiary_employee_id === saleUser.employeeId
    );
    assert(Boolean(saleComm && saleComm.status === 'RELEASED'), 'Hoa hồng Sale tự động giải phóng khi hoàn tất nghiệm thu và thanh toán');

    // Lấy thông tin tổng hợp KPI của Sale trong tháng
    const targetPeriod = new Date().toISOString().slice(0, 7);
    const saleKpi = await kpiService.getEmployeeKpiSummary(String(saleUser.employeeId), targetPeriod);
    assert(saleKpi.totalEligibleRevenue >= 15000000, 'Doanh thu tính điểm KPI được ghi nhận đầy đủ cho Sale');

    // ----------------------------------------------------------------
    // 8. UAT-PAYROLL: TÍNH LƯƠNG THÁNG & KHÓA SỔ
    // ----------------------------------------------------------------
    console.log('\n>>> 8. UAT-PAYROLL: TÍNH TOÁN BẢNG LƯƠNG VÀ KHÓA KỲ <<<');

    const periodKey = `2026-09-STG-${testSuffix}`;
    const [payrollPeriod] = await db
      .insertInto('payroll_periods')
      .values({
        period_key: periodKey,
        start_date: '2026-09-01' as any,
        end_date: '2026-09-30' as any,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    // Kế toán tính toán bảng lương cho các nhân viên
    await payrollService.calculatePayrollPeriod(String(payrollPeriod.id), String(accountantUser.employeeId));

    const payrolls = await db
      .selectFrom('payrolls')
      .selectAll()
      .where('payroll_period_id', '=', payrollPeriod.id)
      .execute();
    assert(payrolls.length >= 2, 'Hệ thống tính toán bảng lương cho các nhân viên đủ điều kiện');

    // Boss phê duyệt và khóa sổ kỳ lương
    await payrollService.approvePeriod(String(payrollPeriod.id), String(bossUser.employeeId));
    const lockedPeriod = await payrollService.lockPeriod(String(payrollPeriod.id), String(bossUser.employeeId));
    assert(lockedPeriod.status === 'LOCKED', 'Boss khóa kỳ lương thành công (dữ liệu trở nên bất biến)');

    // ----------------------------------------------------------------
    // 9. UAT-EXPENSES & EXECUTIVE REPORTING
    // ----------------------------------------------------------------
    console.log('\n>>> 9. UAT-EXPENSE & REPORT: CHI PHÍ VÀ BÁO CÁO ĐIỀU HÀNH <<<');

    let category = await db.selectFrom('expense_categories').selectAll().executeTakeFirst();
    if (!category) {
      category = await db
        .insertInto('expense_categories')
        .values({ code: `EXP-${testSuffix}`, name: 'Văn Phòng Phẩm & Tiện Ích' })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Kế toán ghi nhận chi phí vận hành
    const expense = await expensesService.createManualExpense(
      {
        category_id: category.id,
        amount: 2500000,
        expense_date: '2026-09-09',
        source_type: ExpenseSourceType.DIRECT_PURCHASE,
        note: 'Chi phí mua thiết bị văn phòng Staging',
      },
      String(accountantUser.employeeId)
    );
    assert(Boolean(expense.id), 'Kế toán ghi nhận chi phí thành công');

    // Boss xem báo cáo tổng hợp điều hành
    const dashboard = await dashboardService.getExecutiveDashboard('2026-09');
    assert(dashboard.cashReceivable.grossCashConfirmedTotal >= 15000000, 'Báo cáo điều hành ghi nhận đầy đủ dòng tiền thu về');
    assert(dashboard.delivery.completedProjects >= 1, 'Báo cáo điều hành phản ánh dự án đã nghiệm thu');

    // ----------------------------------------------------------------
    // 10. UAT-SUPPLEMENTARY: BÁO CÁO NGÀY, TIỆN ÍCH XUẤT EXCEL & BẢO MẬT CHÉO NHÓM
    // ----------------------------------------------------------------
    console.log('\n>>> 10. UAT-SUPPLEMENTARY: BÁO CÁO NGÀY, EXPORT VÀ BẢO MẬT CHÉO NHÓM <<<');

    // Xóa báo cáo ngày cũ nếu chạy lại test trong ngày để tránh lỗi trùng lặp
    await db
      .deleteFrom('daily_reports')
      .where('employee_id', '=', saleUser.employeeId as any)
      .where('report_date', '=', '2026-09-09' as any)
      .execute();

    // Sale nộp báo cáo công việc hàng ngày
    const dailyReport = await dailyReportsService.createDailyReport(
      {
        report_date: '2026-09-09',
        difficulty: 'Khách hàng phân vân về thời gian triển khai',
        support_needed: 'Cần kỹ thuật tư vấn thêm về kiến trúc hạ tầng',
        next_plan: 'Gửi báo giá chi tiết và ký hợp đồng',
        note: 'Báo cáo công việc ngày UAT',
      },
      String(saleUser.employeeId)
    );
    assert(Boolean(dailyReport.id), 'Sale nộp báo cáo ngày thành công');

    // Trưởng nhóm xem báo cáo của các thành viên trong nhóm
    const leaderReports = await dailyReportsService.getDailyReports(
      { date: '2026-09-09' },
      String(saleLeaderUser.employeeId),
      ['SALES_TEAM_LEADER']
    );
    assert(leaderReports.some((r: any) => r.id === dailyReport.id), 'Trưởng nhóm xem được báo cáo của thành viên nhóm mình');

    // Kiểm tra bảo mật chéo nhóm: Sale Team 2 không được xem báo cáo của Sale Team 1
    let crossReportForbidden = false;
    try {
      await dailyReportsService.getDailyReportById(
        String(dailyReport.id),
        String(saleT2User.employeeId),
        ['SALE']
      );
    } catch (err) {
      crossReportForbidden = true;
    }
    assert(crossReportForbidden, 'Chặn truy cập báo cáo ngày chéo nhóm (Cross-team protection)');

    // Tiện ích xuất dữ liệu Excel
    const exportLeadsRes = await exportService.exportLeads(bossUser, {});
    assert(Boolean(exportLeadsRes.buffer && exportLeadsRes.buffer.length > 0), 'Xuất dữ liệu danh sách khách hàng ra Excel thành công');

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ KỊCH BẢN UAT MÔI TRƯỜNG STAGING ĐÃ VƯỢT QUA 100%! ✅');
    console.log('================================================================\n');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runPhaseSUat()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ UAT THẤT BẠI:', err);
      process.exit(1);
    });
}
