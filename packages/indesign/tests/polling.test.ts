import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as indesignFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollInDesignJob } from '../src/extensions/polling.js';
import type {
  FailedEvent,
  GetJobStatusResponse,
  PartialSuccessEvent,
  RunningEvent,
  SucceededEvent,
} from '../src/flat/types.gen.js';

/** Minimal `Client` used by `doFetchJob` (only `getConfig` is read). */
function createConfigOnlyClient(headers: Config['headers']): Client {
  return {
    getConfig: (): Config => ({ headers }) as Config,
  } as unknown as Client;
}

const validHeaders: Config['headers'] = {
  Authorization: 'Bearer test-token',
  'x-api-key': 'test-api-key',
};

type GetJobStatusResolved = Awaited<ReturnType<typeof indesignFlat.getJobStatus>>;

/** Fields-style success shape returned by `getJobStatus` for tests. */
function makeFieldsResult(data: GetJobStatusResponse): GetJobStatusResolved {
  return {
    data,
    error: undefined,
    request: new Request('https://example.com/v3/status/job-1'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as GetJobStatusResolved;
}

function succeededEvent(jobId = 'job-1'): SucceededEvent {
  return { jobId, status: 'succeeded' };
}

function runningEvent(jobId = 'job-1'): RunningEvent {
  return { jobId, status: 'running' };
}

function failedEvent(jobId = 'job-1'): FailedEvent {
  return { jobId, status: 'failed' };
}

function partialSuccessEvent(jobId = 'job-1'): PartialSuccessEvent {
  return { jobId, status: 'partial_success' };
}

describe('indesign polling adapter', () => {
  let getJobStatusSpy: MockInstance<typeof indesignFlat.getJobStatus>;

  beforeEach(() => {
    getJobStatusSpy = vi.spyOn(indesignFlat, 'getJobStatus');
  });

  afterEach(() => {
    getJobStatusSpy.mockRestore();
  });

  it('polls to terminal success', async () => {
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(succeededEvent()));
    const result = await pollInDesignJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(result.attempts).toBe(1);
    expect(result.result.data?.status).toBe('succeeded');
  });

  it('throws when Authorization header is missing', async () => {
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient({ 'x-api-key': 'k' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws when x-api-key header is missing', async () => {
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient({ Authorization: 'Bearer x' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(succeededEvent()));
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: '   ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingTerminalFailureError when status is missing on payload', async () => {
    const withoutStatus = { jobId: 'j' } as GetJobStatusResponse;
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(withoutStatus));
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError on terminal failed', async () => {
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(failedEvent()));
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({
      name: 'PollingTerminalFailureError',
      message: expect.stringContaining('failed'),
    });
  });

  it('throws PollingTerminalFailureError on partial_success', async () => {
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(partialSuccessEvent()));
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('polls until running then succeeded', async () => {
    getJobStatusSpy
      .mockResolvedValueOnce(makeFieldsResult(runningEvent()))
      .mockResolvedValueOnce(makeFieldsResult(succeededEvent()));
    const result = await pollInDesignJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
    expect(result.result.data?.status).toBe('succeeded');
  });

  it('throws PollingTimeoutError after max attempts', async () => {
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(runningEvent()));
    await expect(
      pollInDesignJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 3,
        timeoutMs: 60_000,
        minDelayMs: 0,
        intervalMs: 0,
        maxDelayMs: 10_000,
      })
    ).rejects.toMatchObject({
      name: 'PollingTimeoutError',
      message: expect.stringContaining('max attempts'),
    });
  });

  it('throws PollingAbortedError when signal aborts during backoff', async () => {
    const ac = new AbortController();
    getJobStatusSpy.mockResolvedValue(makeFieldsResult(runningEvent()));
    const p = pollInDesignJob({
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
