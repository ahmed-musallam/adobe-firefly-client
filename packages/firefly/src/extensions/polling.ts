import {
  jobResultV3,
  type JobPollPayload,
  type JobSucceededPayload,
  type AsyncTaskResponseV3,
} from '../flat';
import type { Client } from '../flat/client/index';
import { pollJob, resolveJobId } from '../../../shared/src/generic-poller';

// all possible job statuses
type FireflyJobStatus =
  | JobPollPayload['status']
  | JobSucceededPayload['status']
  | AsyncTaskResponseV3['status'];
// statuses that indicate the job has completed
const TERMINAL_STATUSES: Set<FireflyJobStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'canceled',
  'timeout',
]);

export interface FireflyPollJobOptions {
  client: Client;
  jobId: string;
  intervalMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type fireflyJobPayload = JobPollPayload | JobSucceededPayload | AsyncTaskResponseV3;

// fetches the job status
const doFetchJob = async (client: Client, jobId: string) => {
  return jobResultV3({ client, path: { jobId } });
};

// extracts the status from the job payload
const getStatusText = (result: fireflyJobPayload | undefined): FireflyJobStatus | undefined => {
  return result?.status;
};

export const pollFireflyJob = async (options: FireflyPollJobOptions) => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<fireflyJobPayload>({
    fetchJob: () => doFetchJob(options.client, jobId),
    getStatusText,
    isTerminal: (status) => TERMINAL_STATUSES.has(status as FireflyJobStatus),
    isSuccess: (status) => status === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
};
