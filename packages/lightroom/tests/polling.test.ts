import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as lightroomFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollLightroomJob } from '../src/extensions/polling.js';
import type { JobOutputDetails, LrJobApiResponse } from '../src/flat/types.gen.js';

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

type LrJobStatusResolved = Awaited<ReturnType<typeof lightroomFlat.lrJobStatus>>;

function makeStatusResult(data: LrJobApiResponse): LrJobStatusResolved {
  return {
    data,
    error: undefined,
    request: new Request('https://example.com/lrService/status/job-1'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as LrJobStatusResolved;
}

function output(overrides: Partial<JobOutputDetails> = {}): JobOutputDetails {
  return { input: '/in.jpg', status: 'succeeded', ...overrides };
}

describe('lightroom polling adapter', () => {
  let lrJobStatusSpy: MockInstance<typeof lightroomFlat.lrJobStatus>;

  beforeEach(() => {
    lrJobStatusSpy = vi.spyOn(lightroomFlat, 'lrJobStatus');
  });

  afterEach(() => {
    lrJobStatusSpy.mockRestore();
  });

  it('polls to terminal success', async () => {
    lrJobStatusSpy.mockResolvedValue(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(result.attempts).toBe(1);
    expect(result.result.data?.outputs?.[0]?.status).toBe('succeeded');
  });

  it('throws when Authorization header is missing', async () => {
    await expect(
      pollLightroomJob({
        client: createConfigOnlyClient({ 'x-api-key': 'k' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(lrJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws when x-api-key header is missing', async () => {
    await expect(
      pollLightroomJob({
        client: createConfigOnlyClient({ Authorization: 'Bearer x' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(lrJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    lrJobStatusSpy.mockResolvedValue(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    await expect(
      pollLightroomJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: '   ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(lrJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingTerminalFailureError when response data is undefined', async () => {
    lrJobStatusSpy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com/lrService/status/job-1'),
      response: new Response('{}'),
    } as LrJobStatusResolved);
    await expect(
      pollLightroomJob({
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
    lrJobStatusSpy.mockResolvedValue(
      makeStatusResult({ jobId: 'job-1', outputs: [output({ status: 'failed' })] })
    );
    await expect(
      pollLightroomJob({
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

  it('aggregates failed across multiple outputs', async () => {
    lrJobStatusSpy.mockResolvedValue(
      makeStatusResult({
        jobId: 'job-1',
        outputs: [output({ status: 'succeeded' }), output({ status: 'failed' })],
      })
    );
    await expect(
      pollLightroomJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('polls until empty outputs then succeeded', async () => {
    lrJobStatusSpy
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [] }))
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
  });

  it('polls until outputs without status then succeeded', async () => {
    lrJobStatusSpy
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [{ input: '/a.jpg' }] }))
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
  });

  it('polls until running then succeeded', async () => {
    lrJobStatusSpy
      .mockResolvedValueOnce(
        makeStatusResult({ jobId: 'job-1', outputs: [output({ status: 'running' })] })
      )
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
  });

  it('treats mixed succeeded and running as non-terminal', async () => {
    lrJobStatusSpy
      .mockResolvedValueOnce(
        makeStatusResult({
          jobId: 'job-1',
          outputs: [output({ status: 'succeeded' }), output({ status: 'running' })],
        })
      )
      .mockResolvedValueOnce(
        makeStatusResult({
          jobId: 'job-1',
          outputs: [output({ status: 'succeeded' }), output({ status: 'succeeded' })],
        })
      );
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
  });

  it('treats all pending outputs as non-terminal', async () => {
    lrJobStatusSpy
      .mockResolvedValueOnce(
        makeStatusResult({
          jobId: 'job-1',
          outputs: [output({ status: 'pending' }), output({ status: 'pending' })],
        })
      )
      .mockResolvedValueOnce(makeStatusResult({ jobId: 'job-1', outputs: [output()] }));
    const result = await pollLightroomJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 5,
      timeoutMs: 10_000,
      minDelayMs: 0,
      intervalMs: 0,
      maxDelayMs: 10_000,
    });
    expect(result.attempts).toBe(2);
  });

  it('throws PollingTimeoutError after max attempts', async () => {
    lrJobStatusSpy.mockResolvedValue(
      makeStatusResult({ jobId: 'job-1', outputs: [output({ status: 'running' })] })
    );
    await expect(
      pollLightroomJob({
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
    lrJobStatusSpy.mockResolvedValue(
      makeStatusResult({ jobId: 'job-1', outputs: [output({ status: 'running' })] })
    );
    const p = pollLightroomJob({
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
