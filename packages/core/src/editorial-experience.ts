import type { ProjectTemplate } from './project-library';
import type { Platform } from './types';

export const EDITORIAL_SURFACE_IDS = ['desktop', 'browser', 'mobile'] as const;
export type EditorialSurfaceId = typeof EDITORIAL_SURFACE_IDS[number];

export const BUILT_IN_EDITORIAL_WORKSPACE_IDS = [
  'source-record',
  'effects',
  'color-correction',
  'audio-mixing',
  'full-screen',
] as const;
export type BuiltInEditorialWorkspaceId = typeof BUILT_IN_EDITORIAL_WORKSPACE_IDS[number];

export const EDITORIAL_CAPABILITY_IDS = [
  'monitor-behavior',
  'timeline-editing',
  'gpu-rendering',
  'hardware-io',
  'interchange',
  'plugins',
  'collaboration',
] as const;
export type EditorialCapabilityId = typeof EDITORIAL_CAPABILITY_IDS[number];

export type EditorialCapabilityState = 'supported' | 'degraded' | 'unsupported';
export type EditorialWorkspaceState = 'shared' | 'degraded' | 'unsupported';
export type EditorialSurfaceRole = 'workstation' | 'companion';

export interface EditorialSurfaceContract {
  surfaceId: EditorialSurfaceId;
  role: EditorialSurfaceRole;
  label: string;
  description: string;
  defaultWorkspaceId: BuiltInEditorialWorkspaceId;
  defaultProjectTemplate: ProjectTemplate;
  projectTemplates: ProjectTemplate[];
  capabilities: Record<EditorialCapabilityId, EditorialCapabilityState>;
  workspaceAvailability: Record<BuiltInEditorialWorkspaceId, EditorialWorkspaceState>;
  notes: string[];
}

const SURFACE_CONTRACTS: Record<EditorialSurfaceId, EditorialSurfaceContract> = {
  desktop: {
    surfaceId: 'desktop',
    role: 'workstation',
    label: 'Desktop Workstation',
    description: 'Primary editorial workstation with the full monitor, media, and facility workflow target.',
    defaultWorkspaceId: 'source-record',
    defaultProjectTemplate: 'film',
    projectTemplates: ['film', 'documentary', 'commercial', 'podcast'],
    capabilities: {
      'monitor-behavior': 'supported',
      'timeline-editing': 'supported',
      'gpu-rendering': 'supported',
      'hardware-io': 'supported',
      'interchange': 'supported',
      'plugins': 'supported',
      'collaboration': 'degraded',
    },
    workspaceAvailability: {
      'source-record': 'shared',
      effects: 'shared',
      'color-correction': 'shared',
      'audio-mixing': 'shared',
      'full-screen': 'shared',
    },
    notes: [
      'Desktop is the primary workstation target.',
      'Native media, hardware I/O, and plugin/runtime integration belong here first.',
    ],
  },
  browser: {
    surfaceId: 'browser',
    role: 'workstation',
    label: 'Browser Editorial',
    description: 'Shared editorial shell for browser-based editing, review, and lightweight workstation workflows.',
    defaultWorkspaceId: 'source-record',
    defaultProjectTemplate: 'film',
    projectTemplates: ['film', 'documentary', 'commercial', 'podcast'],
    capabilities: {
      'monitor-behavior': 'degraded',
      'timeline-editing': 'supported',
      'gpu-rendering': 'degraded',
      'hardware-io': 'unsupported',
      'interchange': 'degraded',
      'plugins': 'degraded',
      'collaboration': 'degraded',
    },
    workspaceAvailability: {
      'source-record': 'shared',
      effects: 'shared',
      'color-correction': 'degraded',
      'audio-mixing': 'degraded',
      'full-screen': 'degraded',
    },
    notes: [
      'Browser shares the editorial shell with desktop where possible.',
      'Native media, hardware, and finishing workflows degrade or fall back here.',
    ],
  },
  mobile: {
    surfaceId: 'mobile',
    role: 'companion',
    label: 'Mobile Companion',
    description: 'Companion surface for review, approvals, script context, and lightweight editorial access.',
    defaultWorkspaceId: 'source-record',
    defaultProjectTemplate: 'film',
    projectTemplates: ['film', 'documentary', 'podcast'],
    capabilities: {
      'monitor-behavior': 'unsupported',
      'timeline-editing': 'degraded',
      'gpu-rendering': 'unsupported',
      'hardware-io': 'unsupported',
      'interchange': 'unsupported',
      'plugins': 'unsupported',
      'collaboration': 'degraded',
    },
    workspaceAvailability: {
      'source-record': 'unsupported',
      effects: 'unsupported',
      'color-correction': 'unsupported',
      'audio-mixing': 'unsupported',
      'full-screen': 'unsupported',
    },
    notes: [
      'Mobile is a companion product, not the primary workstation.',
      'Project defaults should stay editorially coherent without pretending to expose the full desktop shell.',
    ],
  },
};

export const DEFAULT_EDITORIAL_WORKSPACE_ID: BuiltInEditorialWorkspaceId =
  SURFACE_CONTRACTS.desktop.defaultWorkspaceId;

export const DEFAULT_EDITORIAL_PROJECT_TEMPLATE: ProjectTemplate =
  SURFACE_CONTRACTS.desktop.defaultProjectTemplate;

function cloneContract(contract: EditorialSurfaceContract): EditorialSurfaceContract {
  return {
    ...contract,
    projectTemplates: [...contract.projectTemplates],
    capabilities: { ...contract.capabilities },
    workspaceAvailability: { ...contract.workspaceAvailability },
    notes: [...contract.notes],
  };
}

export function getEditorialSurfaceContract(surfaceId: EditorialSurfaceId): EditorialSurfaceContract {
  return cloneContract(SURFACE_CONTRACTS[surfaceId]);
}

export function listProjectTemplatesForSurface(surfaceId: EditorialSurfaceId): ProjectTemplate[] {
  return [...SURFACE_CONTRACTS[surfaceId].projectTemplates];
}

export function listSurfaceWorkspaces(surfaceId: EditorialSurfaceId): BuiltInEditorialWorkspaceId[] {
  const availability = SURFACE_CONTRACTS[surfaceId].workspaceAvailability;
  return BUILT_IN_EDITORIAL_WORKSPACE_IDS.filter((workspaceId) => availability[workspaceId] !== 'unsupported');
}

export function isWorkspaceAvailableOnSurface(
  surfaceId: EditorialSurfaceId,
  workspaceId: BuiltInEditorialWorkspaceId,
): boolean {
  return SURFACE_CONTRACTS[surfaceId].workspaceAvailability[workspaceId] !== 'unsupported';
}

export function coerceWorkspaceForSurface(
  surfaceId: EditorialSurfaceId,
  workspaceId: string | null | undefined,
): BuiltInEditorialWorkspaceId {
  if (
    workspaceId
    && BUILT_IN_EDITORIAL_WORKSPACE_IDS.includes(workspaceId as BuiltInEditorialWorkspaceId)
    && isWorkspaceAvailableOnSurface(surfaceId, workspaceId as BuiltInEditorialWorkspaceId)
  ) {
    return workspaceId as BuiltInEditorialWorkspaceId;
  }

  return SURFACE_CONTRACTS[surfaceId].defaultWorkspaceId;
}

export function resolveEditorialSurfaceFromPlatform(platform: Platform): EditorialSurfaceId {
  if (platform === 'desktop-mac' || platform === 'desktop-windows') {
    return 'desktop';
  }
  if (platform === 'mobile-ios' || platform === 'mobile-android') {
    return 'mobile';
  }
  return 'browser';
}
