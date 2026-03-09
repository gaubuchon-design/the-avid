import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from './errors';

// ─── Validate middleware factory ───────────────────────────────────────────────

type ValidateTarget = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodSchema<T>, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      return next(new BadRequestError('Validation failed', details));
    }
    req[target] = result.data as any;
    next();
  };
}

/**
 * Validate multiple targets in a single middleware. Useful for routes
 * that need both params and body validated.
 */
export function validateAll(schemas: Partial<Record<ValidateTarget, ZodSchema>>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const allDetails: Array<{ target: string; path: string; message: string }> = [];

    for (const [target, schema] of Object.entries(schemas) as [ValidateTarget, ZodSchema][]) {
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        result.error.errors.forEach((e) => {
          allDetails.push({ target, path: e.path.join('.'), message: e.message });
        });
      } else {
        req[target] = result.data as any;
      }
    }

    if (allDetails.length > 0) {
      return next(new BadRequestError('Validation failed', allDetails));
    }
    next();
  };
}

// ─── Common schemas ────────────────────────────────────────────────────────────

export const uuidParam = z.object({ id: z.string().uuid() });
export type UuidParam = z.infer<typeof uuidParam>;

export const projectIdParam = z.object({ projectId: z.string().uuid() });
export type ProjectIdParam = z.infer<typeof projectIdParam>;

export const paginationQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export function paginate(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };
}

// ─── Common param schemas ─────────────────────────────────────────────────────

export const projectAndUserParams = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const projectIdAndBinIdParams = z.object({
  projectId: z.string().uuid(),
  binId: z.string().uuid(),
});

export const projectIdAndAssetIdParams = z.object({
  projectId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const projectIdAndTimelineIdParams = z.object({
  projectId: z.string().uuid(),
  timelineId: z.string().uuid(),
});

export const timelineAndTrackParams = z.object({
  projectId: z.string().uuid(),
  timelineId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export const timelineAndClipParams = z.object({
  projectId: z.string().uuid(),
  timelineId: z.string().uuid(),
  clipId: z.string().uuid(),
});

export const timelineClipAndEffectParams = z.object({
  projectId: z.string().uuid(),
  timelineId: z.string().uuid(),
  clipId: z.string().uuid(),
  effectId: z.string().uuid(),
});

export const timelineAndMarkerParams = z.object({
  projectId: z.string().uuid(),
  timelineId: z.string().uuid(),
  markerId: z.string().uuid(),
});

export const projectIdAndCommentIdParams = z.object({
  projectId: z.string().uuid(),
  commentId: z.string().uuid(),
});

export const projectIdAndJobIdParams = z.object({
  projectId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const resourceLockParams = z.object({
  projectId: z.string().uuid(),
  resourceType: z.string().min(1).max(50),
  resourceId: z.string().uuid(),
});

export const slugParam = z.object({ slug: z.string().min(1).max(200) });

// ─── Reusable schema fragments ────────────────────────────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');
const timecode = z.number().min(0, 'Timecode must be non-negative');

// ─── Schemas ───────────────────────────────────────────────────────────────────

export const schemas = {
  // Auth
  register: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    displayName: z.string().min(1, 'Display name is required').max(100),
  }),

  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  refreshToken: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
  }),

  updateProfile: z.object({
    displayName: z.string().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    timezone: z.string().max(50).optional(),
    locale: z.string().max(10).optional(),
    avatarUrl: z.string().url().optional().nullable(),
  }),

  logoutBody: z.object({
    refreshToken: z.string().optional(),
  }),

  // Projects
  createProject: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    orgId: z.string().uuid().optional(),
    frameRate: z.number().default(23.976),
    width: z.number().int().positive().default(1920),
    height: z.number().int().positive().default(1080),
    sampleRate: z.number().int().positive().default(48000),
    colorSpace: z.string().default('Rec.709'),
    tags: z.array(z.string().max(50)).max(20).default([]),
  }),

  updateProject: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    notes: z.string().max(5000).optional(),
  }),

  addProjectMember: z.object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['VIEWER', 'REVIEWER', 'ASSISTANT', 'EDITOR', 'ADMIN']).default('EDITOR'),
  }),

  createVersion: z.object({
    version: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
  }),

  duplicateProject: z.object({
    name: z.string().min(1).max(200).optional(),
  }),

  projectQuery: paginationQuery.extend({
    search: z.string().max(200).optional(),
    status: z.string().optional(),
  }),

  // Bins
  createBin: z.object({
    name: z.string().min(1).max(200),
    parentId: z.string().uuid().optional(),
    color: hexColor.default('#6366f1'),
  }),

  updateBin: z.object({
    name: z.string().min(1).max(200).optional(),
    color: hexColor.optional(),
    sortOrder: z.number().int().min(0).optional(),
    parentId: z.string().uuid().optional().nullable(),
  }),

  // Media
  initiateUpload: z.object({
    fileName: z.string().min(1).max(500),
    mimeType: z.string().min(1),
    fileSize: z.number().int().positive().optional(),
  }),

  updateMediaAsset: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().max(50)).max(50).optional(),
    rating: z.number().int().min(0).max(5).optional(),
    isFavorite: z.boolean().optional(),
    tapeName: z.string().max(100).optional(),
    reel: z.string().max(100).optional(),
    scene: z.string().max(100).optional(),
    take: z.string().max(100).optional(),
  }),

  moveAsset: z.object({
    binId: z.string().uuid('Target binId is required'),
  }),

  mediaQuery: paginationQuery.extend({
    binId: z.string().uuid().optional(),
    type: z.string().optional(),
    search: z.string().max(200).optional(),
    isFavorite: z.enum(['true', 'false']).optional(),
    status: z.string().optional(),
  }),

  // Timeline
  createTimeline: z.object({
    name: z.string().min(1).max(200).default('Timeline 1'),
    frameRate: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),

  updateTimeline: z.object({
    name: z.string().min(1).max(200).optional(),
    frameRate: z.number().positive().optional(),
    isPrimary: z.boolean().optional(),
  }),

  createTrack: z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['VIDEO', 'AUDIO', 'EFFECT', 'SUBTITLE', 'GRAPHIC']),
    sortOrder: z.number().int().min(0).default(0),
    color: hexColor.optional(),
  }),

  updateTrack: z.object({
    name: z.string().min(1).max(200).optional(),
    muted: z.boolean().optional(),
    locked: z.boolean().optional(),
    solo: z.boolean().optional(),
    volume: z.number().min(0).max(2).optional(),
    pan: z.number().min(-1).max(1).optional(),
    color: hexColor.optional(),
    height: z.number().int().min(20).max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isPatched: z.boolean().optional(),
  }),

  reorderTracks: z.object({
    order: z.array(z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
    })).min(1),
  }),

  createClip: z.object({
    trackId: z.string().uuid(),
    mediaAssetId: z.string().uuid().optional(),
    startTime: timecode,
    endTime: timecode,
    trimStart: timecode.default(0),
    trimEnd: timecode.default(0),
    speed: z.number().min(0.1).max(10).default(1),
  }).refine(
    (data) => data.endTime > data.startTime,
    { message: 'endTime must be greater than startTime', path: ['endTime'] }
  ),

  trimClip: z.object({
    startTime: timecode.optional(),
    endTime: timecode.optional(),
    trimStart: timecode.optional(),
    trimEnd: timecode.optional(),
  }),

  splitClip: z.object({
    splitTime: timecode,
  }),

  // Effects
  createEffect: z.object({
    type: z.string().min(1).max(100),
    params: z.record(z.unknown()).default({}),
    sortOrder: z.number().int().min(0).default(0),
  }),

  updateEffect: z.object({
    type: z.string().min(1).max(100).optional(),
    params: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  }),

  // Markers
  createMarker: z.object({
    time: timecode,
    name: z.string().min(1).max(200),
    color: hexColor.optional(),
    notes: z.string().max(1000).optional(),
  }),

  updateMarker: z.object({
    name: z.string().min(1).max(200).optional(),
    color: hexColor.optional(),
    notes: z.string().max(1000).optional(),
    time: timecode.optional(),
  }),

  // AI Jobs
  createAIJob: z.object({
    type: z.enum([
      'TRANSCRIPTION', 'ASSEMBLY', 'PHRASE_SEARCH', 'SMART_REFRAME',
      'VOICE_ISOLATION', 'OBJECT_MASK', 'AUTO_CAPTIONS', 'HIGHLIGHTS',
      'COMPLIANCE_SCAN', 'SCENE_DETECTION', 'MUSIC_BEATS', 'SCRIPT_SYNC',
    ]),
    mediaAssetId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    inputParams: z.record(z.unknown()).default({}),
    priority: z.number().int().min(1).max(10).default(5),
  }),

  transcribe: z.object({
    mediaAssetId: z.string().uuid(),
    language: z.string().max(10).default('en'),
    diarize: z.boolean().default(false),
  }),

  phraseSearch: z.object({
    projectId: z.string().uuid(),
    query: z.string().min(1).max(500),
    searchType: z.enum(['phonetic', 'semantic', 'visual']).default('semantic'),
  }),

  scriptSync: z.object({
    projectId: z.string().uuid(),
    scriptText: z.string().min(1).max(100000),
    mediaAssetIds: z.array(z.string().uuid()).optional(),
  }),

  assembly: z.object({
    projectId: z.string().uuid(),
    timelineId: z.string().uuid().optional(),
    prompt: z.string().max(2000).optional(),
    role: z.enum(['editor', 'assistant', 'director']).default('editor'),
    mediaAssetIds: z.array(z.string().uuid()).optional(),
  }),

  highlights: z.object({
    mediaAssetId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    criteria: z.string().max(500).optional(),
    maxDuration: z.number().int().min(10).max(600).default(90),
  }),

  aiJobQuery: paginationQuery.extend({
    type: z.string().optional(),
    status: z.string().optional(),
    projectId: z.string().uuid().optional(),
  }),

  // Comments
  createComment: z.object({
    text: z.string().min(1).max(5000),
    timelineId: z.string().uuid().optional(),
    timecode: timecode.optional(),
    parentId: z.string().uuid().optional(),
  }),

  updateComment: z.object({
    text: z.string().min(1).max(5000).optional(),
    isResolved: z.boolean().optional(),
  }),

  commentQuery: z.object({
    timelineId: z.string().uuid().optional(),
    resolved: z.enum(['true', 'false']).optional(),
  }),

  // Approval
  createApproval: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
    version: z.string().max(100).optional(),
    notes: z.string().max(5000).optional(),
  }),

  // Locks
  createLock: z.object({
    resourceType: z.string().min(1).max(50),
    resourceId: z.string().uuid(),
    sessionId: z.string().optional(),
  }),

  // Publishing
  createPublishJob: z.object({
    timelineId: z.string().uuid(),
    platform: z.enum(['YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'TWITTER_X', 'LINKEDIN', 'VIMEO', 'CUSTOM_RTMP']),
    title: z.string().max(300).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(30).default([]),
    aspectRatio: z.string().default('16:9'),
    resolution: z.string().default('1920x1080'),
    format: z.string().default('mp4'),
    autoCaption: z.boolean().default(false),
    smartReframe: z.boolean().default(false),
    scheduledAt: z.string().datetime().optional(),
  }),

  updatePublishJob: z.object({
    title: z.string().max(300).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(30).optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    format: z.string().optional(),
    autoCaption: z.boolean().optional(),
    smartReframe: z.boolean().optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
  }),

  // Export
  exportAAF: z.object({
    format: z.enum(['aaf', 'omf']).default('aaf'),
    embedMedia: z.boolean().default(false),
    includeMarkers: z.boolean().default(true),
    includeEffects: z.boolean().default(true),
    includeMetadata: z.boolean().default(true),
    frameRate: z.number().positive().optional(),
    dropFrame: z.boolean().default(false),
    trackFilter: z.array(z.string()).optional(),
  }),

  exportEDL: z.object({
    format: z.enum(['edl', 'ale', 'csv']).default('edl'),
    title: z.string().max(200).optional(),
    frameRate: z.number().positive().optional(),
    timecodeMode: z.enum(['drop', 'non-drop']).default('non-drop'),
    includeComments: z.boolean().default(true),
    includeSpeedChanges: z.boolean().default(true),
    trackTypes: z.array(z.string()).optional(),
  }),

  exportStems: z.object({
    preset: z.string().max(100).default('Film/TV Standard'),
    format: z.enum(['wav', 'aiff']).default('wav'),
    bitDepth: z.enum(['16', '24', '32']).transform(Number).default('24'),
    sampleRate: z.number().int().positive().default(48000),
    embedTimecode: z.boolean().default(true),
    normalize: z.boolean().default(false),
    includeFullMix: z.boolean().default(true),
    stemAssignments: z.record(z.unknown()).optional(),
  }),

  importAAFComposition: z.object({
    composition: z.record(z.unknown()),
  }),

  relinkScan: z.object({
    scanPaths: z.array(z.string().min(1).max(1000)).min(1, 'scanPaths must be a non-empty array'),
  }),

  relinkApply: z.object({
    proposals: z.array(z.object({
      assetId: z.string().uuid(),
      newPath: z.string().min(1).max(1000),
    })).min(1, 'proposals must be a non-empty array'),
  }),

  createMulticam: z.object({
    name: z.string().min(1).max(200),
    syncMethod: z.enum(['TIMECODE', 'AUDIO_WAVEFORM', 'IN_POINT', 'MARKER']),
    assetIds: z.array(z.string().uuid()).min(2, 'At least 2 angles (assetIds) are required').max(16, 'Maximum 16 angles allowed'),
  }),

  sequenceCompare: z.object({
    sequenceA: z.object({
      id: z.string().uuid().optional(),
      name: z.string().max(200).optional(),
    }),
    sequenceB: z.object({
      id: z.string().uuid().optional(),
      name: z.string().max(200).optional(),
    }),
  }),

  binLockMessage: z.object({
    message: z.string().max(500).optional(),
  }),

  complianceCheck: z.object({
    brandKitId: z.string().uuid().optional(),
  }),

  // Marketplace
  createMarketplaceItem: z.object({
    type: z.enum(['EFFECT_PLUGIN', 'AI_MODEL', 'TEMPLATE', 'PRESET_PACK', 'FONT_PACK', 'WORKFLOW_SCRIPT']),
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
    description: z.string().max(5000).optional(),
    priceTokens: z.number().int().min(0).default(0),
    priceCents: z.number().int().min(0).default(0),
    tags: z.array(z.string().max(50)).max(20).default([]),
    downloadUrl: z.string().url().optional(),
    previewUrl: z.string().url().optional(),
  }),

  updateMarketplaceItem: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    priceTokens: z.number().int().min(0).optional(),
    priceCents: z.number().int().min(0).optional(),
    downloadUrl: z.string().url().optional().nullable(),
    previewUrl: z.string().url().optional().nullable(),
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  }),

  // Creator
  updateEpisode: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    projectId: z.string().uuid().optional().nullable(),
    status: z.enum(['DRAFT', 'IN_PRODUCTION', 'REVIEW', 'PUBLISHED']).optional(),
  }),

  updatePlaybook: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    vertical: z.string().max(50).optional(),
    steps: z.array(z.record(z.unknown())).optional(),
    variables: z.array(z.record(z.unknown())).optional(),
    priceTokens: z.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  }),

  // Brand
  updateCampaign: z.object({
    name: z.string().min(1).max(200).optional(),
    brief: z.string().max(5000).optional(),
    objective: z.string().max(500).optional(),
    targetAudience: z.string().max(500).optional(),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
    tokenBudget: z.number().int().min(0).optional(),
    status: z.string().max(50).optional(),
  }),

  updateDeliverable: z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.string().max(100).optional(),
    targetDuration: z.number().positive().optional(),
    aspectRatio: z.string().max(20).optional(),
    assignedEditorId: z.string().uuid().optional().nullable(),
    status: z.string().max(50).optional(),
  }),

  updateBrandTemplate: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    elements: z.array(z.record(z.unknown())).optional(),
    lockedElementIds: z.array(z.string()).optional(),
    category: z.string().max(100).optional(),
  }),
};
