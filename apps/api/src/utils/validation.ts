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
      }));
      return next(new BadRequestError('Validation failed', details));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req[target] is typed as any
    req[target] = result.data as any;
    next();
  };
}

/**
 * Validate multiple targets in a single middleware. Useful for routes
 * that need both params and body validated.
 */
export function validateAll(schemaMap: Partial<Record<ValidateTarget, ZodSchema>>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const allDetails: Array<{ target: string; path: string; message: string }> = [];

    for (const [target, schema] of Object.entries(schemaMap) as [ValidateTarget, ZodSchema][]) {
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        result.error.errors.forEach((e) => {
          allDetails.push({ target, path: e.path.join('.'), message: e.message });
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req[target] is typed as any
        req[target] = result.data as any;
      }
    }

    if (allDetails.length > 0) {
      return next(new BadRequestError('Validation failed', allDetails));
    }
    next();
  };
}

// ─── String sanitization ────────────────────────────────────────────────────

/**
 * Sanitize a string by trimming whitespace and removing dangerous HTML entities.
 * This is a basic XSS prevention measure for stored user content.
 */
export function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Zod transform that trims and sanitizes a string value.
 * Use for user-facing text fields that will be stored.
 */
export const sanitizedString = z.string().transform(sanitizeString);

// ─── Common param schemas ───────────────────────────────────────────────────

export const uuidParam = z.object({ id: z.string().uuid() });
export type UuidParam = z.infer<typeof uuidParam>;

export const projectIdParam = z.object({ projectId: z.string().uuid() });
export type ProjectIdParam = z.infer<typeof projectIdParam>;

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
  resourceType: z.string().min(1),
  resourceId: z.string().uuid(),
});

export const slugParam = z.object({ slug: z.string().min(1).max(200) });

// ─── Common query schemas ──────────────────────────────────────────────────

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

// ─── Cursor-based pagination ────────────────────────────────────────────────

export const cursorPaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuery>;

export interface CursorPaginationMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * Build cursor pagination metadata from a result set.
 * Expects `items` to already be fetched with `take: limit + 1` to detect hasMore.
 */
export function cursorPaginate<T extends { id: string }>(
  items: T[],
  limit: number,
  total: number,
  cursorField: keyof T = 'id' as keyof T,
): { data: T[]; pagination: CursorPaginationMeta } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];
  const firstItem = data[0];

  return {
    data,
    pagination: {
      nextCursor: hasMore && lastItem ? String(lastItem[cursorField]) : null,
      prevCursor: firstItem ? String(firstItem[cursorField]) : null,
      limit,
      total,
      hasMore,
    },
  };
}

// ─── Reusable schema fragments ─────────────────────────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');
const timecode = z.number().min(0, 'Timecode must be non-negative');

// ─── Schemas ───────────────────────────────────────────────────────────────

export const schemas = {
  // ── Auth ────────────────────────────────────────────────────────────────
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

  logoutBody: z.object({
    refreshToken: z.string().optional(),
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
    avatarUrl: z.string().url().max(2000).optional().nullable(),
  }),

  // ── Projects ───────────────────────────────────────────────────────────
  createProject: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    orgId: z.string().uuid().optional(),
    frameRate: z.number().positive().default(23.976),
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

  duplicateProject: z.object({
    name: z.string().min(1).max(200).optional(),
  }),

  addProjectMember: z.object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['VIEWER', 'REVIEWER', 'ASSISTANT', 'EDITOR', 'ADMIN']).default('EDITOR'),
  }),

  createVersion: z.object({
    version: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
  }),

  projectQuery: paginationQuery.extend({
    search: z.string().max(200).optional(),
    status: z.string().max(50).optional(),
  }),

  // ── Bins ───────────────────────────────────────────────────────────────
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

  // ── Media ──────────────────────────────────────────────────────────────
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
    type: z.string().max(50).optional(),
    search: z.string().max(200).optional(),
    isFavorite: z.coerce.string().optional(),
    status: z.string().max(50).optional(),
  }),

  // ── Timeline ──────────────────────────────────────────────────────────
  createTimeline: z.object({
    name: z.string().min(1).max(200).default('Timeline 1'),
    frameRate: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),

  updateTimeline: z.object({
    name: z.string().min(1).max(200).optional(),
    frameRate: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    sampleRate: z.number().int().positive().optional(),
    duration: z.number().min(0).optional(),
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

  // ── Effects ───────────────────────────────────────────────────────────
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

  // ── Markers ───────────────────────────────────────────────────────────
  createMarker: z.object({
    time: timecode,
    label: z.string().min(1).max(200).optional(),
    color: hexColor.optional(),
    type: z.string().max(50).optional(),
    notes: z.string().max(1000).optional(),
  }),

  updateMarker: z.object({
    time: timecode.optional(),
    label: z.string().max(200).optional(),
    color: hexColor.optional(),
    type: z.string().max(50).optional(),
    notes: z.string().max(1000).optional(),
  }),

  // ── AI Jobs ───────────────────────────────────────────────────────────
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
    type: z.string().max(50).optional(),
    status: z.string().max(50).optional(),
    projectId: z.string().uuid().optional(),
  }),

  // ── Comments ──────────────────────────────────────────────────────────
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

  // ── Approval ──────────────────────────────────────────────────────────
  createApproval: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
    version: z.string().min(1).max(100),
    notes: z.string().max(5000).optional(),
  }),

  // ── Locks ─────────────────────────────────────────────────────────────
  createLock: z.object({
    resourceType: z.string().min(1).max(50),
    resourceId: z.string().uuid(),
    sessionId: z.string().optional(),
  }),

  // ── Publishing ────────────────────────────────────────────────────────
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
    scheduledAt: z.string().datetime().optional(),
  }),

  // ── Export ────────────────────────────────────────────────────────────
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

  importAAFComposition: z.object({
    composition: z.record(z.unknown()),
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
    bitDepth: z.coerce.number().refine(v => [16, 24, 32].includes(v), 'bitDepth must be 16, 24, or 32').default(24),
    sampleRate: z.number().int().positive().default(48000),
    embedTimecode: z.boolean().default(true),
    normalize: z.boolean().default(false),
    includeFullMix: z.boolean().default(true),
    stemAssignments: z.record(z.unknown()).optional(),
  }),

  relinkScan: z.object({
    scanPaths: z.array(z.string().min(1)).min(1, 'At least one scan path is required'),
  }),

  relinkApply: z.object({
    proposals: z.array(z.object({
      assetId: z.string().uuid(),
      newPath: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
    })).min(1, 'At least one proposal is required'),
  }),

  createMulticam: z.object({
    name: z.string().min(1).max(200),
    syncMethod: z.string().min(1).max(50),
    assetIds: z.array(z.string().uuid()).min(2, 'At least 2 angles required').max(16, 'Maximum 16 angles'),
  }),

  sequenceCompare: z.object({
    sequenceA: z.object({ id: z.string().uuid().optional(), name: z.string().optional() }).passthrough(),
    sequenceB: z.object({ id: z.string().uuid().optional(), name: z.string().optional() }).passthrough(),
    options: z.record(z.unknown()).optional(),
  }),

  binLockMessage: z.object({
    message: z.string().max(500).optional(),
  }),

  // ── Marketplace ────────────────────────────────────────────────────────
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
    priceTokens: z.number().int().min(0).optional(),
    priceCents: z.number().int().min(0).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    downloadUrl: z.string().url().optional(),
    previewUrl: z.string().url().optional(),
    isPublished: z.boolean().optional(),
  }),

  // ── Brand & Marketing ──────────────────────────────────────────────────
  createBrandKit: z.object({
    orgId: z.string().uuid(),
    brandName: z.string().min(1).max(200),
    primaryColors: z.array(z.string()).optional(),
    secondaryColors: z.array(z.string()).optional(),
    fonts: z.record(z.string()).optional(),
    typography: z.record(z.unknown()).optional(),
    voiceTone: z.string().max(500).optional(),
    approvedMusicIds: z.array(z.string()).optional(),
    prohibitedElements: z.array(z.string()).optional(),
  }),

  updateBrandKit: z.object({
    brandName: z.string().min(1).max(200).optional(),
    primaryColors: z.array(z.string()).optional(),
    secondaryColors: z.array(z.string()).optional(),
    fonts: z.record(z.string()).optional(),
    typography: z.record(z.unknown()).optional(),
    voiceTone: z.string().max(500).optional(),
    approvedMusicIds: z.array(z.string()).optional(),
    prohibitedElements: z.array(z.string()).optional(),
    logoUrl: z.string().url().optional().nullable(),
    watermarkUrl: z.string().url().optional().nullable(),
  }),

  createBrandTemplate: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    elements: z.array(z.unknown()).default([]),
    lockedElementIds: z.array(z.string()).default([]),
    category: z.string().max(100).optional(),
  }),

  updateBrandTemplate: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    elements: z.array(z.unknown()).optional(),
    lockedElementIds: z.array(z.string()).optional(),
    category: z.string().max(100).optional(),
    thumbnailUrl: z.string().url().optional().nullable(),
  }),

  createCampaign: z.object({
    orgId: z.string().uuid(),
    brandKitId: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
    brief: z.string().max(5000).optional(),
    objective: z.string().max(1000).optional(),
    targetAudience: z.string().max(1000).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    tokenBudget: z.number().int().min(0).optional(),
  }),

  updateCampaign: z.object({
    name: z.string().min(1).max(200).optional(),
    brief: z.string().max(5000).optional(),
    objective: z.string().max(1000).optional(),
    targetAudience: z.string().max(1000).optional(),
    status: z.string().max(50).optional(),
    tokenBudget: z.number().int().min(0).optional(),
    brandKitId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  createDeliverable: z.object({
    name: z.string().min(1).max(200),
    type: z.string().min(1).max(100),
    targetDuration: z.number().positive().optional(),
    aspectRatio: z.string().max(20).optional(),
    assignedEditorId: z.string().uuid().optional(),
  }),

  updateDeliverable: z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.string().min(1).max(100).optional(),
    status: z.string().max(50).optional(),
    targetDuration: z.number().positive().optional(),
    aspectRatio: z.string().max(20).optional(),
    assignedEditorId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  }),

  createContentVariant: z.object({
    masterProjectId: z.string().uuid(),
    variantName: z.string().min(1).max(200),
    languageCode: z.string().max(10).optional(),
    changes: z.array(z.unknown()).default([]),
  }),

  complianceCheck: z.object({
    brandKitId: z.string().uuid().optional(),
  }),

  createVideoPerformance: z.object({
    projectId: z.string().uuid(),
    publishJobId: z.string().uuid().optional(),
    platform: z.string().min(1).max(50),
    externalVideoId: z.string().max(500).optional(),
    views: z.number().int().min(0).default(0),
    completionRate: z.number().min(0).max(1).optional(),
    clickThroughRate: z.number().min(0).max(1).optional(),
    engagementRate: z.number().min(0).max(1).optional(),
    avgWatchSeconds: z.number().min(0).optional(),
    likes: z.number().int().min(0).default(0),
    comments: z.number().int().min(0).default(0),
    shares: z.number().int().min(0).default(0),
    impressions: z.number().int().min(0).default(0),
    periodDays: z.number().int().positive().default(7),
  }),

  createDAMConnection: z.object({
    orgId: z.string().uuid(),
    provider: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    apiEndpoint: z.string().url(),
    apiKey: z.string().optional(),
    accessToken: z.string().optional(),
  }),

  // ── Creator Workflow ───────────────────────────────────────────────────
  createSeries: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    brandColors: z.array(z.string()).default([]),
    brandFonts: z.record(z.string()).default({}),
  }),

  updateSeries: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    brandColors: z.array(z.string()).optional(),
    brandFonts: z.record(z.string()).optional(),
    thumbnailUrl: z.string().url().optional().nullable(),
    introTemplateId: z.string().uuid().optional().nullable(),
    outroTemplateId: z.string().uuid().optional().nullable(),
  }),

  createEpisode: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    projectId: z.string().uuid().optional(),
  }),

  updateEpisode: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.string().max(50).optional(),
    projectId: z.string().uuid().optional(),
    thumbnailUrl: z.string().url().optional().nullable(),
  }),

  createPlaybook: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    vertical: z.string().max(50).default('GENERAL'),
    steps: z.array(z.unknown()).default([]),
    variables: z.array(z.unknown()).default([]),
    priceTokens: z.number().int().min(0).default(0),
  }),

  updatePlaybook: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    vertical: z.string().max(50).optional(),
    steps: z.array(z.unknown()).optional(),
    variables: z.array(z.unknown()).optional(),
    priceTokens: z.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  }),

  upsertAgentMemory: z.object({
    value: z.unknown(),
    source: z.string().max(50).default('AUTO'),
    confidence: z.number().min(0).max(1).default(0.8),
  }),

  // ── News Workflow ──────────────────────────────────────────────────────
  createNRCSConnection: z.object({
    type: z.enum(['INEWS', 'ENPS', 'OCTOPUS', 'OPENMEDIA']),
    host: z.string().min(1).max(500),
    port: z.number().int().positive(),
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    orgId: z.string().uuid(),
  }),

  updateNRCSConnection: z.object({
    type: z.enum(['INEWS', 'ENPS', 'OCTOPUS', 'OPENMEDIA']).optional(),
    host: z.string().min(1).max(500).optional(),
    port: z.number().int().positive().optional(),
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  }),

  updateStory: z.object({
    status: z.enum(['UNASSIGNED', 'IN_EDIT', 'READY', 'AIRED', 'KILLED']).optional(),
    assignedEditorId: z.string().uuid().optional().nullable(),
    actualDuration: z.number().min(0).optional(),
    priority: z.number().int().min(0).max(2).optional(),
  }),

  sendToAir: z.object({
    destinationId: z.string().uuid(),
  }),

  createPlayoutDestination: z.object({
    orgId: z.string().uuid(),
    name: z.string().min(1).max(200),
    type: z.enum(['AIRSPEED', 'VIZ_ARK', 'ROSS_STRATUS', 'GRASS_VALLEY_K2', 'GENERIC_MXF_FTP']),
    host: z.string().min(1).max(500),
    port: z.number().int().positive().optional(),
    basePath: z.string().max(1000).optional(),
    filenamePattern: z.string().max(500).optional(),
    outputFormat: z.string().max(50).optional(),
  }),

  // ── Sports Production ──────────────────────────────────────────────────
  createSportsProduction: z.object({
    projectId: z.string().uuid(),
    sport: z.enum(['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'TENNIS', 'CRICKET', 'RUGBY', 'OTHER']),
    competitionName: z.string().max(200).optional(),
    venue: z.string().max(200).optional(),
    homeTeam: z.string().max(100).optional(),
    awayTeam: z.string().max(100).optional(),
    gameDate: z.string().datetime().optional(),
    broadcastNetwork: z.string().max(200).optional(),
    evsServerHost: z.string().max(500).optional(),
    statsProvider: z.string().max(200).optional(),
  }),

  updateSportsProduction: z.object({
    sport: z.enum(['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'TENNIS', 'CRICKET', 'RUGBY', 'OTHER']).optional(),
    competitionName: z.string().max(200).optional(),
    venue: z.string().max(200).optional(),
    homeTeam: z.string().max(100).optional(),
    awayTeam: z.string().max(100).optional(),
    broadcastNetwork: z.string().max(200).optional(),
    evsServerHost: z.string().max(500).optional(),
    statsProvider: z.string().max(200).optional(),
    status: z.string().max(50).optional(),
    gameDate: z.string().datetime().optional(),
  }),

  createSportsHighlight: z.object({
    eventType: z.enum([
      'GOAL', 'TACKLE', 'DUNK', 'ASSIST', 'PENALTY', 'FOUL',
      'HOME_RUN', 'TOUCHDOWN', 'REPLAY', 'TIMEOUT', 'SUBSTITUTION',
      'YELLOW_CARD', 'RED_CARD', 'OTHER',
    ]),
    gameClock: z.string().max(20).optional(),
    period: z.string().max(20).optional(),
    description: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    timestamp: z.number().min(0),
    mediaAssetId: z.string().uuid().optional(),
    players: z.array(z.string().max(100)).optional(),
    homeScore: z.number().int().min(0).optional(),
    awayScore: z.number().int().min(0).optional(),
  }),

  updateSportsHighlight: z.object({
    eventType: z.enum([
      'GOAL', 'TACKLE', 'DUNK', 'ASSIST', 'PENALTY', 'FOUL',
      'HOME_RUN', 'TOUCHDOWN', 'REPLAY', 'TIMEOUT', 'SUBSTITUTION',
      'YELLOW_CARD', 'RED_CARD', 'OTHER',
    ]).optional(),
    gameClock: z.string().max(20).optional(),
    period: z.string().max(20).optional(),
    description: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    timestamp: z.number().min(0).optional(),
    players: z.array(z.string().max(100)).optional(),
    homeScore: z.number().int().min(0).optional(),
    awayScore: z.number().int().min(0).optional(),
    isConfirmed: z.boolean().optional(),
  }),

  createGrowingFile: z.object({
    filePath: z.string().min(1).max(1000),
    format: z.string().max(20).default('MXF'),
    cameraAngle: z.string().max(100).optional(),
  }),

  updateGrowingFile: z.object({
    currentDuration: z.number().min(0).optional(),
    isGrowing: z.boolean().optional(),
    lastFrameAt: z.string().datetime().optional(),
  }),

  createSportsPackage: z.object({
    type: z.enum(['PRE_GAME', 'HALFTIME', 'POST_GAME', 'SOCIAL_CLIP', 'HIGHLIGHTS_REEL', 'PLAYER_FEATURE']),
    name: z.string().min(1).max(200),
    targetDuration: z.number().positive().optional(),
    highlightIds: z.array(z.string().uuid()).optional(),
  }),

  updateSportsPackage: z.object({
    type: z.enum(['PRE_GAME', 'HALFTIME', 'POST_GAME', 'SOCIAL_CLIP', 'HIGHLIGHTS_REEL', 'PLAYER_FEATURE']).optional(),
    name: z.string().min(1).max(200).optional(),
    status: z.string().max(50).optional(),
    targetDuration: z.number().positive().optional(),
    highlightIds: z.array(z.string().uuid()).optional(),
    timelineId: z.string().uuid().optional(),
  }),

  // ── Pro Tools Integration ──────────────────────────────────────────────
  createProToolsSession: z.object({
    projectId: z.string().uuid(),
    mediaCentralId: z.string().max(500).optional(),
    proToolsHost: z.string().max(500).optional(),
    syncMode: z.enum(['AAF', 'MXF', 'REWIRE']).default('AAF'),
  }),

  updateProToolsSession: z.object({
    status: z.string().max(50).optional(),
    lastSyncAt: z.string().datetime().optional(),
    syncMode: z.enum(['AAF', 'MXF', 'REWIRE']).optional(),
  }),

  createMarkerSync: z.object({
    avidMarkerId: z.string().max(200).optional(),
    proToolsLocId: z.string().max(200).optional(),
    timecode: z.string().max(20),
    label: z.string().max(200).optional(),
    color: hexColor.optional(),
    syncDirection: z.enum(['AVID_TO_PT', 'PT_TO_AVID', 'BIDIRECTIONAL']).default('BIDIRECTIONAL'),
  }),

  batchMarkerSync: z.object({
    direction: z.enum(['AVID_TO_PT', 'PT_TO_AVID', 'BIDIRECTIONAL']),
    markers: z.array(z.object({
      avidMarkerId: z.string().max(200).optional(),
      proToolsLocId: z.string().max(200).optional(),
      timecode: z.string().max(20),
      label: z.string().max(200).optional(),
      color: hexColor.optional(),
    })).min(1, 'At least one marker is required'),
  }),

  proToolsExportAAF: z.object({
    timelineId: z.string().uuid(),
    handleDuration: z.number().min(0).max(30).default(2),
  }),

  // ── NEXIS Storage ──────────────────────────────────────────────────────
  createNEXISWorkspace: z.object({
    orgId: z.string().uuid(),
    name: z.string().min(1).max(200),
    host: z.string().min(1).max(500),
    port: z.number().int().positive().default(443),
    workspaceId: z.string().max(500).optional(),
    storageGroupId: z.string().max(500).optional(),
    totalCapacityGB: z.number().positive().optional(),
  }),

  createNEXISMediaPath: z.object({
    mediaAssetId: z.string().uuid(),
    nexisPath: z.string().min(1).max(2000),
  }),

  updateNEXISCache: z.object({
    cacheStatus: z.string().max(50).optional(),
    cacheSizeMB: z.number().min(0).optional(),
  }),

  // ── Render Farm ───────────────────────────────────────────────────────
  registerRenderWorker: z.object({
    hostname: z.string().min(1, 'hostname is required').max(500),
    ip: z.string().max(50).optional(),
    port: z.number().int().min(0).max(65535).optional(),
    workerTypes: z.array(z.string().max(50)).default(['render']),
    capabilities: z.record(z.unknown()).optional(),
  }),

  submitRenderJob: z.object({
    name: z.string().min(1, 'name is required').max(200),
    presetId: z.string().min(1, 'presetId is required').max(200),
    sourceTimelineId: z.string().min(1, 'sourceTimelineId is required'),
    totalFrames: z.number().int().positive('totalFrames must be a positive number'),
    priority: z.number().int().min(1).max(10).optional(),
    templateId: z.string().max(200).optional(),
    exportSettings: z.record(z.unknown()).optional(),
    segmentCount: z.number().int().positive().optional(),
  }),

  reorderRenderQueue: z.object({
    jobId: z.string().min(1, 'jobId is required'),
    newIndex: z.number().int().min(0, 'newIndex must be a non-negative integer'),
  }),

  renderInstallScriptQuery: z.object({
    host: z.string().max(500).optional(),
    workerTypes: z.string().max(500).optional(),
  }),
};
