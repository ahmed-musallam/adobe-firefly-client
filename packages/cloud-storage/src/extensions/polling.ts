import { getJobStatus } from '../flat';
import type { Client } from '../flat/client/index';
import type { JobStatus } from '../flat/types.gen';
import {
  pollJob,
  resolveJobId,
  SharedPollJobOptions,
  type PollJobResult,
} from '../../../shared/src/generic-poller';

/** Cloud Storage async jobs use IMS bearer tokens only (see OpenAPI `Authorization` security). */
type JobHeaders = HeadersInit & {
  Authorization: string;
};

export interface CloudStoragePollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

const TERMINAL = new Set<JobStatus['status']>(['succeeded', 'failed', 'partially_succeeded']);

const assertJobHeaders = (client: Client): void => {
  const clientHeaders = client.getConfig().headers as JobHeaders;
  if (!clientHeaders?.Authorization) {
    throw new Error('Authorization header is required');
  }
};

const getStatusText = (data: JobStatus | undefined) => {
  return data?.status;
};

const fetchJobStatus = async (client: Client, jobId: string) => {
  assertJobHeaders(client);
  return getJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

/**
 * Polls `GET /status/{jobId}` for async jobs (upload finalize, copy, move, etc.).
 */
export const pollCloudStorageJob = async (
  options: CloudStoragePollJobOptions
): Promise<PollJobResult<JobStatus>> => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<JobStatus>({
    fetchJob: async () => fetchJobStatus(options.client, jobId),
    getStatusText,
    isTerminal: (status) => TERMINAL.has(status as JobStatus['status']),
    isSuccess: (status) => status === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    minDelayMs: options.minDelayMs,
    maxDelayMs: options.maxDelayMs,
    signal: options.signal,
  });
};
