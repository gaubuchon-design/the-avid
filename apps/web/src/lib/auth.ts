const API_BASE = '/api';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

export async function loginWithEmail(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(err.message || 'Login failed');
  }
  return res.json();
}

export async function registerUser(email: string, name: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(err.message || 'Registration failed');
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Session expired');
  return res.json();
}

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem('avid_access_token', tokens.accessToken);
  localStorage.setItem('avid_refresh_token', tokens.refreshToken);
}

export function getStoredTokens(): AuthTokens | null {
  const accessToken = localStorage.getItem('avid_access_token');
  const refreshToken = localStorage.getItem('avid_refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function clearTokens(): void {
  localStorage.removeItem('avid_access_token');
  localStorage.removeItem('avid_refresh_token');
}

export function getAuthHeaders(): Record<string, string> {
  const tokens = getStoredTokens();
  if (!tokens) return {};
  return { Authorization: `Bearer ${tokens.accessToken}` };
}
