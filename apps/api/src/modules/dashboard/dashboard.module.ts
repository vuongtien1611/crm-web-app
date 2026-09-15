import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { KyselyModule } from '../../database/kysely.module';

@Module({
  imports: [KyselyModule],
  controllers: [DashboardController, FinanceController],
  providers: [DashboardService, FinanceService],
  exports: [DashboardService, FinanceService],
})
export class DashboardModule {}
