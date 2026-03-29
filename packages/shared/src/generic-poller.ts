export class PollingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollingTimeoutError';
  }
}

export class PollingAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollingAbortedError';
  }
}

export class PollingTerminalFailureError<T = unknown> extends Error {
  public readonly lastResult: T;

  constructor(message: string, lastResult: T) {
    super(message);
    this.name = 'PollingTerminalFailureError';
    this.lastResult = lastResult;
  }
}

export class PollingIdResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollingIdResolutionError';
  }
}

export type HeaderMap = Headers | Record<string, string | undefined> | undefined;

export interface RetryAfterParseOptions {
  nowMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
}

/** Clamps the given delay between the minimum and maximum delay. */
export const clampDelay = (delayMs: number, minDelayMs = 250, maxDelayMs = 60_000): number => {
  return Math.min(maxDelayMs, Math.max(minDelayMs, Math.floor(delayMs)));
};

/** Reads the value of a header from the given headers object. */
const readHeader = (headers: HeaderMap, key: string): string | undefined => {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(key) ?? undefined;
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerKey) return v;
  }
  return undefined;
};

/** Parses the value of a `Retry-After` header. */
export const parseRetryAfterMs = (
  retryAfterValue: string | null | undefined,
  options: RetryAfterParseOptions = {}
): number | undefined => {
  if (!retryAfterValue) {
    return undefined;
  }

  const nowMs = options.nowMs ?? Date.now();
  const minDelayMs = options.minDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const trimmedValue = retryAfterValue.trim();

  if (!trimmedValue) return undefined;

  // handle if value is in seconds
  const seconds = Number(trimmedValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return clampDelay(seconds * 1000, minDelayMs, maxDelayMs);
  }

  // handle if value is a date
  const dateMs = Date.parse(trimmedValue);
  if (Number.isNaN(dateMs)) return undefined;
  return clampDelay(Math.max(0, dateMs - nowMs), minDelayMs, maxDelayMs);
};

export interface NextDelayOptions extends RetryAfterParseOptions {
  headers?: HeaderMap;
  fallbackDelayMs?: number;
}

// resolves the next delay based on the Retry-After header or fallback delay
export const resolveNextDelayMs = (
  options: NextDelayOptions
): { delayMs: number; source: 'retry-after' | 'fallback' } => {
  const minDelayMs = options.minDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const fallbackDelayMs = clampDelay(options.fallbackDelayMs ?? 2_000, minDelayMs, maxDelayMs);
  const nowMs = options.nowMs ?? Date.now();

  const retryAfterDelay = parseRetryAfterMs(readHeader(options.headers, 'retry-after'), {
    nowMs,
    minDelayMs,
    maxDelayMs,
  });
  if (retryAfterDelay !== undefined) {
    return { delayMs: retryAfterDelay, source: 'retry-after' };
  }

  return { delayMs: fallbackDelayMs, source: 'fallback' };
};

/** Returns a trimmed non-empty job id or throws {@link PollingIdResolutionError}. */
export const resolveJobId = (jobId: string): string => {
  const trimmed = jobId.trim();
  if (!trimmed) {
    throw new PollingIdResolutionError('Missing job identifier: provide a non-empty jobId.');
  }
  return trimmed;
};

/** Sleeps for the given delay or throws {@link PollingAbortedError} if the AbortSignal is aborted. */
export const sleepWithAbort = async (delayMs: number, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted) {
    throw new PollingAbortedError('Polling aborted by AbortSignal.');
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new PollingAbortedError('Polling aborted by AbortSignal.'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

/**
 * Options for polling a job until it reaches a terminal state.
 *
 * @template T - The type of the result returned by `getStatus`.
 */
export interface PollJobOptions<T> {
  /** Fetches the current job status. */
  fetchJob: (attempt: number) => Promise<JobFetchResult<T>>;
  /** Extracts the status string from the result. */
  getStatusText: (result: T | undefined) => string | undefined;
  /** Returns `true` if the status is terminal (polling should stop). */
  isTerminal: (status: string) => boolean;
  /** Returns `true` if the terminal status represents success. */
  isSuccess: (status: string) => boolean;
  /** Extracts a reset timestamp (ms since epoch) for adaptive delay calculation. */
  resetAtMs?: (result: T) => number | undefined;
  /** Fallback polling interval in milliseconds. @default 2000 */
  intervalMs?: number;
  /** Minimum delay between attempts in milliseconds. @default 250 */
  minDelayMs?: number;
  /** Maximum delay between attempts in milliseconds. @default 60000 */
  maxDelayMs?: number;
  /** Maximum number of polling attempts. @default 120 */
  maxAttempts?: number;
  /** Maximum total polling duration in milliseconds. @default 600000 */
  timeoutMs?: number;
  /** Optional `AbortSignal` to cancel polling. */
  signal?: AbortSignal;
}

/** Result of a job fetch operation. */
interface JobFetchResult<T, E = unknown> {
  data?: T;
  error?: E;
  request: Request;
  response: Response;
}

export interface PollJobResult<T> {
  attempts: number;
  elapsedMs: number;
  result: JobFetchResult<T>;
}

export const pollJob = async <T>(options: PollJobOptions<T>): Promise<PollJobResult<T>> => {
  const startedAt = Date.now();
  const maxAttempts = options.maxAttempts ?? 120;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new PollingTimeoutError(`Polling timed out after ${timeoutMs}ms.`);
    }

    const result = await options.fetchJob(attempt);
    const status = options.getStatusText(result.data);
    if (!status) {
      throw new PollingTerminalFailureError(
        'Unable to read job status from polling response.',
        result
      );
    }

    if (options.isTerminal(status)) {
      if (!options.isSuccess(status)) {
        throw new PollingTerminalFailureError(
          `Job reached terminal non-success status: ${status}`,
          result
        );
      }
      return {
        attempts: attempt,
        elapsedMs: Date.now() - startedAt,
        result,
      };
    }

    const { delayMs } = resolveNextDelayMs({
      headers: result.response.headers,
      fallbackDelayMs: options.intervalMs ?? 2_000,
      minDelayMs: options.minDelayMs ?? 250,
      maxDelayMs: options.maxDelayMs ?? 60_000,
    });
    await sleepWithAbort(delayMs, options.signal);
  }

  throw new PollingTimeoutError(`Polling exceeded max attempts (${maxAttempts}).`);
};
