import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionQueryReader } from './subscription-query.reader';
import { KyselyModule } from '../../database/kysely.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [KyselyModule, CommissionsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionQueryReader],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
