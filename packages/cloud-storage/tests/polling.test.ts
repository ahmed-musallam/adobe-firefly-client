import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as cloudStorageFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import { pollCloudStorageJob } from '../src/extensions/polling.js';
import type { JobStatus } from '../src/flat/types.gen.js';

function createConfigOnlyClient(headers: Config['headers']): Client {
  return {
    getConfig: (): Config => ({ headers }) as Config,
  } as unknown as Client;
}

const validHeaders: Config['headers'] = {
  Authorization: 'Bearer test-token',
};

type GetJobStatusResolved = Awaited<ReturnType<typeof cloudStorageFlat.getJobStatus>>;

function makeJobStatusResult(data: JobStatus): GetJobStatusResolved {
  return {
    data,
    error: undefined,
    request: new Request('https://example.com/status/job-1'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as GetJobStatusResolved;
}

/** Minimal `running` payload matching the discriminated `JobStatus` union. */
function runningJob(jobId = 'job-1'): JobStatus {
  return {
    jobId,
    requestId: 'req-1',
    jobType: 'file_upload',
    status: 'running',
  };
}

/** Minimal `succeeded` payload for tests (full `asset` shape not exercised here). */
function succeededJob(jobId = 'job-1'): JobStatus {
  return {
    jobId,
    requestId: 'req-1',
    jobType: 'file_upload',
    status: 'succeeded',
    asset: {} as never,
  } as JobStatus;
}

describe('cloud-storage polling adapter', () => {
  let getJobStatusSpy: MockInstance<typeof cloudStorageFlat.getJobStatus>;

  beforeEach(() => {
    getJobStatusSpy = vi.spyOn(cloudStorageFlat, 'getJobStatus');
  });

  afterEach(() => {
    getJobStatusSpy.mockRestore();
  });

  it('polls to terminal success', async () => {
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(succeededJob()));
    const result = await pollCloudStorageJob({
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
      pollCloudStorageJob({
        client: createConfigOnlyClient({}),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Authorization header is required');
    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws when headers are undefined', async () => {
    await expect(
      pollCloudStorageJob({
        client: createConfigOnlyClient(undefined),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Authorization header is required');
    expect(getJobStatusSpy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId', async () => {
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(succeededJob()));
    await expect(
      pollCloudStorageJob({
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

  it('throws PollingTerminalFailureError when response data is undefined', async () => {
    getJobStatusSpy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com/status/job-1'),
      response: new Response('{}'),
    } as unknown as GetJobStatusResolved);
    await expect(
      pollCloudStorageJob({
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
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult({ jobId: 'job-1' } as JobStatus));
    await expect(
      pollCloudStorageJob({
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
    const failed = {
      jobId: 'job-1',
      requestId: 'req-1',
      jobType: 'file_upload',
      status: 'failed',
      errors: [{ error_code: 'runtime_error', message: 'job failed' }],
    } as JobStatus;
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(failed));
    await expect(
      pollCloudStorageJob({
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
    const partial = {
      jobId: 'job-1',
      requestId: 'req-1',
      jobType: 'folder_copy',
      status: 'partially_succeeded',
      asset: {},
      errors: [{ error_code: 'x', message: 'y' }],
    } as unknown as JobStatus;
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(partial));
    await expect(
      pollCloudStorageJob({
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
      .mockResolvedValueOnce(makeJobStatusResult(runningJob()))
      .mockResolvedValueOnce(makeJobStatusResult(succeededJob()));
    const result = await pollCloudStorageJob({
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
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(runningJob()));
    await expect(
      pollCloudStorageJob({
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
    getJobStatusSpy.mockResolvedValue(makeJobStatusResult(runningJob()));
    const p = pollCloudStorageJob({
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
