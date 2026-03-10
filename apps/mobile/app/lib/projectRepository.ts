import * as FileSystem from 'expo-file-system';
import {
  buildProject,
  buildSeedProjectLibrary,
  cloneProject,
  hydrateProject,
  toProjectSummary,
} from '@mcua/core';
import type {
  CreateProjectOptions,
  EditorProject,
  ProjectSummary,
} from '@mcua/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_STORE_DIR = `${FileSystem.documentDirectory ?? ''}projects`;
const PROJECT_FILE_EXTENSION = '.avidproj.json';

// ─── In-memory cache ──────────────────────────────────────────────────────────

let projectCache: Map<string, EditorProject> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000; // Invalidate cache after 10 seconds

function invalidateCache(): void {
  projectCache = null;
  cacheTimestamp = 0;
}

function isCacheValid(): boolean {
  return projectCache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProjectFilePath(projectId: string): string {
  // Sanitize projectId to prevent path traversal
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeId !== projectId || safeId.length === 0) {
    throw new Error(`Invalid project ID: "${projectId}"`);
  }
  return `${PROJECT_STORE_DIR}/${safeId}${PROJECT_FILE_EXTENSION}`;
}

async function ensureProjectStore(): Promise<boolean> {
  if (!FileSystem.documentDirectory) {
    return false;
  }

  try {
    const info = await FileSystem.getInfoAsync(PROJECT_STORE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(PROJECT_STORE_DIR, { intermediates: true });
    }
    return true;
  } catch (error) {
    console.error('[ProjectRepository] Failed to ensure store directory:', error);
    return false;
  }
}

async function saveProjectFile(project: EditorProject): Promise<EditorProject> {
  const hydrated = hydrateProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });

  const filePath = getProjectFilePath(hydrated.id);
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(hydrated, null, 2));

  // Update cache
  if (projectCache) {
    projectCache.set(hydrated.id, hydrated);
    cacheTimestamp = Date.now();
  }

  return cloneProject(hydrated);
}

async function readProjectFile(fileName: string): Promise<EditorProject | null> {
  try {
    const serialized = await FileSystem.readAsStringAsync(`${PROJECT_STORE_DIR}/${fileName}`);
    const parsed = JSON.parse(serialized) as Partial<EditorProject>;
    return hydrateProject(parsed);
  } catch (error) {
    console.warn(`[ProjectRepository] Failed to read ${fileName}:`, error);
    return null;
  }
}

async function seedProjectStore(): Promise<EditorProject[]> {
  const seeded = buildSeedProjectLibrary();
  const stored = await Promise.all(seeded.map((project) => saveProjectFile(project)));
  return stored.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all projects from local storage.
 * Results are cached in memory and refreshed after CACHE_TTL_MS.
 * Uses Promise.allSettled for resilience against individual file read failures.
 */
export async function listProjectsFromRepository(): Promise<EditorProject[]> {
  // Return cached data if fresh
  if (isCacheValid()) {
    const cached = Array.from(projectCache!.values());
    return cached.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  const available = await ensureProjectStore();
  if (!available) {
    return buildSeedProjectLibrary();
  }

  let fileNames: string[];
  try {
    fileNames = await FileSystem.readDirectoryAsync(PROJECT_STORE_DIR);
  } catch (error) {
    console.error('[ProjectRepository] Failed to read directory:', error);
    return buildSeedProjectLibrary();
  }

  const projectFiles = fileNames.filter((fileName) => fileName.endsWith(PROJECT_FILE_EXTENSION));

  if (projectFiles.length === 0) {
    return seedProjectStore();
  }

  const results = await Promise.allSettled(projectFiles.map(readProjectFile));

  const projects: EditorProject[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      projects.push(result.value);
    } else if (result.status === 'rejected') {
      console.warn('[ProjectRepository] Failed to read project file:', result.reason);
    }
  }

  // Populate cache
  projectCache = new Map(projects.map((p) => [p.id, p]));
  cacheTimestamp = Date.now();

  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * List lightweight project summaries for the home screen.
 */
export async function listProjectSummariesFromRepository(): Promise<ProjectSummary[]> {
  const projects = await listProjectsFromRepository();
  return projects.map((project) => toProjectSummary(project));
}

/**
 * Get a single project by ID.
 */
export async function getProjectFromRepository(projectId: string): Promise<EditorProject | null> {
  // Check cache first
  if (isCacheValid() && projectCache!.has(projectId)) {
    return cloneProject(projectCache!.get(projectId)!);
  }

  const available = await ensureProjectStore();
  if (!available) {
    return null;
  }

  const filePath = getProjectFilePath(projectId);
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) {
      return null;
    }

    const serialized = await FileSystem.readAsStringAsync(filePath);
    const project = hydrateProject(JSON.parse(serialized) as Partial<EditorProject>);

    // Update cache entry
    if (projectCache) {
      projectCache.set(project.id, project);
    }

    return project;
  } catch (error) {
    console.error(`[ProjectRepository] Failed to get project ${projectId}:`, error);
    return null;
  }
}

/**
 * Create a new project with the given options and persist it.
 */
export async function createProjectInRepository(options: CreateProjectOptions = {}): Promise<EditorProject> {
  const project = buildProject({
    ...options,
    seedContent: options.seedContent ?? false,
  });
  return saveProjectToRepository(project);
}

/**
 * Save (create or update) a project to local storage.
 */
export async function saveProjectToRepository(project: EditorProject): Promise<EditorProject> {
  const available = await ensureProjectStore();
  if (!available) {
    return cloneProject(project);
  }

  return saveProjectFile(project);
}

/**
 * Delete a project from local storage.
 */
export async function deleteProjectFromRepository(projectId: string): Promise<boolean> {
  const available = await ensureProjectStore();
  if (!available) {
    return false;
  }

  const filePath = getProjectFilePath(projectId);
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) {
      return false;
    }

    await FileSystem.deleteAsync(filePath, { idempotent: true });

    // Remove from cache
    if (projectCache) {
      projectCache.delete(projectId);
    }

    return true;
  } catch (error) {
    console.error(`[ProjectRepository] Failed to delete project ${projectId}:`, error);
    throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Duplicate an existing project.
 */
export async function duplicateProjectInRepository(projectId: string): Promise<EditorProject | null> {
  const original = await getProjectFromRepository(projectId);
  if (!original) return null;

  const duplicate = buildProject({
    name: `${original.name} (Copy)`,
  });

  // Copy core content from original
  const merged: EditorProject = {
    ...duplicate,
    bins: original.bins,
    tracks: original.tracks,
    settings: original.settings,
    transcript: original.transcript,
    markers: original.markers,
  };

  return saveProjectToRepository(merged);
}
