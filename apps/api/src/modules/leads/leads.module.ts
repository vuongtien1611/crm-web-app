import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { TeamsModule } from '../teams/teams.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TeamsModule, RbacModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
