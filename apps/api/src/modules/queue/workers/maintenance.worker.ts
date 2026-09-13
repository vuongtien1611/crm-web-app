import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QueueService } from '../queue.service';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { RetryStorageCleanupJobData } from '../queue.types';
import { StorageService } from '../../storage/storage.service';
import { KyselyService } from '../../../database/kysely.service';

@Injectable()
export class MaintenanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceWorker.name);
  private worker!: Worker;

  constructor(
    private readonly queueService: QueueService,
    private readonly storageService: StorageService,
    private readonly kysely: KyselyService,
  ) {}

  onModuleInit() {
    const connection = this.queueService.getRedisConnectionOptions();
    this.worker = new Worker(
      QUEUE_NAMES.MAINTENANCE,
      async (job: Job) => {
        this.logger.log(`[MaintenanceWorker] Processing job ${job.id} (type: ${job.name}, attempt: ${job.attemptsMade + 1})`);

        if (job.name === JOB_TYPES.RETRY_STORAGE_CLEANUP) {
          return await this.handleRetryStorageCleanup(job as Job<RetryStorageCleanupJobData>);
        } else {
          this.logger.warn(`[MaintenanceWorker] Unknown job name: ${job.name}`);
        }
      },
      {
        connection,
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[MaintenanceWorker] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`[MaintenanceWorker] Job ${job?.id} failed with error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('MaintenanceWorker closed');
    }
  }

  /**
   * Safe Storage Cleanup Retry:
   * 1. Checks if objectKey is actively referenced in any canonical table.
   * 2. If referenced -> ABORTS cleanup to prevent data corruption.
   * 3. If unreferenced -> Safe to delete from storage provider.
   */
  async handleRetryStorageCleanup(job: Job<RetryStorageCleanupJobData>) {
    const { objectKey } = job.data;
    if (!objectKey) {
      return { skipped: true, reason: 'EMPTY_OBJECT_KEY' };
    }

    // Safety check: verify object is NOT referenced in DB
    const isReferenced = await this.isObjectReferencedInDb(objectKey);
    if (isReferenced) {
      this.logger.warn(
        `[SAFETY ABORT] Object ${objectKey} is actively referenced in DB. Refusing to delete!`,
      );
      return { deleted: false, reason: 'ACTIVELY_REFERENCED_IN_DB' };
    }

    // Safe to delete
    await this.storageService.deleteFile(objectKey);
    this.logger.log(`[MaintenanceWorker] Safely deleted orphan object: ${objectKey}`);
    return { deleted: true, objectKey };
  }

  /**
   * Check canonical tables that hold object keys.
   */
  private async isObjectReferencedInDb(objectKey: string): Promise<boolean> {
    const inPayments = await this.kysely.db
      .selectFrom('payments')
      .select('id')
      .where('evidence_url', '=', objectKey)
      .executeTakeFirst();
    if (inPayments) return true;

    const inProjectAcceptances = await this.kysely.db
      .selectFrom('project_acceptances')
      .select('id')
      .where('evidence_document', '=', objectKey)
      .executeTakeFirst();
    if (inProjectAcceptances) return true;

    const inServicePeriodAcceptances = await this.kysely.db
      .selectFrom('service_period_acceptances')
      .select('id')
      .where('evidence_document', '=', objectKey)
      .executeTakeFirst();
    if (inServicePeriodAcceptances) return true;

    const inProjectAttachments = await this.kysely.db
      .selectFrom('project_attachments')
      .select('id')
      .where('file_url', '=', objectKey)
      .executeTakeFirst();
    if (inProjectAttachments) return true;

    const inOrderDocuments = await this.kysely.db
      .selectFrom('order_documents')
      .select('id')
      .where('file_url', '=', objectKey)
      .executeTakeFirst();
    if (inOrderDocuments) return true;

    return false;
  }
}
