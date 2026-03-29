import { describe, expect, it } from 'vitest';

import {
  parseRetryAfterMs,
  resolveNextDelayMs,
  resolveJobId,
} from '../../shared/src/generic-poller';
import { pollFireflyJob } from '../src/extensions/polling';

describe('firefly polling utilities', () => {
  it('parses Retry-After seconds and date formats', () => {
    expect(parseRetryAfterMs('2', { minDelayMs: 0, maxDelayMs: 10_000 })).toBe(2000);

    const nowMs = Date.parse('2026-01-01T00:00:00.000Z');
    const httpDate = 'Thu, 01 Jan 2026 00:00:05 GMT';
    expect(parseRetryAfterMs(httpDate, { nowMs, minDelayMs: 0, maxDelayMs: 10_000 })).toBe(5000);
  });

  it('falls back safely when Retry-After is invalid', () => {
    expect(parseRetryAfterMs('bad-value')).toBeUndefined();
    const fallback = resolveNextDelayMs({
      headers: { 'retry-after': 'bad-value' },
      fallbackDelayMs: 1200,
      minDelayMs: 0,
      maxDelayMs: 10_000,
    });
    expect(fallback).toEqual({ delayMs: 1200, source: 'fallback' });
  });

  it('prefers Retry-After over fallback delay', () => {
    const delay = resolveNextDelayMs({
      headers: { 'Retry-After': '3' },
      fallbackDelayMs: 500,
      minDelayMs: 0,
      maxDelayMs: 10_000,
    });
    expect(delay).toEqual({ delayMs: 3000, source: 'retry-after' });
  });

  it('trims jobId', () => {
    expect(resolveJobId('  preferred-id  ')).toBe('preferred-id');
  });

  it('polls firefly status endpoint to terminal success', async () => {
    const client = {
      get: async () => ({
        data: { status: 'succeeded', jobId: 'job-1' },
        error: undefined,
        request: new Request('https://example.com'),
        response: new Response('{}', {
          headers: { 'Retry-After': '5' },
        }),
      }),
    } as any;

    const result = await pollFireflyJob({
      client,
      jobId: 'job-1',
      maxAttempts: 1,
      timeoutMs: 1000,
    });

    expect(result.result.data?.status).toBe('succeeded');
    expect(result.attempts).toBe(1);
  });
});
