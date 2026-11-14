import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { envConfig } from './config/env.config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { KyselyModule } from './database/kysely.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AcquisitionModule } from './modules/acquisition/acquisition.module';
import { SalesActivitiesModule } from './modules/sales-activities/sales-activities.module';
import { LeadsModule } from './modules/leads/leads.module';
import { DealsModule } from './modules/deals/deals.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { TeamsModule } from './modules/teams/teams.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DailyReportsModule } from './modules/daily-reports/daily-reports.module';
import { WeeklyReportsModule } from './modules/weekly-reports/weekly-reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { ExportModule } from './modules/export/export.module';
import { DynamicOptionsModule } from './modules/dynamic-options/dynamic-options.module';
import { EmployeeAccountsModule } from './modules/employee-accounts/employee-accounts.module';
import { OrganizationChartModule } from './modules/organization-chart/organization-chart.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/rbac/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    KyselyModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    RbacModule,
    AcquisitionModule,
    SalesActivitiesModule,
    LeadsModule,
    DealsModule,
    OrdersModule,
    ProjectsModule,
    PaymentsModule,
    CommissionsModule,
    KpiModule,
    PayrollModule,
    SubscriptionsModule,
    ExpensesModule,
    TeamsModule,
    DashboardModule,
    DailyReportsModule,
    WeeklyReportsModule,
    NotificationsModule,
    StorageModule,
    QueueModule,
    ExportModule,
    DynamicOptionsModule,
    EmployeeAccountsModule,
    OrganizationChartModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
