import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { KyselyModule } from '../../database/kysely.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [KyselyModule, TeamsModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
