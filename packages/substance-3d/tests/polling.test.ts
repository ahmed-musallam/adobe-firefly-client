import { describe, expect, it, vi } from 'vitest';

import { createClient } from '../src/flat/client/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollSubstance3dJob } from '../src/extensions/polling.js';
import type { Restv1BetaComposeSceneResponse } from '../src/flat/types.gen.js';

type Client = ReturnType<typeof createClient>;

const validHeaders = {
  Authorization: 'Bearer test-token',
};

function baseJob(
  overrides: Partial<Restv1BetaComposeSceneResponse> = {}
): Restv1BetaComposeSceneResponse {
  return {
    bugReportUrl: 'https://example.com/bug',
    id: 'job-1',
    status: 'succeeded',
    url: 'https://example.com/jobs/job-1',
    ...overrides,
  };
}

describe('substance-3d polling adapter', () => {
  it('polls to terminal success', async () => {
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: baseJob({ status: 'succeeded' }),
      error: undefined,
      request: new Request('https://s3d.adobe.io/v1/jobs/job-1'),
      response: new Response('{}', { headers: { 'Retry-After': '0' } }),
    } as Awaited<ReturnType<Client['get']>>);

    const result = await pollSubstance3dJob({
      client,
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(result.attempts).toBe(1);
    expect(result.result.data?.status).toBe('succeeded');
    expect(client.get).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/jobs/{id}',
        path: { id: 'job-1' },
      })
    );
  });

  it('throws when Authorization header is missing', async () => {
    const client = createClient({ headers: {} });
    vi.spyOn(client, 'get');
    await expect(
      pollSubstance3dJob({
        client,
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Authorization header is required');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('throws when headers are undefined', async () => {
    const client = createClient();
    vi.spyOn(client, 'get');
    await expect(
      pollSubstance3dJob({
        client,
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Authorization header is required');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: baseJob(),
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<Client['get']>>);
    await expect(
      pollSubstance3dJob({
        client,
        jobId: '   ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('throws PollingTerminalFailureError when response data is undefined', async () => {
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<Client['get']>>);
    await expect(
      pollSubstance3dJob({
        client,
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError when status is missing', async () => {
    const client = createClient({ headers: validHeaders });
    const noStatus = { ...baseJob(), status: undefined as unknown as string };
    vi.spyOn(client, 'get').mockResolvedValue({
      data: noStatus,
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<Client['get']>>);
    await expect(
      pollSubstance3dJob({
        client,
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError on failed', async () => {
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: baseJob({ status: 'failed' }),
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<Client['get']>>);
    await expect(
      pollSubstance3dJob({
        client,
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

  it('polls until not_started then succeeded', async () => {
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get')
      .mockResolvedValueOnce({
        data: baseJob({ status: 'not_started' }),
        error: undefined,
        request: new Request('https://example.com'),
        response: new Response('{}', { headers: { 'Retry-After': '0' } }),
      } as Awaited<ReturnType<Client['get']>>)
      .mockResolvedValueOnce({
        data: baseJob({ status: 'succeeded' }),
        error: undefined,
        request: new Request('https://example.com'),
        response: new Response('{}', { headers: { 'Retry-After': '0' } }),
      } as Awaited<ReturnType<Client['get']>>);
    const result = await pollSubstance3dJob({
      client,
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
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get')
      .mockResolvedValueOnce({
        data: baseJob({ status: 'running' }),
        error: undefined,
        request: new Request('https://example.com'),
        response: new Response('{}', { headers: { 'Retry-After': '0' } }),
      } as Awaited<ReturnType<Client['get']>>)
      .mockResolvedValueOnce({
        data: baseJob({ status: 'succeeded' }),
        error: undefined,
        request: new Request('https://example.com'),
        response: new Response('{}', { headers: { 'Retry-After': '0' } }),
      } as Awaited<ReturnType<Client['get']>>);
    const result = await pollSubstance3dJob({
      client,
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
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: baseJob({ status: 'running' }),
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}', { headers: { 'Retry-After': '0' } }),
    } as Awaited<ReturnType<Client['get']>>);
    await expect(
      pollSubstance3dJob({
        client,
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
    const client = createClient({ headers: validHeaders });
    vi.spyOn(client, 'get').mockResolvedValue({
      data: baseJob({ status: 'running' }),
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}', { headers: { 'Retry-After': '0' } }),
    } as Awaited<ReturnType<Client['get']>>);
    const ac = new AbortController();
    const p = pollSubstance3dJob({
      client,
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
