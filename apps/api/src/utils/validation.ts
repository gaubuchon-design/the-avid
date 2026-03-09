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
};
