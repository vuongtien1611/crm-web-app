import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ProjectsModule } from '../projects/projects.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { KpiModule } from '../kpi/kpi.module';

@Module({
  imports: [ProjectsModule, CommissionsModule, KpiModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
