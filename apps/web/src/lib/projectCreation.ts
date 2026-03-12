import type { CreateProjectOptions, ProjectTemplate } from '@mcua/core';

export type EditorialWorkspacePreset = 'filmtv' | 'news' | 'sports' | 'creator' | 'marketing';

export interface ProjectCreationSequencePreset {
  fps: number;
  width: number;
  height: number;
  dropFrame: boolean;
}

export interface ProjectCreationPersonaConfig {
  name: string;
  template: ProjectTemplate;
  sequence: ProjectCreationSequencePreset;
  activeWorkspaceId: CreateProjectOptions['activeWorkspaceId'];
  composerLayout: CreateProjectOptions['composerLayout'];
}

const TEMPLATE_CREATION_DEFAULTS: Record<ProjectTemplate, ProjectCreationPersonaConfig> = {
  film: {
    name: 'Film & TV',
    template: 'film',
    sequence: { fps: 23.976, width: 1920, height: 1080, dropFrame: false },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
  commercial: {
    name: 'Marketing',
    template: 'commercial',
    sequence: { fps: 30, width: 3840, height: 2160, dropFrame: false },
    activeWorkspaceId: 'effects',
    composerLayout: 'source-record',
  },
  documentary: {
    name: 'Documentary',
    template: 'documentary',
    sequence: { fps: 24, width: 3840, height: 2160, dropFrame: false },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
  sports: {
    name: 'Sports',
    template: 'sports',
    sequence: { fps: 59.94, width: 3840, height: 2160, dropFrame: true },
    activeWorkspaceId: 'source-record',
    composerLayout: 'full-frame',
  },
  podcast: {
    name: 'Podcast',
    template: 'podcast',
    sequence: { fps: 30, width: 1920, height: 1080, dropFrame: false },
    activeWorkspaceId: 'audio-mixing',
    composerLayout: 'source-record',
  },
  social: {
    name: 'Creator',
    template: 'social',
    sequence: { fps: 30, width: 1080, height: 1920, dropFrame: false },
    activeWorkspaceId: 'effects',
    composerLayout: 'source-record',
  },
  news: {
    name: 'News',
    template: 'news',
    sequence: { fps: 29.97, width: 1920, height: 1080, dropFrame: true },
    activeWorkspaceId: 'source-record',
    composerLayout: 'source-record',
  },
};

export const PROJECT_CREATION_PERSONAS: Record<EditorialWorkspacePreset, ProjectCreationPersonaConfig> = {
  filmtv: TEMPLATE_CREATION_DEFAULTS.film,
  news: TEMPLATE_CREATION_DEFAULTS.news,
  sports: TEMPLATE_CREATION_DEFAULTS.sports,
  creator: TEMPLATE_CREATION_DEFAULTS.social,
  marketing: {
    name: 'Marketing',
    template: 'commercial',
    sequence: { fps: 30, width: 1920, height: 1080, dropFrame: false },
    activeWorkspaceId: 'effects',
    composerLayout: 'source-record',
  },
};

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
  const baseSequence = workspacePreset?.sequence ?? templateDefaults.sequence;
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
