import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AuthUser } from '../lib/auth';
import { loginWithEmail, registerUser, refreshAccessToken, storeTokens, getStoredTokens, clearTokens } from '../lib/auth';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  resetStore: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: AuthState = {
  user: null,
  isAuthenticated: !!getStoredTokens(),
  isLoading: false,
  error: null,
  isLocalSession: false,
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    immer((set) => ({
      ...INITIAL_STATE,

      login: async (email, password) => {
        set((s) => { s.isLoading = true; s.error = null; }, false, 'auth/login/pending');
        try {
          const { user, tokens } = await loginWithEmail(email, password);
          storeTokens(tokens);
          set((s) => {
            s.user = user;
            s.isAuthenticated = true;
            s.isLoading = false;
            s.isLocalSession = false;
          }, false, 'auth/login/fulfilled');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Login failed';
          set((s) => { s.error = message; s.isLoading = false; }, false, 'auth/login/rejected');
          throw err;
        }
      },

      register: async (email, name, password) => {
        set((s) => { s.isLoading = true; s.error = null; }, false, 'auth/register/pending');
        try {
          const { user, tokens } = await registerUser(email, name, password);
          storeTokens(tokens);
          set((s) => {
            s.user = user;
            s.isAuthenticated = true;
            s.isLoading = false;
            s.isLocalSession = false;
          }, false, 'auth/register/fulfilled');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Registration failed';
          set((s) => { s.error = message; s.isLoading = false; }, false, 'auth/register/rejected');
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
        }, false, 'auth/quickLogin');
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
        set((s) => {
          s.user = demoUser;
          s.isAuthenticated = true;
          s.isLoading = false;
          s.error = null;
          s.isLocalSession = true;
        }, false, 'auth/loginAsDemo');
      },

      logout: () => {
        clearTokens();
        set((s) => {
          s.user = null;
          s.isAuthenticated = false;
          s.isLocalSession = false;
          s.error = null;
        }, false, 'auth/logout');
      },

      refreshSession: async () => {
        const tokens = getStoredTokens();
        if (!tokens) return;
        try {
          const newTokens = await refreshAccessToken(tokens.refreshToken);
          storeTokens(newTokens);
        } catch {
          clearTokens();
          set((s) => {
            s.user = null;
            s.isAuthenticated = false;
            s.error = null;
          }, false, 'auth/refreshSession/expired');
        }
      },

      clearError: () => set((s) => { s.error = null; }, false, 'auth/clearError'),
      setUser: (user) => set((s) => { s.user = user; }, false, 'auth/setUser'),

      resetStore: () => {
        clearTokens();
        set(() => ({
          ...INITIAL_STATE,
          isAuthenticated: false,
        }), true, 'auth/resetStore');
      },
    })),
    { name: 'AuthStore', enabled: process.env["NODE_ENV"] === 'development' },
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

type AuthStoreState = AuthState & AuthActions;

export const selectAuthUser = (state: AuthStoreState) => state.user;
export const selectIsAuthenticated = (state: AuthStoreState) => state.isAuthenticated;
export const selectAuthIsLoading = (state: AuthStoreState) => state.isLoading;
export const selectAuthError = (state: AuthStoreState) => state.error;
export const selectIsLocalSession = (state: AuthStoreState) => state.isLocalSession;
export const selectUserDisplayName = (state: AuthStoreState) => state.user?.name ?? '';
export const selectUserEmail = (state: AuthStoreState) => state.user?.email ?? '';
export const selectUserRole = (state: AuthStoreState) => state.user?.role ?? null;
