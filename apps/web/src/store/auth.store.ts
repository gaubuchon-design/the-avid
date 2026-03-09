import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AuthUser } from '../lib/auth';
import { loginWithEmail, registerUser, refreshAccessToken, storeTokens, getStoredTokens, clearTokens } from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isLocalSession: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  quickLogin: (email: string) => void;
  loginAsDemo: () => void;
  logout: () => void;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  immer((set) => ({
    user: null,
    isAuthenticated: !!getStoredTokens(),
    isLoading: false,
    error: null,
    isLocalSession: false,

    login: async (email, password) => {
      set((s) => { s.isLoading = true; s.error = null; });
      try {
        const { user, tokens } = await loginWithEmail(email, password);
        storeTokens(tokens);
        set((s) => { s.user = user; s.isAuthenticated = true; s.isLoading = false; });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed';
        set((s) => { s.error = message; s.isLoading = false; });
        throw err;
      }
    },

    register: async (email, name, password) => {
      set((s) => { s.isLoading = true; s.error = null; });
      try {
        const { user, tokens } = await registerUser(email, name, password);
        storeTokens(tokens);
        set((s) => { s.user = user; s.isAuthenticated = true; s.isLoading = false; });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        set((s) => { s.error = message; s.isLoading = false; });
        throw err;
      }
    },

    quickLogin: (email: string) => {
      const id = `local-${btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
      const name = email.split('@')[0] || 'User';
      const user: AuthUser = { id, email, name, role: 'editor' };
      storeTokens({ accessToken: `local-${id}`, refreshToken: `local-refresh-${id}` });
      set((s) => {
        s.user = user;
        s.isAuthenticated = true;
        s.isLoading = false;
        s.error = null;
        s.isLocalSession = true;
      });
    },

    loginAsDemo: () => {
      const demoUser: AuthUser = {
        id: 'demo-user',
        email: 'demo@theavid.app',
        name: 'Demo User',
        role: 'editor',
        avatarUrl: undefined,
      };
      storeTokens({ accessToken: 'demo-token', refreshToken: 'demo-refresh' });
      set((s) => { s.user = demoUser; s.isAuthenticated = true; s.isLoading = false; s.error = null; s.isLocalSession = true; });
    },

    logout: () => {
      clearTokens();
      set((s) => { s.user = null; s.isAuthenticated = false; s.isLocalSession = false; });
    },

    refreshSession: async () => {
      const tokens = getStoredTokens();
      if (!tokens) return;
      try {
        const newTokens = await refreshAccessToken(tokens.refreshToken);
        storeTokens(newTokens);
      } catch {
        clearTokens();
        set((s) => { s.user = null; s.isAuthenticated = false; });
      }
    },

    clearError: () => set((s) => { s.error = null; }),
    setUser: (user) => set((s) => { s.user = user; }),
  }))
);
