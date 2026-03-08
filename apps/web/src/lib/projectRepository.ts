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

const DB_NAME = 'the-avid';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

type ElectronProjectStore = {
  listProjects: () => Promise<EditorProject[]>;
  getProject: (projectId: string) => Promise<EditorProject | null>;
  saveProject: (project: EditorProject) => Promise<EditorProject>;
  deleteProject: (projectId: string) => Promise<boolean>;
};

function hasElectronProjectStore(candidate: Window): candidate is Window & { electronAPI: ElectronProjectStore } {
  return Boolean(
    candidate.electronAPI
    && typeof candidate.electronAPI.listProjects === 'function'
    && typeof candidate.electronAPI.getProject === 'function'
    && typeof candidate.electronAPI.saveProject === 'function'
    && typeof candidate.electronAPI.deleteProject === 'function'
  );
}

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listIndexedDbProjects(): Promise<EditorProject[]> {
  const database = await openProjectDb();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const projects = (await requestToPromise(store.getAll())) as EditorProject[];
  await transactionToPromise(transaction);
  database.close();
  return projects.map((project) => hydrateProject(project)).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

async function getIndexedDbProject(projectId: string): Promise<EditorProject | null> {
  const database = await openProjectDb();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const result = await requestToPromise(store.get(projectId));
  await transactionToPromise(transaction);
  database.close();
  return result ? hydrateProject(result as EditorProject) : null;
}

async function saveIndexedDbProject(project: EditorProject): Promise<EditorProject> {
  const hydrated = hydrateProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  const database = await openProjectDb();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(hydrated);
  await transactionToPromise(transaction);
  database.close();
  return cloneProject(hydrated);
}

async function deleteIndexedDbProject(projectId: string): Promise<void> {
  const database = await openProjectDb();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(projectId);
  await transactionToPromise(transaction);
  database.close();
}

async function ensureSeedData(): Promise<EditorProject[]> {
  const existing = typeof window !== 'undefined' && hasElectronProjectStore(window)
    ? (await window.electronAPI.listProjects()).map((project) => hydrateProject(project))
    : hasIndexedDb()
    ? await listIndexedDbProjects()
    : [];

  if (existing.length > 0) {
    return existing.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  const seeded = buildSeedProjectLibrary();
  if (typeof window !== 'undefined' && hasElectronProjectStore(window)) {
    await Promise.all(seeded.map((project) => window.electronAPI.saveProject(project)));
    return (await window.electronAPI.listProjects()).map((project) => hydrateProject(project));
  }

  if (hasIndexedDb()) {
    const saved = await Promise.all(seeded.map((project) => saveIndexedDbProject(project)));
    return saved.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return seeded;
}

export async function listProjectsFromRepository(): Promise<EditorProject[]> {
  return ensureSeedData();
}

export async function listProjectSummariesFromRepository(): Promise<ProjectSummary[]> {
  const projects = await listProjectsFromRepository();
  return projects.map((project) => toProjectSummary(project));
}

export async function getProjectFromRepository(projectId: string): Promise<EditorProject | null> {
  await ensureSeedData();

  if (typeof window !== 'undefined' && hasElectronProjectStore(window)) {
    const project = await window.electronAPI.getProject(projectId);
    return project ? hydrateProject(project) : null;
  }

  if (hasIndexedDb()) {
    return getIndexedDbProject(projectId);
  }

  return null;
}

export async function createProjectInRepository(options: CreateProjectOptions = {}): Promise<EditorProject> {
  const project = buildProject(options);
  return saveProjectToRepository(project);
}

export async function saveProjectToRepository(project: EditorProject): Promise<EditorProject> {
  if (typeof window !== 'undefined' && hasElectronProjectStore(window)) {
    return hydrateProject(await window.electronAPI.saveProject(project));
  }

  if (hasIndexedDb()) {
    return saveIndexedDbProject(project);
  }

  return cloneProject(project);
}

export async function deleteProjectFromRepository(projectId: string): Promise<void> {
  if (typeof window !== 'undefined' && hasElectronProjectStore(window)) {
    await window.electronAPI.deleteProject(projectId);
    return;
  }

  if (hasIndexedDb()) {
    await deleteIndexedDbProject(projectId);
  }
}
