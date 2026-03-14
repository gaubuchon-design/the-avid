import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runtimeEnvironment', () => {
  it('disables store devtools while tests are running', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const runtimeEnvironment = await import('../../lib/runtimeEnvironment');

    expect(runtimeEnvironment.isTestEnvironment()).toBe(true);
    expect(runtimeEnvironment.isStoreDevtoolsEnabled()).toBe(false);
    expect(runtimeEnvironment.getStoreDevtoolsOptions('EditorStore')).toEqual({
      name: 'EditorStore',
      enabled: false,
    });
  });

  it('enables store devtools during development outside the test runtime', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const runtimeEnvironment = await import('../../lib/runtimeEnvironment');

    expect(runtimeEnvironment.isTestEnvironment()).toBe(false);
    expect(runtimeEnvironment.isStoreDevtoolsEnabled()).toBe(true);
  });

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
