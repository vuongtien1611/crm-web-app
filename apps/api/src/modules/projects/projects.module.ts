import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { KpiModule } from '../kpi/kpi.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [CommissionsModule, KpiModule, TeamsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
