import { getJobStatus } from '../flat';
import type { Client } from '../flat/client/index';
import type {
  GetConvertPdfToInDesignJobStatusResponse,
  GetDocumentInfoJobStatusResponse,
  GetJobStatusResponse,
} from '../flat/types.gen';
import {
  pollJob,
  resolveJobId,
  SharedPollJobOptions,
  type PollJobResult,
} from '../../../shared/src/generic-poller';

type InDesignJobStatus =
  | 'not_started'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial_success'
  | string;

type InDesignStatusPayload =
  | GetDocumentInfoJobStatusResponse
  | GetConvertPdfToInDesignJobStatusResponse
  | GetJobStatusResponse;

export interface InDesignPollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

const getStatusText = (data: InDesignStatusPayload | undefined): InDesignJobStatus | undefined => {
  return data?.status;
};

// this API expects the headers to be passed, we use the type to enforce that
type JobHeaders = HeadersInit & {
  Authorization: string;
  'x-api-key': string;
  'x-gw-ims-org-id'?: string;
};

// fetches the job status
const doFetchJob = async (client: Client, jobId: string) => {
  const clientHeaders = client.getConfig().headers as JobHeaders;
  if (!clientHeaders?.Authorization || !clientHeaders?.['x-api-key']) {
    throw new Error('Both Authorization and x-api-key headers are required');
  }
  return getJobStatus({
    client: client,
    path: { id: jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

export const pollInDesignJob = async (
  options: InDesignPollJobOptions
): Promise<PollJobResult<InDesignStatusPayload>> => {
  const jobId = resolveJobId(options.jobId);
  const terminal = new Set(['succeeded', 'failed', 'partial_success']);

  return pollJob<InDesignStatusPayload>({
    fetchJob: async () => doFetchJob(options.client, jobId),
    getStatusText,
    isTerminal: (status) => terminal.has(status),
    isSuccess: (status) => status === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
};
