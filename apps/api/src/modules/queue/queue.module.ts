import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueProducer } from './queue.producer';
import { NotificationWorker } from './workers/notification.worker';
import { ReminderWorker } from './workers/reminder.worker';
import { MaintenanceWorker } from './workers/maintenance.worker';
import { QueueScheduler } from './scheduler/queue.scheduler';
import { QueueController } from './queue.controller';
import { KyselyModule } from '../../database/kysely.module';

@Global()
@Module({
  imports: [KyselyModule],
  controllers: [QueueController],
  providers: [
    QueueService,
    QueueProducer,
    NotificationWorker,
    ReminderWorker,
    MaintenanceWorker,
    QueueScheduler,
  ],
  exports: [QueueService, QueueProducer],
})
export class QueueModule {}
