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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
    };

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
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
      headers: {},
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
