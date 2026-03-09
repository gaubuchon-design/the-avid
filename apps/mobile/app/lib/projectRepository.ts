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

const PROJECT_STORE_DIR = `${FileSystem.documentDirectory ?? ''}projects`;
const PROJECT_FILE_EXTENSION = '.avidproj.json';

function getProjectFilePath(projectId: string): string {
  return `${PROJECT_STORE_DIR}/${projectId}${PROJECT_FILE_EXTENSION}`;
}

async function ensureProjectStore(): Promise<boolean> {
  if (!FileSystem.documentDirectory) {
    return false;
  }

  const info = await FileSystem.getInfoAsync(PROJECT_STORE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROJECT_STORE_DIR, { intermediates: true });
  }
  return true;
}

async function saveProjectFile(project: EditorProject): Promise<EditorProject> {
  const hydrated = hydrateProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  await FileSystem.writeAsStringAsync(
    getProjectFilePath(hydrated.id),
    JSON.stringify(hydrated, null, 2),
  );
  return cloneProject(hydrated);
}

async function seedProjectStore(): Promise<EditorProject[]> {
  const seeded = buildSeedProjectLibrary();
  const stored = await Promise.all(seeded.map((project) => saveProjectFile(project)));
  return stored.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listProjectsFromRepository(): Promise<EditorProject[]> {
  const available = await ensureProjectStore();
  if (!available) {
    return buildSeedProjectLibrary();
  }

  const fileNames = await FileSystem.readDirectoryAsync(PROJECT_STORE_DIR);
  const projectFiles = fileNames.filter((fileName) => fileName.endsWith(PROJECT_FILE_EXTENSION));
  if (projectFiles.length === 0) {
    return seedProjectStore();
  }

  const results = await Promise.allSettled(projectFiles.map(async (fileName) => {
    const serialized = await FileSystem.readAsStringAsync(`${PROJECT_STORE_DIR}/${fileName}`);
    return hydrateProject(JSON.parse(serialized) as Partial<EditorProject>);
  }));

  const projects: EditorProject[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      projects.push(result.value);
    } else {
      console.warn('[projectRepository] Failed to read project file:', result.reason);
    }
  }

  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listProjectSummariesFromRepository(): Promise<ProjectSummary[]> {
  const projects = await listProjectsFromRepository();
  return projects.map((project) => toProjectSummary(project));
}

export async function getProjectFromRepository(projectId: string): Promise<EditorProject | null> {
  const available = await ensureProjectStore();
  if (!available) {
    return null;
  }

  const fileInfo = await FileSystem.getInfoAsync(getProjectFilePath(projectId));
  if (!fileInfo.exists) {
    return null;
  }

  const serialized = await FileSystem.readAsStringAsync(getProjectFilePath(projectId));
  return hydrateProject(JSON.parse(serialized) as Partial<EditorProject>);
}

export async function createProjectInRepository(options: CreateProjectOptions = {}): Promise<EditorProject> {
  const project = buildProject(options);
  return saveProjectToRepository(project);
}

export async function saveProjectToRepository(project: EditorProject): Promise<EditorProject> {
  const available = await ensureProjectStore();
  if (!available) {
    return cloneProject(project);
  }

  return saveProjectFile(project);
}
