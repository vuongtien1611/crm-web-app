import { JobType } from './queue.constants';

export interface BaseJobData {
  jobType: JobType;
  traceId?: string;
  createdAt?: string;
}

export interface SendNotificationJobData extends BaseJobData {
  jobType: 'send-notification';
  employeeId: string | number;
  eventType: string;
  title: string;
  content: string;
  deepLinkUrl?: string;
  entityType?: string;
  entityId?: string | number;
}

export interface DetectOverdueInstallmentsJobData extends BaseJobData {
  jobType: 'detect-overdue-installments';
  asOfDate?: string; // YYYY-MM-DD
}

export interface ServicePeriodReminderJobData extends BaseJobData {
  jobType: 'service-period-reminder';
  leadDays?: number;
  asOfDate?: string;
}

export interface DailyReportReminderJobData extends BaseJobData {
  jobType: 'daily-report-reminder';
  reportDate?: string; // YYYY-MM-DD
}

export interface RetryStorageCleanupJobData extends BaseJobData {
  jobType: 'retry-storage-cleanup';
  objectKey: string;
}

export type QueueJobData =
  | SendNotificationJobData
  | DetectOverdueInstallmentsJobData
  | ServicePeriodReminderJobData
  | DailyReportReminderJobData
  | RetryStorageCleanupJobData;

export interface QueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}
