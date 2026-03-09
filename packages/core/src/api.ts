import type { Project, MediaAsset, User } from './types';

// ─── API Configuration ─────────────────────────────────────────────────────────

export interface ApiConfig {
  baseUrl: string;
  token?: string;
  timeout?: number;
}

// ─── Base Client ───────────────────────────────────────────────────────────────

export class ApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
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

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
    this.config.token = undefined;
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/auth/me');
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  async getProjects(): Promise<Project[]> {
    return this.request('/projects');
  }

  async getProject(id: string): Promise<Project> {
    return this.request(`/projects/${id}`);
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return this.request(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  // ─── Assets ───────────────────────────────────────────────────────────────

  async getAssets(projectId: string): Promise<MediaAsset[]> {
    return this.request(`/projects/${projectId}/assets`);
  }

  async uploadAsset(projectId: string, file: File): Promise<MediaAsset> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: formData,
      skipContentType: true,
    });
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    await this.request(`/projects/${projectId}/assets/${assetId}`, {
      method: 'DELETE',
    });
  }
}

// ─── Default Export ────────────────────────────────────────────────────────────

export const createApiClient = (config: ApiConfig) => new ApiClient(config);
