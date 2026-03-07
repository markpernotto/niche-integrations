/**
 * Utility functions for rate limiting, retries, and error handling
 */

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatusCodes?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error status code is retryable
 */
export function isRetryableError(statusCode: number, retryableStatusCodes?: number[]): boolean {
  const codes = retryableStatusCodes || DEFAULT_RETRY_OPTIONS.retryableStatusCodes;
  return codes.includes(statusCode);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Check if error is retryable
      if (error && typeof error === 'object' && 'status' in error) {
        const statusCode = error.status as number;
        if (!isRetryableError(statusCode, opts.retryableStatusCodes)) {
          throw error;
        }
      }

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Exponential backoff: delay * 2^attempt
      const delay = opts.retryDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire a token. Returns true if successful, false if rate limited.
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Wait until a token is available
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
      await sleep(waitTime);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
