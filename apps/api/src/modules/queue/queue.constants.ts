export const QUEUE_NAMES = {
  NOTIFICATIONS: 'crm-notifications',
  REMINDERS: 'crm-reminders',
  MAINTENANCE: 'crm-maintenance',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const JOB_TYPES = {
  // Notifications
  SEND_NOTIFICATION: 'send-notification',
  
  // Reminders
  DETECT_OVERDUE_INSTALLMENTS: 'detect-overdue-installments',
  SERVICE_PERIOD_REMINDER: 'service-period-reminder',
  DAILY_REPORT_REMINDER: 'daily-report-reminder',

  // Maintenance
  RETRY_STORAGE_CLEANUP: 'retry-storage-cleanup',
  PURGE_OLD_AUDIT_LOGS: 'purge-old-audit-logs',
} as const;

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];

export const DEFAULT_RETRY_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1500,
  },
  removeOnComplete: {
    age: 24 * 3600, // keep for 24h
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep for 7 days
    count: 1000,
  },
};

// ============================================================================
// BUSINESS RULES & CONFIGURATION STATUS:
// - REMINDER LEAD TIME = OPEN BUSINESS RULE (Must be explicitly configured; NO hardcoded default)
// - SCHEDULER EXECUTION TIMES = CONFIGURATION / OPEN (Not canonical business rules)
// - DAILY REPORT REMINDER SCHEDULE = OPEN BUSINESS RULE
// ============================================================================

