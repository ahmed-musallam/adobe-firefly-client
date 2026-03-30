import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, Config } from '../src/flat/client/index.js';
import * as photoshopFlat from '../src/flat/index.js';
import { PollingAbortedError, PollingIdResolutionError } from '../../shared/src/generic-poller.js';
import {
  pollPhotoshopFacadeJob,
  pollPhotoshopMaskingV1Job,
  pollPhotoshopPsdServiceJob,
  pollPhotoshopSenseiJob,
} from '../src/extensions/polling.js';
import type {
  FacadeJobStatusResponse,
  GetJobStatusResponse,
  JobStatus,
  PsJobResponse,
} from '../src/flat/types.gen.js';

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
    request: new Request('https://example.com'),
    response: new Response('{}', { headers: { 'Retry-After': '0' } }),
  } as { data: T; error: undefined; request: Request; response: Response };
}

describe('photoshop facade /v2/status', () => {
  let spy: MockInstance<typeof photoshopFlat.facadeJobStatus>;
  beforeEach(() => {
    spy = vi.spyOn(photoshopFlat, 'facadeJobStatus');
  });
  afterEach(() => spy.mockRestore());

  it('polls to succeeded', async () => {
    spy.mockResolvedValue(asResult({ status: 'succeeded', jobId: 'j1', result: { outputs: [] } }));
    const r = await pollPhotoshopFacadeJob({
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
      .mockResolvedValueOnce(
        asResult({ status: 'pending', jobId: 'j1' } as FacadeJobStatusResponse)
      )
      .mockResolvedValueOnce(
        asResult({
          status: 'succeeded',
          jobId: 'j1',
          result: { outputs: [] },
        } as FacadeJobStatusResponse)
      );
    const r = await pollPhotoshopFacadeJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
      maxAttempts: 3,
    });
    expect(r.attempts).toBe(2);
  });

  it('throws on failed', async () => {
    spy.mockResolvedValue(asResult({ status: 'failed', jobId: 'j1' } as FacadeJobStatusResponse));
    await expect(
      pollPhotoshopFacadeJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });
});

describe('photoshop PSD service /pie/psdService/status', () => {
  let spy: MockInstance<typeof photoshopFlat.psJobStatus>;
  beforeEach(() => {
    spy = vi.spyOn(photoshopFlat, 'psJobStatus');
  });
  afterEach(() => spy.mockRestore());

  const succeededOutputs: PsJobResponse = {
    jobId: 'j1',
    outputs: [{ status: 'succeeded' }],
  } as PsJobResponse;

  it('aggregates single succeeded output', async () => {
    spy.mockResolvedValue(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 5000,
      minDelayMs: 0,
      maxDelayMs: 10_000,
      intervalMs: 0,
    });
    expect(r.attempts).toBe(1);
  });

  it('treats empty outputs as pending then succeeds', async () => {
    spy
      .mockResolvedValueOnce(asResult({ jobId: 'j1', outputs: [] } as PsJobResponse))
      .mockResolvedValueOnce(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('treats outputs without status as pending then succeeds', async () => {
    spy
      .mockResolvedValueOnce(asResult({ jobId: 'j1', outputs: [{ input: '/a' }] } as PsJobResponse))
      .mockResolvedValueOnce(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('aggregates failed from any output', async () => {
    spy.mockResolvedValue(
      asResult({
        jobId: 'j1',
        outputs: [{ status: 'succeeded' }, { status: 'failed' }],
      } as PsJobResponse)
    );
    await expect(
      pollPhotoshopPsdServiceJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('treats uploading as non-terminal', async () => {
    spy
      .mockResolvedValueOnce(
        asResult({ jobId: 'j1', outputs: [{ status: 'uploading' }] } as PsJobResponse)
      )
      .mockResolvedValueOnce(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('uses running branch then succeeds', async () => {
    spy
      .mockResolvedValueOnce(
        asResult({ jobId: 'j1', outputs: [{ status: 'running' }] } as PsJobResponse)
      )
      .mockResolvedValueOnce(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('returns pending when all outputs pending then succeeds', async () => {
    spy
      .mockResolvedValueOnce(
        asResult({
          jobId: 'j1',
          outputs: [{ status: 'pending' }, { status: 'pending' }],
        } as PsJobResponse)
      )
      .mockResolvedValueOnce(asResult(succeededOutputs));
    const r = await pollPhotoshopPsdServiceJob({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });
});

describe('photoshop masking v1 /v1/status', () => {
  let spy: MockInstance<typeof photoshopFlat.getJobStatus>;
  beforeEach(() => {
    spy = vi.spyOn(photoshopFlat, 'getJobStatus');
  });
  afterEach(() => spy.mockRestore());

  it('polls not_started then succeeded', async () => {
    spy
      .mockResolvedValueOnce(asResult({ status: 'not_started' } as GetJobStatusResponse))
      .mockResolvedValueOnce(asResult({ status: 'succeeded' } as GetJobStatusResponse));
    const r = await pollPhotoshopMaskingV1Job({
      client: createConfigOnlyClient(validHeaders),
      jobId: 'job-1',
      ...pollOpts,
    });
    expect(r.attempts).toBe(2);
  });

  it('throws on failed', async () => {
    spy.mockResolvedValue(asResult({ status: 'failed' } as GetJobStatusResponse));
    await expect(
      pollPhotoshopMaskingV1Job({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });
});

describe('photoshop sensei /sensei/status', () => {
  let spy: MockInstance<typeof photoshopFlat.senseiJobStatus>;
  beforeEach(() => {
    spy = vi.spyOn(photoshopFlat, 'senseiJobStatus');
  });
  afterEach(() => spy.mockRestore());

  it('throws on failed', async () => {
    spy.mockResolvedValue(asResult({ jobId: 'j1', status: 'failed' as JobStatus }));
    await expect(
      pollPhotoshopSenseiJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws when sensei response data is undefined', async () => {
    spy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<typeof photoshopFlat.senseiJobStatus>>);
    await expect(
      pollPhotoshopSenseiJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });
});

describe('photoshop shared header and poll errors', () => {
  let facadeSpy: MockInstance<typeof photoshopFlat.facadeJobStatus>;
  let psSpy: MockInstance<typeof photoshopFlat.psJobStatus>;

  beforeEach(() => {
    facadeSpy = vi.spyOn(photoshopFlat, 'facadeJobStatus');
    psSpy = vi.spyOn(photoshopFlat, 'psJobStatus');
  });
  afterEach(() => {
    facadeSpy.mockRestore();
    psSpy.mockRestore();
  });

  it('throws when Authorization is missing (facade)', async () => {
    await expect(
      pollPhotoshopFacadeJob({
        client: createConfigOnlyClient({ 'x-api-key': 'k' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(facadeSpy).not.toHaveBeenCalled();
  });

  it('throws when x-api-key is missing (facade)', async () => {
    await expect(
      pollPhotoshopFacadeJob({
        client: createConfigOnlyClient({ Authorization: 'Bearer x' }),
        jobId: 'job-1',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow('Both Authorization and x-api-key headers are required');
    expect(facadeSpy).not.toHaveBeenCalled();
  });

  it('throws PollingIdResolutionError for empty jobId (ps service)', async () => {
    psSpy.mockResolvedValue(
      asResult({ jobId: 'j1', outputs: [{ status: 'succeeded' }] } as PsJobResponse)
    );
    await expect(
      pollPhotoshopPsdServiceJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: '  ',
        maxAttempts: 1,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toThrow(PollingIdResolutionError);
    expect(psSpy).not.toHaveBeenCalled();
  });

  it('throws when PSD job data is undefined', async () => {
    psSpy.mockResolvedValue({
      data: undefined,
      error: undefined,
      request: new Request('https://example.com'),
      response: new Response('{}'),
    } as Awaited<ReturnType<typeof photoshopFlat.psJobStatus>>);
    await expect(
      pollPhotoshopPsdServiceJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 5000,
        minDelayMs: 0,
        intervalMs: 0,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTimeoutError (facade)', async () => {
    facadeSpy.mockResolvedValue(
      asResult({ status: 'running', jobId: 'j1' } as FacadeJobStatusResponse)
    );
    await expect(
      pollPhotoshopFacadeJob({
        client: createConfigOnlyClient(validHeaders),
        jobId: 'job-1',
        maxAttempts: 2,
        timeoutMs: 60_000,
        minDelayMs: 0,
        intervalMs: 0,
        maxDelayMs: 10_000,
      })
    ).rejects.toMatchObject({ name: 'PollingTimeoutError' });
  });

  it('throws PollingAbortedError (facade)', async () => {
    facadeSpy.mockResolvedValue(
      asResult({ status: 'running', jobId: 'j1' } as FacadeJobStatusResponse)
    );
    const ac = new AbortController();
    const p = pollPhotoshopFacadeJob({
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
