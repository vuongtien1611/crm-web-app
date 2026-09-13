import { Module } from '@nestjs/common';
import { EmployeeAccountsController } from './employee-accounts.controller';
import { EmployeeAccountsService } from './employee-accounts.service';
import { KyselyModule } from '../../database/kysely.module';
import { RedisModule } from '../../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [KyselyModule, RedisModule, NotificationsModule],
  controllers: [EmployeeAccountsController],
  providers: [EmployeeAccountsService],
  exports: [EmployeeAccountsService],
})
export class EmployeeAccountsModule {}
