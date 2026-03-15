import {
  coerceWorkspaceForSurface,
  listProjectTemplatesForSurface,
  type BuiltInEditorialWorkspaceId,
  type CreateProjectOptions,
  type ProjectTemplate,
} from '@mcua/core';
import { resolveRuntimeSurface } from './runtimeSurface';

export type EditorialWorkspacePreset = 'filmtv';

export interface ProjectCreationSequencePreset {
  fps: number;
  width: number;
  height: number;
  dropFrame: boolean;
}

export interface ProjectCreationPersonaConfig {
  name: string;
  description: string;
  template: ProjectTemplate;
  sequence: ProjectCreationSequencePreset;
  activeWorkspaceId: BuiltInEditorialWorkspaceId;
  composerLayout: CreateProjectOptions['composerLayout'];
}

export interface ProjectCreationTemplateVisual {
  badge: string;
  accent: string;
  suggestedName: string;
  quickStartTitle: string;
  quickStartDescription: string;
}

const TEMPLATE_CREATION_DEFAULTS: Record<ProjectTemplate, ProjectCreationPersonaConfig> = {
  film: {
    name: 'Film & TV',
    description: 'Long-form offline edit with source/record and finishing tools.',
    template: 'film',
    sequence: { fps: 23.976, width: 1920, height: 1080, dropFrame: false },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
  commercial: {
    name: 'Commercial',
    description: 'Editorial setup for spots, promos, and client review cuts.',
    template: 'commercial',
    sequence: { fps: 30, width: 3840, height: 2160, dropFrame: false },
    activeWorkspaceId: 'effects',
    composerLayout: 'source-record',
  },
  documentary: {
    name: 'Documentary',
    description: 'Research-heavy editorial with room for interviews and archive.',
    template: 'documentary',
    sequence: { fps: 24, width: 3840, height: 2160, dropFrame: false },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
  sports: {
    name: 'Sports',
    description: 'Legacy vertical preset retained for compatibility only.',
    template: 'sports',
    sequence: { fps: 59.94, width: 3840, height: 2160, dropFrame: true },
    activeWorkspaceId: 'source-record',
    composerLayout: 'full-frame',
  },
  podcast: {
    name: 'Podcast',
    description: 'Audio-forward editorial timeline with monitor parity.',
    template: 'podcast',
    sequence: { fps: 30, width: 1920, height: 1080, dropFrame: false },
    activeWorkspaceId: 'audio-mixing',
    composerLayout: 'source-record',
  },
  social: {
    name: 'Creator',
    description: 'Legacy vertical preset retained for compatibility only.',
    template: 'social',
    sequence: { fps: 30, width: 1080, height: 1920, dropFrame: false },
    activeWorkspaceId: 'effects',
    composerLayout: 'source-record',
  },
  news: {
    name: 'News',
    description: 'Legacy vertical preset retained for compatibility only.',
    template: 'news',
    sequence: { fps: 29.97, width: 1920, height: 1080, dropFrame: true },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
};

export const PROJECT_CREATION_PERSONAS: Record<EditorialWorkspacePreset, ProjectCreationPersonaConfig> = {
  filmtv: TEMPLATE_CREATION_DEFAULTS.film,
};

export const EDITORIAL_TEMPLATE_OPTIONS: ProjectTemplate[] = listProjectTemplatesForSurface(resolveRuntimeSurface());

export const PROJECT_CREATION_TEMPLATE_VISUALS: Record<ProjectTemplate, ProjectCreationTemplateVisual> = {
  film: {
    badge: 'Offline editorial',
    accent: '#4f63f5',
    suggestedName: 'Film Cut',
    quickStartTitle: 'Blank Timeline',
    quickStartDescription: 'Source / record editorial with 23.976 fps defaults.',
  },
  documentary: {
    badge: 'Story editorial',
    accent: '#ca8a04',
    suggestedName: 'Documentary Edit',
    quickStartTitle: 'Documentary Cut',
    quickStartDescription: 'Interview-driven edit with room for research and archive.',
  },
  commercial: {
    badge: 'Client review',
    accent: '#0f9f6e',
    suggestedName: 'Commercial Spot',
    quickStartTitle: 'Commercial Spot',
    quickStartDescription: 'Fast-turn spot workflow with 4K review defaults.',
  },
  sports: {
    badge: 'Legacy preset',
    accent: '#e05b8e',
    suggestedName: 'Sports Edit',
    quickStartTitle: 'Sports',
    quickStartDescription: 'Compatibility preset retained for existing projects.',
  },
  podcast: {
    badge: 'Audio editorial',
    accent: '#0891b2',
    suggestedName: 'Podcast Episode',
    quickStartTitle: 'Podcast Episode',
    quickStartDescription: 'Audio-first edit that still opens in the same editor.',
  },
  social: {
    badge: 'Legacy preset',
    accent: '#8b5cf6',
    suggestedName: 'Social Cut',
    quickStartTitle: 'Creator',
    quickStartDescription: 'Compatibility preset retained for existing projects.',
  },
  news: {
    badge: 'Legacy preset',
    accent: '#64748b',
    suggestedName: 'News Cut',
    quickStartTitle: 'News',
    quickStartDescription: 'Compatibility preset retained for existing projects.',
  },
};

const DISPOSABLE_PROJECT_NAMES = new Set([
  'Autosave Cut',
  'Baseline Compare',
  'Collab Restore',
  'Diverged Collab Restore',
  'Metadata Cut',
  'Persisted Project',
  'Project project-a',
  'Project project-b',
  'Selection Feedback',
  'Shell Save Test',
  'Versioned Cut',
]);

const DISPOSABLE_PROJECT_ID_PATTERNS = [
  /^project-(?:a|b|collab|compare|metadata|reopen|shell)$/i,
];

export function getProjectCreationTemplateConfig(template: ProjectTemplate): ProjectCreationPersonaConfig {
  return TEMPLATE_CREATION_DEFAULTS[template];
}

export function getProjectCreationTemplateVisual(template: ProjectTemplate): ProjectCreationTemplateVisual {
  return PROJECT_CREATION_TEMPLATE_VISUALS[template];
}

export function buildSuggestedProjectName(
  template: ProjectTemplate,
  existingProjectNames: string[] = [],
): string {
  const baseName = PROJECT_CREATION_TEMPLATE_VISUALS[template].suggestedName;
  const normalizedExistingNames = new Set(
    existingProjectNames
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!normalizedExistingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (normalizedExistingNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`;
}

export function isDisposableProjectCandidate(project: { id: string; name: string }): boolean {
  const normalizedName = project.name.trim();
  if (DISPOSABLE_PROJECT_NAMES.has(normalizedName)) {
    return true;
  }

  return DISPOSABLE_PROJECT_ID_PATTERNS.some((pattern) => pattern.test(project.id));
}

export interface BuildProjectCreationOptionsInput {
  template?: ProjectTemplate;
  workspace?: EditorialWorkspacePreset;
  name?: string;
  description?: string;
  tags?: string[];
  seedContent?: boolean;
  sequence?: Partial<ProjectCreationSequencePreset>;
  activeWorkspaceId?: CreateProjectOptions['activeWorkspaceId'];
  composerLayout?: CreateProjectOptions['composerLayout'];
}

export function getProjectCreationPersona(
  workspace: EditorialWorkspacePreset,
): ProjectCreationPersonaConfig {
  return PROJECT_CREATION_PERSONAS[workspace];
}

export function buildProjectCreationOptions(
  input: BuildProjectCreationOptionsInput = {},
): CreateProjectOptions {
  const workspacePreset = input.workspace ? PROJECT_CREATION_PERSONAS[input.workspace] : null;
  const template = input.template ?? workspacePreset?.template ?? 'film';
  const templateDefaults = TEMPLATE_CREATION_DEFAULTS[template];
  const baseSequence = input.template
    ? templateDefaults.sequence
    : (workspacePreset?.sequence ?? templateDefaults.sequence);
  const baseWorkspaceId = input.template
    ? templateDefaults.activeWorkspaceId
    : (workspacePreset?.activeWorkspaceId ?? templateDefaults.activeWorkspaceId);
  const baseComposerLayout = input.template
    ? templateDefaults.composerLayout
    : (workspacePreset?.composerLayout ?? templateDefaults.composerLayout);

  return {
    name: input.name,
    description: input.description,
    template,
    tags: input.tags,
    seedContent: input.seedContent ?? false,
    frameRate: input.sequence?.fps ?? baseSequence.fps,
    width: input.sequence?.width ?? baseSequence.width,
    height: input.sequence?.height ?? baseSequence.height,
    dropFrame: input.sequence?.dropFrame ?? baseSequence.dropFrame,
    activeWorkspaceId: coerceWorkspaceForSurface(
      resolveRuntimeSurface(),
      input.activeWorkspaceId ?? baseWorkspaceId,
    ),
    composerLayout: input.composerLayout ?? baseComposerLayout,
  };
}
