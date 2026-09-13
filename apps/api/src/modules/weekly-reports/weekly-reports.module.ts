import { Module } from '@nestjs/common';
import { WeeklyReportsService } from './weekly-reports.service';
import { WeeklyReportsController } from './weekly-reports.controller';
import { KyselyModule } from '../../database/kysely.module';

@Module({
  imports: [KyselyModule],
  controllers: [WeeklyReportsController],
  providers: [WeeklyReportsService],
  exports: [WeeklyReportsService],
})
export class WeeklyReportsModule {}
