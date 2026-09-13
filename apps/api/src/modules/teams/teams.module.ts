import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { KyselyModule } from '../../database/kysely.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [KyselyModule, RbacModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
