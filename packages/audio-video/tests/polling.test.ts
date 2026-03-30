import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as audioVideoFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollAudioVideoJob, pollAudioVideoReframeV2Job } from '../src/extensions/polling.js';
import type { JobResultV2Response, JobStatus, StatusApiResponse } from '../src/flat/types.gen.js';

function createConfigOnlyClient(headers: Config['headers']): Client {
  return {
    getConfig: (): Config => ({ headers }) as Config,
  } as unknown as Client;
}

const validHeaders: Config['headers'] = {
  Authorization: 'Bearer test-token',
  'x-api-key': 'test-api-key',
};

type StatusResolved = Awaited<ReturnType<typeof audioVideoFlat.status>>;
type JobResultV2Resolved = Awaited<ReturnType<typeof audioVideoFlat.jobResultV2>>;

function makeV1Result(data: StatusApiResponse): StatusResolved {
  return {
    data,
    error: undefined,
    request: new Request('https://example.com/v1/status/job-1'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as StatusResolved;
}

function makeV2Result(data: JobResultV2Response): JobResultV2Resolved {
  return {
    data,
    error: undefined,
    request: new Request('https://example.com/v2/status/job-1'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as JobResultV2Resolved;
}

describe('audio-video v1 polling (/v1/status)', () => {
  let statusSpy: MockInstance<typeof audioVideoFlat.status>;

  beforeEach(() => {
    statusSpy = vi.spyOn(audioVideoFlat, 'status');
  });

  afterEach(() => {
    statusSpy.mockRestore();
  });

  it('polls to terminal success', async () => {
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1', status: 'succeeded' }));
    const result = await pollAudioVideoJob({
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
      pollAudioVideoJob({
        client: createConfigOnlyClient({ 'x-api-key': 'k' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('throws when x-api-key header is missing', async () => {
    await expect(
      pollAudioVideoJob({
        client: createConfigOnlyClient({ Authorization: 'Bearer x' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1', status: 'succeeded' }));
    await expect(
      pollAudioVideoJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: '   ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingTerminalFailureError when response data is undefined', async () => {
    statusSpy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com/v1/status/job-1'),
      response: new Response('{}'),
    } as unknown as StatusResolved);
    await expect(
      pollAudioVideoJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError when status field is missing', async () => {
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1' }));
    await expect(
      pollAudioVideoJob({
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
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1', status: 'failed' }));
    await expect(
      pollAudioVideoJob({
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

  it('throws PollingTerminalFailureError on partially_succeeded (DGR)', async () => {
    const partial: JobStatus = {
      jobId: 'job-1',
      status: 'partially_succeeded',
    };
    statusSpy.mockResolvedValue(makeV1Result(partial));
    await expect(
      pollAudioVideoJob({
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
    statusSpy
      .mockResolvedValueOnce(makeV1Result({ jobId: 'job-1', status: 'running' }))
      .mockResolvedValueOnce(makeV1Result({ jobId: 'job-1', status: 'succeeded' }));
    const result = await pollAudioVideoJob({
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

  it('polls until not_started then succeeded', async () => {
    const notStarted: JobStatus = { jobId: 'job-1', status: 'not_started' };
    statusSpy
      .mockResolvedValueOnce(makeV1Result(notStarted))
      .mockResolvedValueOnce(makeV1Result({ jobId: 'job-1', status: 'succeeded' }));
    const result = await pollAudioVideoJob({
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

  it('polls until pending then succeeded', async () => {
    statusSpy
      .mockResolvedValueOnce(makeV1Result({ jobId: 'job-1', status: 'pending' }))
      .mockResolvedValueOnce(makeV1Result({ jobId: 'job-1', status: 'succeeded' }));
    const result = await pollAudioVideoJob({
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
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1', status: 'running' }));
    await expect(
      pollAudioVideoJob({
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
    statusSpy.mockResolvedValue(makeV1Result({ jobId: 'job-1', status: 'running' }));
    const p = pollAudioVideoJob({
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

describe('audio-video v2 reframe polling (/v2/status)', () => {
  let jobResultV2Spy: MockInstance<typeof audioVideoFlat.jobResultV2>;

  beforeEach(() => {
    jobResultV2Spy = vi.spyOn(audioVideoFlat, 'jobResultV2');
  });

  afterEach(() => {
    jobResultV2Spy.mockRestore();
  });

  it('polls to terminal success', async () => {
    jobResultV2Spy.mockResolvedValue(
      makeV2Result({
        jobId: 'job-1',
        status: 'succeeded',
        outputs: [{ destination: { url: 'https://x' } }],
      })
    );
    const result = await pollAudioVideoReframeV2Job({
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
      pollAudioVideoReframeV2Job({
        client: createConfigOnlyClient({ 'x-api-key': 'k' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(jobResultV2Spy).not.toHaveBeenCalled();
  });

  it('throws when x-api-key header is missing', async () => {
    await expect(
      pollAudioVideoReframeV2Job({
        client: createConfigOnlyClient({ Authorization: 'Bearer x' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(jobResultV2Spy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    jobResultV2Spy.mockResolvedValue(
      makeV2Result({
        jobId: 'job-1',
        status: 'succeeded',
        outputs: [{ destination: { url: 'https://x' } }],
      })
    );
    await expect(
      pollAudioVideoReframeV2Job({
        client: createConfigOnlyClient(validHeaders),
        jobId: '   ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(jobResultV2Spy).not.toHaveBeenCalled();
  });

  it('throws PollingTerminalFailureError when response data is undefined', async () => {
    jobResultV2Spy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com/v2/status/job-1'),
      response: new Response('{}'),
    } as unknown as JobResultV2Resolved);
    await expect(
      pollAudioVideoReframeV2Job({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError when status field is missing', async () => {
    jobResultV2Spy.mockResolvedValue(makeV2Result({ jobId: 'job-1' } as JobResultV2Response));
    await expect(
      pollAudioVideoReframeV2Job({
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
    jobResultV2Spy.mockResolvedValue(
      makeV2Result({
        jobId: 'job-1',
        status: 'failed',
        outputs: {
          renditions: [{ error: { error_code: 'E1', message: 'reframe failed' } }],
        },
      })
    );
    await expect(
      pollAudioVideoReframeV2Job({
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

  it('throws PollingTerminalFailureError on partially_succeeded', async () => {
    jobResultV2Spy.mockResolvedValue(
      makeV2Result({
        jobId: 'job-1',
        status: 'partially_succeeded',
        outputs: [{ destination: { url: 'https://x' } }],
      })
    );
    await expect(
      pollAudioVideoReframeV2Job({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('polls until not_started then succeeded', async () => {
    jobResultV2Spy
      .mockResolvedValueOnce(makeV2Result({ jobId: 'job-1', status: 'not_started' }))
      .mockResolvedValueOnce(
        makeV2Result({
          jobId: 'job-1',
          status: 'succeeded',
          outputs: [{ destination: { url: 'https://x' } }],
        })
      );
    const result = await pollAudioVideoReframeV2Job({
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
    jobResultV2Spy
      .mockResolvedValueOnce(makeV2Result({ jobId: 'job-1', status: 'running' }))
      .mockResolvedValueOnce(
        makeV2Result({
          jobId: 'job-1',
          status: 'succeeded',
          outputs: [{ destination: { url: 'https://x' } }],
        })
      );
    const result = await pollAudioVideoReframeV2Job({
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
    jobResultV2Spy.mockResolvedValue(makeV2Result({ jobId: 'job-1', status: 'running' }));
    await expect(
      pollAudioVideoReframeV2Job({
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
    jobResultV2Spy.mockResolvedValue(makeV2Result({ jobId: 'job-1', status: 'running' }));
    const p = pollAudioVideoReframeV2Job({
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
