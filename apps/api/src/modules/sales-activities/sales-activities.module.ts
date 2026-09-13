import { Module } from '@nestjs/common';
import { SalesActivitiesService } from './sales-activities.service';
import { SalesActivitiesController } from './sales-activities.controller';

@Module({
  controllers: [SalesActivitiesController],
  providers: [SalesActivitiesService],
  exports: [SalesActivitiesService],
})
export class SalesActivitiesModule {}
