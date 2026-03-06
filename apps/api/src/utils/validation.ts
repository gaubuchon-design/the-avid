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
    req[target] = result.data as any;
    next();
  };
}

// ─── Common schemas ────────────────────────────────────────────────────────────

export const uuidParam = z.object({ id: z.string().uuid() });
export type UuidParam = z.infer<typeof uuidParam>;

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

// ─── Schemas ───────────────────────────────────────────────────────────────────

export const schemas = {
  // Auth
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(100),
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),

  // Projects
  createProject: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    orgId: z.string().uuid().optional(),
    frameRate: z.number().default(23.976),
    width: z.number().default(1920),
    height: z.number().default(1080),
    sampleRate: z.number().default(48000),
    colorSpace: z.string().default('Rec.709'),
    tags: z.array(z.string()).default([]),
  }),

  updateProject: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }),

  // Bins
  createBin: z.object({
    name: z.string().min(1).max(200),
    parentId: z.string().uuid().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  }),

  // Timeline
  createTimeline: z.object({
    name: z.string().min(1).max(200).default('Timeline 1'),
    frameRate: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),

  createTrack: z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['VIDEO', 'AUDIO', 'EFFECT', 'SUBTITLE', 'GRAPHIC']),
    sortOrder: z.number().default(0),
  }),

  createClip: z.object({
    trackId: z.string().uuid(),
    mediaAssetId: z.string().uuid().optional(),
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    trimStart: z.number().min(0).default(0),
    trimEnd: z.number().min(0).default(0),
    speed: z.number().min(0.1).max(10).default(1),
  }),

  trimClip: z.object({
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    trimStart: z.number().min(0).optional(),
    trimEnd: z.number().min(0).optional(),
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
    priority: z.number().min(1).max(10).default(5),
  }),

  // Comments
  createComment: z.object({
    text: z.string().min(1).max(5000),
    timelineId: z.string().uuid().optional(),
    timecode: z.number().optional(),
    parentId: z.string().uuid().optional(),
  }),

  // Publishing
  createPublishJob: z.object({
    timelineId: z.string().uuid(),
    platform: z.enum(['YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'TWITTER_X', 'LINKEDIN', 'VIMEO', 'CUSTOM_RTMP']),
    title: z.string().max(300).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string()).default([]),
    aspectRatio: z.string().default('16:9'),
    resolution: z.string().default('1920x1080'),
    format: z.string().default('mp4'),
    autoCaption: z.boolean().default(false),
    smartReframe: z.boolean().default(false),
    scheduledAt: z.string().datetime().optional(),
  }),
};
