import type { AppState, Project, User, Platform } from './types';

// ─── Minimal store interface (implemented per-platform via Zustand) ─────────────

export interface StoreActions {
  // Auth
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;

  // Projects
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  updateProject: (id: string, data: Partial<Project>) => void;

  // App
  setPlatform: (platform: Platform) => void;
  setOnline: (online: boolean) => void;
}

export type Store = AppState & StoreActions;

export const initialState: AppState = {
  auth: {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  },
  currentProject: null,
  projects: [],
  platform: 'web',
  isOnline: true,
};
