import { lrJobStatus } from '../flat';
import type { Client } from '../flat/client/index';
import type { JobStatus, LrJobApiResponse } from '../flat/types.gen';
import {
  pollJob,
  resolveJobId,
  SharedPollJobOptions,
  type PollJobResult,
} from '../../../shared/src/generic-poller';

// this API expects the headers to be passed, we use the type to enforce that
type JobHeaders = HeadersInit & {
  Authorization: string;
  'x-api-key': string;
};

export interface LightroomPollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

// Lightroom job statuses
const STATUS: Record<JobStatus, JobStatus> = {
  pending: 'pending',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
} as const;

const TERMINAL = new Set<JobStatus>([STATUS.succeeded, STATUS.failed]);

// Derives aggregate status from `LrJobApiResponse.outputs` (per Lightroom job status schema).
const getStatusText = (data: LrJobApiResponse | undefined): JobStatus | undefined => {
  if (!data) {
    return undefined;
  }
  const outputs = data.outputs;
  if (!outputs?.length) return STATUS.pending;
  const statuses = outputs?.map((o) => o.status);
  if (statuses?.some((s) => s === STATUS.failed)) return STATUS.failed;
  if (statuses?.every((s) => s === STATUS.succeeded)) return STATUS.succeeded;
  if (statuses?.some((s) => s === STATUS.running)) return STATUS.running;
  return STATUS.pending;
};

// Validate client and fetch job status
const doFetchJob = async (client: Client, jobId: string) => {
  const clientHeaders = client.getConfig().headers as JobHeaders;
  if (!clientHeaders?.Authorization || !clientHeaders?.['x-api-key']) {
    throw new Error(
      'Both Authorization and x-api-key headers are required, did you configure the client with auth/headers?'
    );
  }
  return lrJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

export const pollLightroomJob = async (
  options: LightroomPollJobOptions
): Promise<PollJobResult<LrJobApiResponse>> => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<LrJobApiResponse>({
    ...options,
    fetchJob: async () => doFetchJob(options.client, jobId),
    getStatusText,
    isTerminal: (status) => TERMINAL.has(status as JobStatus),
    isSuccess: (status) => status === STATUS.succeeded,
  });
};
