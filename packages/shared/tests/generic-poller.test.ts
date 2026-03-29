import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PollingAbortedError,
  PollingIdResolutionError,
  PollingTerminalFailureError,
  PollingTimeoutError,
  clampDelay,
  parseRetryAfterMs,
  pollJob,
  resolveJobId,
  resolveNextDelayMs,
  sleepWithAbort,
} from '../src/generic-poller.js';

/** Error classes (constructors) kept explicit for coverage of `name` assignment. */
describe('polling error types', () => {
  it('sets correct names on subclasses', () => {
    expect(new PollingTimeoutError('t').name).toBe('PollingTimeoutError');
    expect(new PollingAbortedError('a').name).toBe('PollingAbortedError');
    expect(new PollingTerminalFailureError('f', { x: 1 }).name).toBe('PollingTerminalFailureError');
    expect(new PollingTerminalFailureError('f', { x: 1 }).lastResult).toEqual({ x: 1 });
    expect(new PollingIdResolutionError('i').name).toBe('PollingIdResolutionError');
  });
});

const baseResult = <T>(data: T | undefined, response?: Response) => ({
  data,
  error: undefined as undefined,
  request: new Request('https://example.com/status'),
  response: response ?? new Response('{}'),
});

describe('clampDelay', () => {
  it('floors and clamps to min and max', () => {
    expect(clampDelay(100.9, 200, 10_000)).toBe(200);
    expect(clampDelay(50, 100, 10_000)).toBe(100);
    expect(clampDelay(99_999, 0, 1000)).toBe(1000);
  });

  it('uses default min and max when omitted', () => {
    expect(clampDelay(1000.2)).toBe(1000);
    expect(clampDelay(10)).toBe(250);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delay in seconds', () => {
    expect(parseRetryAfterMs('2', { minDelayMs: 0, maxDelayMs: 10_000 })).toBe(2000);
  });

  it('parses HTTP-date', () => {
    const nowMs = Date.parse('2026-01-01T00:00:00.000Z');
    expect(
      parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', {
        nowMs,
        minDelayMs: 0,
        maxDelayMs: 10_000,
      })
    ).toBe(5000);
  });

  it('returns undefined for empty or invalid values', () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('   ')).toBeUndefined();
    expect(parseRetryAfterMs('not-a-number-or-date')).toBeUndefined();
  });

  it('uses default option bounds when omitted', () => {
    const delay = parseRetryAfterMs('1');
    expect(delay).toBeGreaterThanOrEqual(250);
    expect(delay).toBeLessThanOrEqual(60_000);
  });

  it('falls through when numeric parse is not finite (e.g. NaN)', () => {
    expect(parseRetryAfterMs('NaN', { minDelayMs: 0, maxDelayMs: 10_000 })).toBeUndefined();
  });

  it('parses zero seconds', () => {
    expect(parseRetryAfterMs('0', { minDelayMs: 0, maxDelayMs: 10_000 })).toBe(0);
  });
});

describe('resolveNextDelayMs', () => {
  it('prefers Retry-After over fallback', () => {
    expect(
      resolveNextDelayMs({
        headers: { 'Retry-After': '3' },
        fallbackDelayMs: 500,
        minDelayMs: 0,
        maxDelayMs: 10_000,
      })
    ).toEqual({ delayMs: 3000, source: 'retry-after' });
  });

  it('uses fallback when Retry-After is invalid', () => {
    expect(
      resolveNextDelayMs({
        headers: { 'retry-after': 'bad' },
        fallbackDelayMs: 1200,
        minDelayMs: 0,
        maxDelayMs: 10_000,
      })
    ).toEqual({ delayMs: 1200, source: 'fallback' });
  });

  it('reads Retry-After from Headers', () => {
    const headers = new Headers();
    headers.set('retry-after', '1');
    expect(
      resolveNextDelayMs({ headers, fallbackDelayMs: 9999, minDelayMs: 0, maxDelayMs: 10_000 })
    ).toEqual({
      delayMs: 1000,
      source: 'retry-after',
    });
  });

  it('falls back when headers are omitted', () => {
    expect(resolveNextDelayMs({ fallbackDelayMs: 800, minDelayMs: 0, maxDelayMs: 10_000 })).toEqual(
      {
        delayMs: 800,
        source: 'fallback',
      }
    );
  });

  it('falls back when plain headers omit Retry-After (readHeader no-match path)', () => {
    expect(
      resolveNextDelayMs({
        headers: { 'Content-Type': 'application/json' },
        fallbackDelayMs: 700,
        minDelayMs: 0,
        maxDelayMs: 10_000,
      })
    ).toEqual({ delayMs: 700, source: 'fallback' });
  });

  it('matches Retry-After on plain objects case-insensitively', () => {
    expect(
      resolveNextDelayMs({
        headers: { 'ReTrY-AfTeR': '2' },
        fallbackDelayMs: 1,
        minDelayMs: 0,
        maxDelayMs: 10_000,
      })
    ).toEqual({ delayMs: 2000, source: 'retry-after' });
  });

  it('uses default option bounds when omitted', () => {
    const out = resolveNextDelayMs({});
    expect(out.source).toBe('fallback');
    expect(out.delayMs).toBeGreaterThanOrEqual(250);
    expect(out.delayMs).toBeLessThanOrEqual(60_000);
  });
});

describe('resolveJobId', () => {
  it('trims and returns non-empty id', () => {
    expect(resolveJobId('  abc  ')).toBe('abc');
  });

  it('throws PollingIdResolutionError when empty after trim', () => {
    expect(() => resolveJobId('')).toThrow(PollingIdResolutionError);
    expect(() => resolveJobId('   ')).toThrow(PollingIdResolutionError);
  });
});

describe('sleepWithAbort', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects immediately when signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sleepWithAbort(10_000, ac.signal)).rejects.toThrow(PollingAbortedError);
  });

  it('resolves after delay when no signal', async () => {
    vi.useFakeTimers();
    const p = sleepWithAbort(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves after delay when signal is present but not aborted (timer clears abort listener)', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const p = sleepWithAbort(40, ac.signal);
    await vi.advanceTimersByTimeAsync(40);
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects when aborted during wait', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const p = sleepWithAbort(10_000, ac.signal);
    await vi.advanceTimersByTimeAsync(100);
    ac.abort();
    await expect(p).rejects.toThrow(PollingAbortedError);
  });
});

describe('pollJob', () => {
  const fastPoll = {
    minDelayMs: 0,
    maxDelayMs: 10_000,
    intervalMs: 0,
  };

  it('uses default maxAttempts, timeoutMs, and backoff when those options are omitted', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const p = pollJob({
        fetchJob: () => {
          n += 1;
          const status = n >= 2 ? 'done' : 'running';
          return Promise.resolve(baseResult({ status }));
        },
        getStatusText: (d) => d?.status,
        isTerminal: (s) => s === 'done',
        isSuccess: (s) => s === 'done',
      });
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(p).resolves.toMatchObject({ attempts: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns on first attempt when status is terminal success', async () => {
    const out = await pollJob({
      fetchJob: () =>
        Promise.resolve(
          baseResult(
            { status: 'succeeded' },
            new Response('{}', { headers: { 'Retry-After': '5' } })
          )
        ),
      getStatusText: (d) => d?.status,
      isTerminal: (s) => s === 'succeeded' || s === 'failed',
      isSuccess: (s) => s === 'succeeded',
      ...fastPoll,
      maxAttempts: 5,
      timeoutMs: 5000,
    });
    expect(out.attempts).toBe(1);
    expect(out.result.data).toEqual({ status: 'succeeded' });
  });

  it('polls until terminal success', async () => {
    let n = 0;
    const out = await pollJob({
      fetchJob: () => {
        n += 1;
        const status = n >= 3 ? 'ready' : 'running';
        return Promise.resolve(baseResult({ status }));
      },
      getStatusText: (d) => d?.status,
      isTerminal: (s) => s === 'ready' || s === 'failed',
      isSuccess: (s) => s === 'ready',
      ...fastPoll,
      maxAttempts: 10,
      timeoutMs: 5000,
    });
    expect(out.attempts).toBe(3);
  });

  it('throws PollingTerminalFailureError when status cannot be read', async () => {
    await expect(
      pollJob({
        fetchJob: () => Promise.resolve(baseResult(undefined)),
        getStatusText: (d) => (d as { status?: string } | undefined)?.status,
        isTerminal: () => false,
        isSuccess: () => false,
        ...fastPoll,
        maxAttempts: 2,
        timeoutMs: 5000,
      })
    ).rejects.toMatchObject({ name: 'PollingTerminalFailureError' });
  });

  it('throws PollingTerminalFailureError on terminal non-success', async () => {
    try {
      await pollJob({
        fetchJob: () => Promise.resolve(baseResult({ status: 'failed' })),
        getStatusText: (d) => d?.status,
        isTerminal: (s) => s === 'succeeded' || s === 'failed',
        isSuccess: (s) => s === 'succeeded',
        ...fastPoll,
        maxAttempts: 2,
        timeoutMs: 5000,
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PollingTerminalFailureError);
      const err = e as PollingTerminalFailureError<
        ReturnType<typeof baseResult<{ status: string }>>
      >;
      expect(err.lastResult.data).toEqual({ status: 'failed' });
    }
  });

  it('throws PollingTimeoutError after max attempts', async () => {
    try {
      await pollJob({
        fetchJob: () => Promise.resolve(baseResult({ status: 'running' })),
        getStatusText: (d) => d?.status,
        isTerminal: () => false,
        isSuccess: () => false,
        ...fastPoll,
        maxAttempts: 4,
        timeoutMs: 60_000,
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PollingTimeoutError);
      expect((e as PollingTimeoutError).message).toContain('max attempts');
    }
  });

  it('throws PollingTimeoutError when elapsed time exceeds timeoutMs', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const p = pollJob({
      fetchJob: () => {
        now += 20_000;
        return Promise.resolve(baseResult({ status: 'running' }));
      },
      getStatusText: (d) => d?.status,
      isTerminal: () => false,
      isSuccess: () => false,
      ...fastPoll,
      maxAttempts: 100,
      timeoutMs: 50,
    });

    await expect(p).rejects.toMatchObject({
      name: 'PollingTimeoutError',
      message: expect.stringContaining('timed out'),
    });

    vi.restoreAllMocks();
  });

  it('throws PollingAbortedError when signal aborts during backoff', async () => {
    const ac = new AbortController();
    let attempt = 0;
    await expect(
      pollJob({
        fetchJob: async (a) => {
          attempt = a;
          if (a === 1) {
            queueMicrotask(() => ac.abort());
          }
          return baseResult({ status: 'running' }, new Response(null, { status: 202 }));
        },
        getStatusText: (d) => d?.status,
        isTerminal: () => false,
        isSuccess: () => false,
        signal: ac.signal,
        ...fastPoll,
        maxAttempts: 10,
        timeoutMs: 60_000,
      })
    ).rejects.toThrow(PollingAbortedError);
    expect(attempt).toBeGreaterThanOrEqual(1);
  });
});
