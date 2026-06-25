import { getJobStatus } from '../flat';
import type { Client } from '../flat/client/index';
import type { JobStatus } from '../flat/types.gen';
import {
  pollJob,
  resolveJobId,
  type SharedPollJobOptions,
} from '../../../shared/src/generic-poller';

type ExpressJobPayload = Awaited<ReturnType<typeof getJobStatus>>['data'];

const TERMINAL_STATUSES = new Set<JobStatus>([
  'cancel_requested',
  'cancelled',
  'failed',
  'partially_succeeded',
  'succeeded',
]);

export interface ExpressPollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

const doFetchJob = async (client: Client, jobId: string) => {
  return getJobStatus({ client, path: { jobId } });
};

const getStatusText = (data: ExpressJobPayload): JobStatus | undefined => {
  return data?.status;
};

export const pollExpressJob = async (options: ExpressPollJobOptions) => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<ExpressJobPayload>({
    ...options,
    fetchJob: () => doFetchJob(options.client, jobId),
    getStatusText,
    isTerminal: (status) => TERMINAL_STATUSES.has(status as JobStatus),
    isSuccess: (status) => status === 'succeeded' || status === 'partially_succeeded',
  });
};
