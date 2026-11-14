import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TeamsModule } from '../teams/teams.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TeamsModule, RbacModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
