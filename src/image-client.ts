export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchImageOptions {
  fetch?: FetchLike;
  /** Per attempt. */
  timeoutMs?: number;
  /** Extra attempts after a 5xx or 429 response. */
  retries?: number;
  /** Upper bound for honouring Retry-After. */
  maxRetryDelayMs?: number;
  /** Used when a retryable response has no usable Retry-After header. */
  defaultRetryDelayMs?: number;
  maxBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onRetry?: (info: { status: number; delayMs: number; attempt: number }) => void;
}

export class ImageFetchError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageFetchError';
    this.status = status;
  }
}

const DEFAULTS = {
  timeoutMs: 15_000,
  retries: 1,
  maxRetryDelayMs: 10_000,
  defaultRetryDelayMs: 1_000,
  maxBytes: 8 * 1024 * 1024,
};

/** Retry-After is either a number of seconds or an HTTP date. Returns milliseconds. */
export function parseRetryAfter(header: string | null, now: number): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Downloads the image. Times out after 15 s per attempt and retries once on 5xx or 429,
 * waiting for `Retry-After` when the server sends it. Throws {@link ImageFetchError} otherwise.
 */
export async function fetchImage(url: string, options: FetchImageOptions = {}): Promise<Buffer> {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = options.retries ?? DEFAULTS.retries;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULTS.maxRetryDelayMs;
  const defaultRetryDelayMs = options.defaultRetryDelayMs ?? DEFAULTS.defaultRetryDelayMs;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'image/png,image/*;q=0.8' },
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ImageFetchError(
        timedOut ? `Image request timed out after ${String(timeoutMs)} ms` : 'Image request failed',
        undefined,
        { cause: error },
      );
    }

    if (isRetryable(response.status) && attempt < retries) {
      const wanted =
        parseRetryAfter(response.headers.get('retry-after'), now()) ?? defaultRetryDelayMs;
      const delayMs = Math.min(wanted, maxRetryDelayMs);
      await response.body?.cancel().catch(() => undefined);
      options.onRetry?.({ status: response.status, delayMs, attempt: attempt + 1 });
      await sleep(delayMs);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageFetchError(
        `Image API answered HTTP ${String(response.status)}`,
        response.status,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageFetchError(
        `Image API answered with ${contentType || 'no content type'}`,
        response.status,
      );
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await response.arrayBuffer();
    } catch (error) {
      throw new ImageFetchError('Image download was interrupted', response.status, {
        cause: error,
      });
    }
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
      throw new ImageFetchError(
        `Image has an unusable size (${String(bytes.byteLength)} bytes)`,
        response.status,
      );
    }
    return Buffer.from(bytes);
  }
}
