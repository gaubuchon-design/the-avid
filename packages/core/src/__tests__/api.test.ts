import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, createApiClient } from '../api';

// =============================================================================
//  Mock fetch globally
// =============================================================================

function mockFetchResponse(data: unknown, status = 200, statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockFetchError(status: number, statusText: string, body = '') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  });
}

// =============================================================================
//  Constructor
// =============================================================================

describe('ApiClient constructor', () => {
  it('creates client with valid baseUrl', () => {
    expect(() => new ApiClient({ baseUrl: 'http://localhost:3000' })).not.toThrow();
  });

  it('throws if baseUrl is empty', () => {
    expect(() => new ApiClient({ baseUrl: '' })).toThrow('ApiClient requires a non-empty baseUrl');
  });

  it('throws if baseUrl is not a string', () => {
    expect(() => new ApiClient({ baseUrl: 123 as unknown as string })).toThrow();
  });
});

// =============================================================================
//  createApiClient
// =============================================================================

describe('createApiClient', () => {
  it('returns an ApiClient instance', () => {
    const client = createApiClient({ baseUrl: 'http://localhost' });
    expect(client).toBeInstanceOf(ApiClient);
  });
});

// =============================================================================
//  Auth methods
// =============================================================================

describe('ApiClient.login', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST to /auth/login with credentials', async () => {
    const responseData = { user: { id: '1', email: 'a@b.com' }, token: 'tok' };
    globalThis.fetch = mockFetchResponse(responseData);

    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const result = await client.login('a@b.com', 'pass123');

    expect(result).toEqual(responseData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'pass123' }),
      }),
    );
  });

  it('throws if email is empty', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.login('', 'pass')).rejects.toThrow('non-empty string email');
  });

  it('throws if password is empty', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.login('a@b.com', '')).rejects.toThrow('non-empty string password');
  });

  it('includes Authorization header when token is set', async () => {
    globalThis.fetch = mockFetchResponse({ user: {}, token: 't' });

    const client = new ApiClient({ baseUrl: 'http://api.test', token: 'my-token' });
    await client.login('a@b.com', 'pass');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-token');
  });
});

describe('ApiClient.logout', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST to /auth/logout', async () => {
    globalThis.fetch = mockFetchResponse(undefined);
    const client = new ApiClient({ baseUrl: 'http://api.test', token: 'tok' });
    await client.logout();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('ApiClient.getCurrentUser', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends GET to /auth/me', async () => {
    const user = { id: '1', email: 'a@b.com', displayName: 'Test' };
    globalThis.fetch = mockFetchResponse(user);

    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const result = await client.getCurrentUser();

    expect(result).toEqual(user);
  });
});

// =============================================================================
//  Project methods
// =============================================================================

describe('ApiClient project methods', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getProjects sends GET to /projects', async () => {
    const projects = [{ id: '1', name: 'P1' }];
    globalThis.fetch = mockFetchResponse(projects);

    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const result = await client.getProjects();

    expect(result).toEqual(projects);
  });

  it('getProject sends GET to /projects/:id', async () => {
    const project = { id: '1', name: 'P1' };
    globalThis.fetch = mockFetchResponse(project);

    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const result = await client.getProject('1');

    expect(result).toEqual(project);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/1',
      expect.any(Object),
    );
  });

  it('getProject throws for empty id', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.getProject('')).rejects.toThrow('requires a non-empty id');
  });

  it('getProject encodes special characters in id', async () => {
    globalThis.fetch = mockFetchResponse({ id: 'a/b' });
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await client.getProject('a/b');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/a%2Fb',
      expect.any(Object),
    );
  });

  it('createProject sends POST to /projects', async () => {
    const newProject = { id: '2', name: 'New' };
    globalThis.fetch = mockFetchResponse(newProject);

    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const result = await client.createProject({ name: 'New' });

    expect(result).toEqual(newProject);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('createProject throws for null data', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.createProject(null as unknown as Record<string, unknown>)).rejects.toThrow(
      'requires a non-null project data object',
    );
  });

  it('updateProject sends PATCH to /projects/:id', async () => {
    globalThis.fetch = mockFetchResponse({ id: '1', name: 'Updated' });
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await client.updateProject('1', { name: 'Updated' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('updateProject throws for empty id', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.updateProject('', {})).rejects.toThrow('requires a non-empty id');
  });

  it('deleteProject sends DELETE to /projects/:id', async () => {
    globalThis.fetch = mockFetchResponse(undefined);
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await client.deleteProject('1');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('deleteProject throws for empty id', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.deleteProject('')).rejects.toThrow('requires a non-empty id');
  });
});

// =============================================================================
//  Asset methods
// =============================================================================

describe('ApiClient asset methods', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getAssets sends GET to /projects/:projectId/assets', async () => {
    globalThis.fetch = mockFetchResponse([]);
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await client.getAssets('proj1');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/proj1/assets',
      expect.any(Object),
    );
  });

  it('getAssets throws for empty projectId', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.getAssets('')).rejects.toThrow('requires a non-empty projectId');
  });

  it('uploadAsset throws for empty projectId', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    const file = new File(['data'], 'test.mp4');
    await expect(client.uploadAsset('', file)).rejects.toThrow('requires a non-empty string projectId');
  });

  it('uploadAsset throws for null file', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.uploadAsset('proj1', null as unknown as File)).rejects.toThrow('requires a non-null file');
  });

  it('deleteAsset sends DELETE to /projects/:projectId/assets/:assetId', async () => {
    globalThis.fetch = mockFetchResponse(undefined);
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await client.deleteAsset('proj1', 'asset1');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/projects/proj1/assets/asset1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('deleteAsset throws for empty projectId or assetId', async () => {
    const client = new ApiClient({ baseUrl: 'http://api.test' });
    await expect(client.deleteAsset('', 'a1')).rejects.toThrow();
    await expect(client.deleteAsset('p1', '')).rejects.toThrow();
  });
});

// =============================================================================
//  Error handling
// =============================================================================

describe('ApiClient error handling', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws on non-OK response with status text', async () => {
    globalThis.fetch = mockFetchError(404, 'Not Found', 'resource missing');
    const client = new ApiClient({ baseUrl: 'http://api.test' });

    await expect(client.getProjects()).rejects.toThrow(/API Error 404.*Not Found/);
  });

  it('includes error body in the thrown error', async () => {
    globalThis.fetch = mockFetchError(500, 'Internal Server Error', 'db connection failed');
    const client = new ApiClient({ baseUrl: 'http://api.test' });

    await expect(client.getProjects()).rejects.toThrow(/db connection failed/);
  });
});
