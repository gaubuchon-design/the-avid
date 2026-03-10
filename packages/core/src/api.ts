import type { Project, MediaAsset, User } from './types';

// ─── API Configuration ─────────────────────────────────────────────────────────

/**
 * Configuration for the {@link ApiClient}.
 *
 * @param baseUrl - Base URL of the API (e.g. `https://api.avid.app`).
 * @param token - Optional Bearer token for authenticated requests.
 * @param timeout - Optional request timeout in milliseconds. 0 or undefined disables the timeout.
 */
export interface ApiConfig {
  baseUrl: string;
  token?: string;
  timeout?: number;
}

// ─── Base Client ───────────────────────────────────────────────────────────────

/**
 * HTTP client for the AVID REST API.
 *
 * Handles authentication headers, request timeouts via AbortController,
 * and structured error reporting. All JSON endpoints are type-safe via generics.
 */
export class ApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      throw new Error('ApiClient requires a non-empty baseUrl');
    }
    this.config = config;
  }

  private async request<T>(
    path: string,
    options: RequestInit & { skipContentType?: boolean } = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const { skipContentType, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      ...(skipContentType ? {} : { 'Content-Type': 'application/json' }),
      ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      ...(fetchOptions.headers as Record<string, string> ?? {}),
    };

    // Build the fetch init with timeout support via AbortSignal
    const fetchInit: RequestInit = {
      ...fetchOptions,
      headers,
    };

    const timeoutMs = this.config.timeout;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs && timeoutMs > 0) {
      const controller = new AbortController();
      fetchInit.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, fetchInit);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // Could not read error body
        }
        throw new Error(
          `API Error ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody}` : ''}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`API request to ${path} timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Authenticate a user with email and password.
   *
   * @param email - User email address. Must be a non-empty string.
   * @param password - User password. Must be a non-empty string.
   * @throws {Error} if email or password is empty or not a string.
   */
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    if (!email || typeof email !== 'string') {
      throw new Error('login() requires a non-empty string email');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('login() requires a non-empty string password');
    }
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  /** Log out the current user and clear the stored auth token. */
  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
    this.config.token = undefined;
  }

  /** Fetch the currently authenticated user profile. */
  async getCurrentUser(): Promise<User> {
    return this.request('/auth/me');
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  /** List all projects accessible to the current user. */
  async getProjects(): Promise<Project[]> {
    return this.request('/projects');
  }

  /**
   * Fetch a single project by ID.
   * @throws {Error} if id is empty.
   */
  async getProject(id: string): Promise<Project> {
    if (!id) throw new Error('getProject() requires a non-empty id');
    return this.request(`/projects/${encodeURIComponent(id)}`);
  }

  /**
   * Create a new project.
   *
   * @param data - Partial project data for the new project.
   * @throws {Error} if data is null or not an object.
   */
  async createProject(data: Partial<Project>): Promise<Project> {
    if (!data || typeof data !== 'object') {
      throw new Error('createProject() requires a non-null project data object');
    }
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update an existing project.
   * @throws {Error} if id is empty.
   */
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    if (!id) throw new Error('updateProject() requires a non-empty id');
    return this.request(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a project by ID.
   * @throws {Error} if id is empty.
   */
  async deleteProject(id: string): Promise<void> {
    if (!id) throw new Error('deleteProject() requires a non-empty id');
    await this.request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ─── Assets ───────────────────────────────────────────────────────────────

  /**
   * List all media assets in a project.
   * @throws {Error} if projectId is empty.
   */
  async getAssets(projectId: string): Promise<MediaAsset[]> {
    if (!projectId) throw new Error('getAssets() requires a non-empty projectId');
    return this.request(`/projects/${encodeURIComponent(projectId)}/assets`);
  }

  /**
   * Upload a media asset to a project.
   *
   * @param projectId - Project ID. Must be a non-empty string.
   * @param file - File object to upload.
   * @throws {Error} if projectId is empty or file is null.
   */
  async uploadAsset(projectId: string, file: File): Promise<MediaAsset> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('uploadAsset() requires a non-empty string projectId');
    }
    if (!file) {
      throw new Error('uploadAsset() requires a non-null file');
    }
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/projects/${encodeURIComponent(projectId)}/assets`, {
      method: 'POST',
      body: formData,
      skipContentType: true,
    });
  }

  /**
   * Delete a media asset from a project.
   * @throws {Error} if projectId or assetId is empty.
   */
  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    if (!projectId || !assetId) throw new Error('deleteAsset() requires non-empty projectId and assetId');
    await this.request(`/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
  }
}

// ─── Default Export ────────────────────────────────────────────────────────────

/** Factory function to create a configured {@link ApiClient} instance. */
export const createApiClient = (config: ApiConfig) => new ApiClient(config);
