import { Module } from '@nestjs/common';
import { DailyReportsService } from './daily-reports.service';
import { DailyReportsReadService } from './daily-reports-read.service';
import { DailyReportsQueryService } from './daily-reports-query.service';
import { DailyReportsController } from './daily-reports.controller';

@Module({
  controllers: [DailyReportsController],
  providers: [DailyReportsService, DailyReportsReadService, DailyReportsQueryService],
  exports: [DailyReportsService],
})
export class DailyReportsModule {}
