import { ApiError } from './client';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('retries connection problems and server errors, at most twice', () => {
    expect(shouldRetry(0, new ApiError('network', 'x'))).toBe(true);
    expect(shouldRetry(1, new ApiError('timeout', 'x'))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', 'x', 503))).toBe(true);
    expect(shouldRetry(2, new ApiError('network', 'x'))).toBe(false);
  });

  it('never retries what will not change by itself', () => {
    expect(shouldRetry(0, new ApiError('http', 'x', 404))).toBe(false);
    expect(shouldRetry(0, new ApiError('unauthorized', 'x', 401))).toBe(false);
    expect(shouldRetry(0, new ApiError('invalid_response', 'x', 200))).toBe(false);
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});
