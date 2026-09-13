import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { KpiEvaluationService } from './services/kpi-evaluation.service';
import { KyselyModule } from '../../database/kysely.module';
import { RbacModule } from '../rbac/rbac.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [KyselyModule, RbacModule, TeamsModule],
  controllers: [KpiController],
  providers: [KpiService, KpiEvaluationService],
  exports: [KpiService, KpiEvaluationService],
})
export class KpiModule {}

