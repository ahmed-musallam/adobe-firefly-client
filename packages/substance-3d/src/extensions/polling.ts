import type { Client } from '../flat/client/index';
import type { Restv1BetaComposeSceneResponse } from '../flat/types.gen';
import {
  type HeaderMap,
  pollJob,
  readHttpHeader,
  resolveJobId,
  SharedPollJobOptions,
  type PollJobResult,
} from '../../../shared/src/generic-poller';

/**
 * Async job document returned by `GET /v1/jobs/{id}`.
 * The OpenAPI spec lists this path without operations; the shape matches 202 responses from compose/render/etc.
 */
export type Substance3dJobPollPayload = Restv1BetaComposeSceneResponse;

export interface Substance3dPollJobOptions extends SharedPollJobOptions {
  client: Client;
  /** Job id from the async API `202` response (`id` field). */
  jobId: string;
}

const TERMINAL = new Set<string>(['succeeded', 'failed']);

const assertJobHeaders = (client: Client): void => {
  if (!readHttpHeader(client.getConfig().headers as HeaderMap, 'Authorization')) {
    throw new Error('Authorization header is required');
  }
};

const getStatusText = (data: Substance3dJobPollPayload | undefined) => {
  return data?.status;
};

const fetchSubstanceJobStatus = async (client: Client, jobId: string) => {
  assertJobHeaders(client);
  return client.get<{ 200: Substance3dJobPollPayload }>({
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/v1/jobs/{id}',
    path: { id: jobId },
    headers: client.getConfig().headers,
  });
};

/**
 * Polls `GET /v1/jobs/{id}` for Substance 3D async jobs (compose, render, convert, etc.).
 */
export const pollSubstance3dJob = async (
  options: Substance3dPollJobOptions
): Promise<PollJobResult<Substance3dJobPollPayload>> => {
  const jobId = resolveJobId(options.jobId);

  return pollJob<Substance3dJobPollPayload>({
    fetchJob: async () => fetchSubstanceJobStatus(options.client, jobId),
    getStatusText,
    isTerminal: (status) => TERMINAL.has(status),
    isSuccess: (status) => status === 'succeeded',
    intervalMs: options.intervalMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    minDelayMs: options.minDelayMs,
    maxDelayMs: options.maxDelayMs,
    signal: options.signal,
  });
};
