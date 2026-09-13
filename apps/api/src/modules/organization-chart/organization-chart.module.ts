import { Module } from '@nestjs/common';
import { OrganizationChartController } from './organization-chart.controller';
import { OrganizationChartService } from './organization-chart.service';
import { KyselyModule } from '../../database/kysely.module';

@Module({
  imports: [KyselyModule],
  controllers: [OrganizationChartController],
  providers: [OrganizationChartService],
  exports: [OrganizationChartService],
})
export class OrganizationChartModule {}
