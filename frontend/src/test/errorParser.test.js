import { describe, expect, it } from 'vitest';
import { parseApiError } from '../utils/errorParser';

describe('parseApiError', () => {
  it('parses FastAPI RequestValidationError 422 array details', () => {
    const err = {
      response: {
        status: 422,
        data: {
          detail: [
            {
              loc: ['body', 'installed_capacity_mw'],
              msg: 'Input should be greater than 0',
              type: 'greater_than',
            },
          ],
        },
      },
    };
    const parsed = parseApiError(err);
    expect(parsed.status).toBe(422);
    expect(parsed.fieldErrors.installed_capacity_mw).toBe('Input should be greater than 0');
    expect(parsed.message).toContain('installed_capacity_mw: Input should be greater than 0');
    expect(parsed.isAuthError).toBe(false);
  });

  it('parses FastAPI HTTPException string detail and flags 401', () => {
    const err = {
      response: {
        status: 401,
        data: { detail: 'Invalid credentials' },
      },
    };
    const parsed = parseApiError(err);
    expect(parsed.status).toBe(401);
    expect(parsed.message).toBe('Invalid credentials');
    expect(parsed.isAuthError).toBe(true);
  });

  it('flags network errors when no response is received', () => {
    const parsed = parseApiError({ message: 'Network Error' });
    expect(parsed.isNetworkError).toBe(true);
    expect(parsed.status).toBeNull();
  });
});
