import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { LeadsModule } from '../leads/leads.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProjectsModule } from '../projects/projects.module';
import { KpiModule } from '../kpi/kpi.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { TeamsModule } from '../teams/teams.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    LeadsModule,
    OrdersModule,
    PaymentsModule,
    ProjectsModule,
    KpiModule,
    PayrollModule,
    ExpensesModule,
    TeamsModule,
    RbacModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
