import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runtimeEnvironment', () => {
  it('uses the configured production API base URL when provided', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.theavid.com/');
    const runtimeEnvironment = await import('../../lib/runtimeEnvironment');

    expect(runtimeEnvironment.resolveApiBaseUrl()).toBe('https://api.theavid.com');
    expect(runtimeEnvironment.resolveApiUrl('/auth/login')).toBe(
      'https://api.theavid.com/auth/login'
    );
  });

  it('falls back to relative API paths when no production API base is configured', async () => {
    const runtimeEnvironment = await import('../../lib/runtimeEnvironment');

    expect(runtimeEnvironment.resolveApiBaseUrl()).toBe('/api');
    expect(runtimeEnvironment.resolveApiUrl('auth/login')).toBe('/api/auth/login');
  });
});
