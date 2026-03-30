import { jobResultV2, status } from '../flat';
import type { Client } from '../flat/client/index';
import type { JobResultV2Response, StatusApiResponse } from '../flat/types.gen';
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

export interface AudioVideoPollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

/** v1 + v2 job status strings that end polling (non-success except `succeeded`). */
const TERMINAL = new Set<string>(['succeeded', 'failed', 'partially_succeeded']);

const assertJobHeaders = (client: Client): void => {
  const clientHeaders = client.getConfig().headers as JobHeaders;
  if (!clientHeaders?.Authorization || !clientHeaders?.['x-api-key']) {
    throw new Error('Both Authorization and x-api-key headers are required');
  }
};

// both v1 and v2 job statuses are string, so we can use the same function for both
const getStatusText = (
  data: StatusApiResponse | JobResultV2Response | undefined
): string | undefined => {
  return data?.status;
};

const fetchV1Status = async (client: Client, jobId: string) => {
  assertJobHeaders(client);
  return status({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

const fetchV2JobResult = async (client: Client, jobId: string) => {
  assertJobHeaders(client);
  return jobResultV2({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

/**
 * Polls `GET /v1/status/{jobId}` (speech, DGR, dub, transcribe, v1 reframe, etc.).
 */
export const pollAudioVideoJob = async (
  options: AudioVideoPollJobOptions
): Promise<PollJobResult<StatusApiResponse>> => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<StatusApiResponse>({
    fetchJob: async () => fetchV1Status(options.client, jobId),
    getStatusText,
    isTerminal: (s) => TERMINAL.has(s),
    isSuccess: (s) => s === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    minDelayMs: options.minDelayMs,
    maxDelayMs: options.maxDelayMs,
    signal: options.signal,
  });
};

/**
 * Polls `GET /v2/status/{jobId}` for reframed-video jobs from `generateReframedVideoV2`.
 */
export const pollAudioVideoReframeV2Job = async (
  options: AudioVideoPollJobOptions
): Promise<PollJobResult<JobResultV2Response>> => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<JobResultV2Response>({
    fetchJob: async () => fetchV2JobResult(options.client, jobId),
    getStatusText,
    isTerminal: (s) => TERMINAL.has(s),
    isSuccess: (s) => s === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    minDelayMs: options.minDelayMs,
    maxDelayMs: options.maxDelayMs,
    signal: options.signal,
  });
};
