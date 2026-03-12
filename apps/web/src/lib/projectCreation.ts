import type { CreateProjectOptions, ProjectTemplate } from '@mcua/core';

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
  activeWorkspaceId: CreateProjectOptions['activeWorkspaceId'];
  composerLayout: CreateProjectOptions['composerLayout'];
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

export const EDITORIAL_TEMPLATE_OPTIONS: ProjectTemplate[] = ['film', 'documentary', 'commercial', 'podcast'];

export function getProjectCreationTemplateConfig(template: ProjectTemplate): ProjectCreationPersonaConfig {
  return TEMPLATE_CREATION_DEFAULTS[template];
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
    activeWorkspaceId: input.activeWorkspaceId ?? baseWorkspaceId,
    composerLayout: input.composerLayout ?? baseComposerLayout,
  };
}
