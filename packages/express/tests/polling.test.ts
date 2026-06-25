import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as expressFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollExpressJob } from '../src/extensions/polling.js';
import type { JobStatus } from '../src/flat/types.gen.js';

function createConfigOnlyClient(headers: Config['headers']): Client {
  return {
    getConfig: (): Config => ({ headers }) as Config,
  } as unknown as Client;
}

const validHeaders: Config['headers'] = {
  Authorization: 'Bearer test-token',
  'x-api-key': 'test-api-key',
};

const pollOpts = {
  maxAttempts: 5,
  timeoutMs: 10_000,
  minDelayMs: 0,
  maxDelayMs: 10_000,
  intervalMs: 0,
};

function asResult<T>(data: T) {
  return {
    data,
    error: undefined,
    request: new Request('https://express-api.adobe.io'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as { data: T; error: undefined; request: Request; response: Response };
}

describe('express /status/{jobId}', () => {
  let spy: MockInstance<typeof expressFlat.getJobStatus>;

  beforeEach(() => {
    spy = vi.spyOn(expressFlat, 'getJobStatus');
  });
  afterEach(() => spy.mockRestore());

  it('polls to succeeded', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'succeeded' as JobStatus }));
    const r = await pollExpressJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(r.attempts).toBe(1);
    expect(r.result.data?.status).toBe('succeeded');
  });

  it('polls pending then succeeded', async () => {
    spy
      .mockResolvedValueOnce(asResult({ jobId: 'j1', status: 'pending' as JobStatus }))
      .mockResolvedValueOnce(asResult({ jobId: 'j1', status: 'succeeded' as JobStatus }));
    const r = await pollExpressJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('polls running then succeeded', async () => {
    spy
      .mockResolvedValueOnce(asResult({ jobId: 'j1', status: 'running' as JobStatus }))
      .mockResolvedValueOnce(asResult({ jobId: 'j1', status: 'succeeded' as JobStatus }));
    const r = await pollExpressJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('resolves on partially_succeeded', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'partially_succeeded' as JobStatus }));
    const r = await pollExpressJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(r.result.data?.status).toBe('partially_succeeded');
  });

  it('throws on failed', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'failed' as JobStatus }));
    await expect(
      pollExpressJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws on cancelled', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'cancelled' as JobStatus }));
    await expect(
      pollExpressJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws on cancel_requested', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'cancel_requested' as JobStatus }));
    await expect(
      pollExpressJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingIdResolutionError for blank jobId', async () => {
    await expect(
      pollExpressJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: '  ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws PollingTimeoutError when job stays running', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'running' as JobStatus }));
    await expect(
      pollExpressJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 60_000,
        minDelayMs: 0,
        maxDelayMs: 10_000,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTimeoutError' });
  });

  it('throws PollingAbortedError on signal abort', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'running' as JobStatus }));
    const ac = new AbortController();
    const p = pollExpressJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 60_000,
      minDelayMs: 0,
      intervalMs: 100,
      maxDelayMs: 10_000,
      signal: ac.signal,
    });
    queueMicrotask(() => ac.abort());
    await expect(p).rejects.toThrow(PollingAbortedError);
  });
});
