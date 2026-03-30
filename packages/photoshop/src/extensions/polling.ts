import { facadeJobStatus, getJobStatus, psJobStatus, senseiJobStatus } from '../flat';
import type { Client } from '../flat/client/index';
import type {
  FacadeJobStatusResponse,
  GetJobStatusResponse,
  PsJobResponse,
  SenseiJobApiResponse,
} from '../flat/types.gen';
import {
  type HeaderMap,
  pollJob,
  readHttpHeader,
  resolveJobId,
  SharedPollJobOptions,
  type PollJobResult,
} from '../../../shared/src/generic-poller';

type JobHeaders = HeadersInit & {
  Authorization: string;
  'x-api-key': string;
};

export interface PhotoshopPollJobOptions extends SharedPollJobOptions {
  client: Client;
  jobId: string;
}

const assertPhotoshopJobHeaders = (client: Client): void => {
  const headers = client.getConfig().headers as HeaderMap;
  if (!readHttpHeader(headers, 'Authorization') || !readHttpHeader(headers, 'x-api-key')) {
    throw new Error('Both Authorization and x-api-key headers are required');
  }
};

const TERMINAL = new Set<string>(['succeeded', 'failed']);

const getFacadeStatusText = (data: FacadeJobStatusResponse | undefined) => {
  return data?.status;
};

const getV1MaskStatusText = (data: GetJobStatusResponse | undefined) => {
  return data?.status;
};

const getSenseiStatusText = (data: SenseiJobApiResponse | undefined) => {
  return data?.status;
};

/** Aggregate `/pie/psdService/status` payload from per-output statuses (manifest + PSD jobs). */
const getPsServiceAggregateStatus = (data: PsJobResponse | undefined): string | undefined => {
  if (!data) {
    return undefined;
  }
  const outputs = data.outputs;
  if (!outputs?.length) return 'pending';
  const statuses = outputs?.map((o) => o.status);
  if (statuses?.some((s) => s === 'failed')) return 'failed';
  if (statuses?.every((s) => s === 'succeeded')) return 'succeeded';
  if (statuses?.some((s) => s === 'running')) return 'running';
  return 'pending';
};

const fetchFacade = async (client: Client, jobId: string) => {
  assertPhotoshopJobHeaders(client);
  return facadeJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

const fetchPsService = async (client: Client, jobId: string) => {
  assertPhotoshopJobHeaders(client);
  return psJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

const fetchV1Mask = async (client: Client, jobId: string) => {
  assertPhotoshopJobHeaders(client);
  return getJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

const fetchSensei = async (client: Client, jobId: string) => {
  assertPhotoshopJobHeaders(client);
  return senseiJobStatus({
    client,
    path: { jobId },
    headers: client.getConfig().headers as JobHeaders,
  });
};

/**
 * Polls `GET /v2/status/{jobId}` (Remove Background v2 / `removeBackground`).
 */
export const pollPhotoshopFacadeJob = async (
  options: PhotoshopPollJobOptions
): Promise<PollJobResult<FacadeJobStatusResponse>> => {
  const jobId = resolveJobId(options.jobId);
  return pollJob<FacadeJobStatusResponse>({
    fetchJob: async () => fetchFacade(options.client, jobId),
    getStatusText: getFacadeStatusText,
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
 * Polls `GET /pie/psdService/status/{jobId}` (PSD service async jobs).
 */
export const pollPhotoshopPsdServiceJob = async (
  options: PhotoshopPollJobOptions
): Promise<PollJobResult<PsJobResponse>> => {
  const jobId = resolveJobId(options.jobId);
  return pollJob<PsJobResponse>({
    fetchJob: async () => fetchPsService(options.client, jobId),
    getStatusText: getPsServiceAggregateStatus,
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
 * Polls `GET /v1/status/{jobId}` (masking v1 async jobs).
 */
export const pollPhotoshopMaskingV1Job = async (
  options: PhotoshopPollJobOptions
): Promise<PollJobResult<GetJobStatusResponse>> => {
  const jobId = resolveJobId(options.jobId);
  return pollJob<GetJobStatusResponse>({
    fetchJob: async () => fetchV1Mask(options.client, jobId),
    getStatusText: getV1MaskStatusText,
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
 * Polls `GET /sensei/status/{jobId}` (legacy cutout / mask; deprecated API path).
 */
export const pollPhotoshopSenseiJob = async (
  options: PhotoshopPollJobOptions
): Promise<PollJobResult<SenseiJobApiResponse>> => {
  const jobId = resolveJobId(options.jobId);
  return pollJob<SenseiJobApiResponse>({
    fetchJob: async () => fetchSensei(options.client, jobId),
    getStatusText: getSenseiStatusText,
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
