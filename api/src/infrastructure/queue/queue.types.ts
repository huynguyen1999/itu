export type AiQueueJobType = 'card-suggestions' | 'session-feedback';

export interface AiQueueJob {
  type: AiQueueJobType;
  jobId: string;
}

export interface ScheduledQueueJob {
  type: 'scheduled-job';
  jobId: string;
}
