import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas } from '../../utils/validation';
import { NotFoundError, BadRequestError, assertFound } from '../../utils/errors';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── TIMELINES ─────────────────────────────────────────────────────────────────

// GET /projects/:projectId/timelines
router.get('/', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const timelines = await db.timeline.findMany({
    where: { projectId: req.params.projectId },
    include: {
      tracks: {
        orderBy: { sortOrder: 'asc' },
        include: { clips: { orderBy: { startTime: 'asc' } } },
      },
      markers: { orderBy: { time: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ timelines });
});

// POST /projects/:projectId/timelines
router.post('/', requireProjectAccess('EDITOR'), validate(schemas.createTimeline), async (req: Request, res: Response) => {
  const { name, frameRate, width, height } = req.body;

  // Inherit from project settings if not provided
  const project = await db.project.findUnique({
    where: { id: req.params.projectId },
    select: { frameRate: true, width: true, height: true, sampleRate: true },
  });
  assertFound(project, 'Project');

  const timeline = await db.timeline.create({
    data: {
      projectId: req.params.projectId,
      name,
      frameRate: frameRate ?? project.frameRate,
      width: width ?? project.width,
      height: height ?? project.height,
      sampleRate: project.sampleRate,
      tracks: {
        create: [
          { name: 'V1', type: 'VIDEO', sortOrder: 0, color: '#6366f1' },
          { name: 'A1', type: 'AUDIO', sortOrder: 1, color: '#22c55e' },
        ],
      },
    },
    include: { tracks: { include: { clips: true } } },
  });

  res.status(201).json({ timeline });
});

// GET /projects/:projectId/timelines/:timelineId
router.get('/:timelineId', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const timeline = await db.timeline.findFirst({
    where: { id: req.params.timelineId, projectId: req.params.projectId },
    include: {
      tracks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          clips: {
            orderBy: { startTime: 'asc' },
            include: { effects: { orderBy: { sortOrder: 'asc' } } },
          },
          keyframes: true,
        },
      },
      markers: { orderBy: { time: 'asc' } },
    },
  });
  assertFound(timeline, 'Timeline');
  res.json({ timeline });
});

// PATCH /projects/:projectId/timelines/:timelineId
router.patch(
  '/:timelineId',
  requireProjectAccess('EDITOR'),
  validate(schemas.updateTimeline),
  async (req: Request, res: Response) => {
    // If setting isPrimary, unset others
    if (req.body.isPrimary === true) {
      await db.timeline.updateMany({
        where: { projectId: req.params.projectId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const timeline = await db.timeline.update({
      where: { id: req.params.timelineId },
      data: req.body,
    });
    res.json({ timeline });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId
router.delete('/:timelineId', requireProjectAccess('ADMIN'), async (req: Request, res: Response) => {
  const timeline = await db.timeline.findUnique({ where: { id: req.params.timelineId } });
  assertFound(timeline, 'Timeline');

  if (timeline.isPrimary) {
    throw new BadRequestError('Cannot delete the primary timeline');
  }

  await db.timeline.delete({ where: { id: req.params.timelineId } });
  res.status(204).send();
});

// ─── TRACKS ────────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/tracks
router.post(
  '/:timelineId/tracks',
  requireProjectAccess('EDITOR'),
  validate(schemas.createTrack),
  async (req: Request, res: Response) => {
    // Verify timeline belongs to project
    const tl = await db.timeline.findFirst({
      where: { id: req.params.timelineId, projectId: req.params.projectId },
    });
    if (!tl) throw new NotFoundError('Timeline');

    const track = await db.track.create({
      data: { ...req.body, timelineId: req.params.timelineId },
      include: { clips: true },
    });
    res.status(201).json({ track });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/tracks/:trackId
router.patch(
  '/:timelineId/tracks/:trackId',
  requireProjectAccess('EDITOR'),
  validate(schemas.updateTrack),
  async (req: Request, res: Response) => {
    // Verify track belongs to this timeline
    const existing = await db.track.findFirst({
      where: { id: req.params.trackId, timelineId: req.params.timelineId },
    });
    if (!existing) throw new NotFoundError('Track');

    const track = await db.track.update({
      where: { id: req.params.trackId },
      data: req.body,
    });
    res.json({ track });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/tracks/:trackId
router.delete(
  '/:timelineId/tracks/:trackId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    const existing = await db.track.findFirst({
      where: { id: req.params.trackId, timelineId: req.params.timelineId },
    });
    if (!existing) throw new NotFoundError('Track');

    await db.track.delete({ where: { id: req.params.trackId } });
    res.status(204).send();
  }
);

// POST reorder tracks
router.post(
  '/:timelineId/tracks/reorder',
  requireProjectAccess('EDITOR'),
  validate(schemas.reorderTracks),
  async (req: Request, res: Response) => {
    const { order } = req.body;

    await db.$transaction(
      order.map(({ id, sortOrder }: { id: string; sortOrder: number }) =>
        db.track.update({ where: { id }, data: { sortOrder } })
      )
    );

    res.json({ message: 'Tracks reordered', count: order.length });
  }
);

// ─── CLIPS ─────────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/clips
router.post(
  '/:timelineId/clips',
  requireProjectAccess('EDITOR'),
  validate(schemas.createClip),
  async (req: Request, res: Response) => {
    const { trackId, ...clipData } = req.body;

    // Verify track belongs to this timeline
    const track = await db.track.findFirst({
      where: { id: trackId, timelineId: req.params.timelineId },
    });
    if (!track) throw new NotFoundError('Track');

    // Verify media asset exists if provided
    if (clipData.mediaAssetId) {
      const asset = await db.mediaAsset.findUnique({ where: { id: clipData.mediaAssetId } });
      if (!asset) throw new NotFoundError('Media asset');
    }

    const clip = await db.clip.create({
      data: { ...clipData, trackId },
      include: {
        effects: true,
        mediaAsset: { select: { id: true, name: true, type: true, duration: true } },
      },
    });

    // Update timeline duration if needed
    if (clip.endTime > 0) {
      const timeline = await db.timeline.findUnique({ where: { id: req.params.timelineId } });
      if (timeline && clip.endTime > timeline.duration) {
        await db.timeline.update({
          where: { id: req.params.timelineId },
          data: { duration: clip.endTime },
        });
      }
    }

    res.status(201).json({ clip });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/clips/:clipId -- trim / move
router.patch(
  '/:timelineId/clips/:clipId',
  requireProjectAccess('EDITOR'),
  validate(schemas.trimClip),
  async (req: Request, res: Response) => {
    // Verify clip exists in this timeline
    const existing = await db.clip.findFirst({
      where: { id: req.params.clipId, track: { timelineId: req.params.timelineId } },
    });
    if (!existing) throw new NotFoundError('Clip');

    const clip = await db.clip.update({
      where: { id: req.params.clipId },
      data: req.body,
      include: { effects: true },
    });
    res.json({ clip });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/clips/:clipId
router.delete(
  '/:timelineId/clips/:clipId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    const existing = await db.clip.findFirst({
      where: { id: req.params.clipId, track: { timelineId: req.params.timelineId } },
    });
    if (!existing) throw new NotFoundError('Clip');

    await db.clip.delete({ where: { id: req.params.clipId } });
    res.status(204).send();
  }
);

// POST split clip at timecode
router.post(
  '/:timelineId/clips/:clipId/split',
  requireProjectAccess('EDITOR'),
  validate(schemas.splitClip),
  async (req: Request, res: Response) => {
    const { splitTime } = req.body;

    const clip = await db.clip.findFirst({
      where: { id: req.params.clipId, track: { timelineId: req.params.timelineId } },
    });
    assertFound(clip, 'Clip');

    if (splitTime <= clip.startTime || splitTime >= clip.endTime) {
      throw new BadRequestError('splitTime must be within clip range');
    }

    const duration = clip.endTime - clip.startTime;
    const splitRatio = (splitTime - clip.startTime) / duration;
    const midTrimPoint = clip.trimStart + splitRatio * (clip.endTime - clip.startTime - clip.trimEnd - clip.trimStart);

    // Update original, create new -- in a transaction for consistency
    const [updatedClip, newClip] = await db.$transaction([
      db.clip.update({
        where: { id: clip.id },
        data: { endTime: splitTime, trimEnd: midTrimPoint },
      }),
      db.clip.create({
        data: {
          trackId: clip.trackId,
          mediaAssetId: clip.mediaAssetId,
          startTime: splitTime,
          endTime: clip.endTime,
          trimStart: midTrimPoint,
          trimEnd: clip.trimEnd,
          speed: clip.speed,
          volume: clip.volume,
          opacity: clip.opacity,
        },
      }),
    ]);

    res.json({ original: updatedClip, split: newClip });
  }
);

// ─── EFFECTS ───────────────────────────────────────────────────────────────────

// POST add effect to clip
router.post(
  '/:timelineId/clips/:clipId/effects',
  requireProjectAccess('EDITOR'),
  validate(schemas.createEffect),
  async (req: Request, res: Response) => {
    // Verify clip exists in this timeline
    const clipExists = await db.clip.findFirst({
      where: { id: req.params.clipId, track: { timelineId: req.params.timelineId } },
    });
    if (!clipExists) throw new NotFoundError('Clip');

    const effect = await db.clipEffect.create({
      data: { clipId: req.params.clipId, ...req.body },
    });
    res.status(201).json({ effect });
  }
);

// PATCH update effect
router.patch(
  '/:timelineId/clips/:clipId/effects/:effectId',
  requireProjectAccess('EDITOR'),
  validate(schemas.updateEffect),
  async (req: Request, res: Response) => {
    const effect = await db.clipEffect.update({
      where: { id: req.params.effectId },
      data: req.body,
    });
    res.json({ effect });
  }
);

// DELETE effect
router.delete(
  '/:timelineId/clips/:clipId/effects/:effectId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    await db.clipEffect.delete({ where: { id: req.params.effectId } });
    res.status(204).send();
  }
);

// ─── MARKERS ──────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/markers
router.post(
  '/:timelineId/markers',
  requireProjectAccess('EDITOR'),
  validate(schemas.createMarker),
  async (req: Request, res: Response) => {
    // Verify timeline belongs to project
    const tl = await db.timeline.findFirst({
      where: { id: req.params.timelineId, projectId: req.params.projectId },
    });
    if (!tl) throw new NotFoundError('Timeline');

    const marker = await db.timelineMarker.create({
      data: { ...req.body, timelineId: req.params.timelineId, createdById: req.user!.id },
    });
    res.status(201).json({ marker });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/markers/:markerId
router.patch(
  '/:timelineId/markers/:markerId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    const { name, color, notes, time } = req.body;
    const marker = await db.timelineMarker.update({
      where: { id: req.params.markerId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(time !== undefined ? { time } : {}),
      },
    });
    res.json({ marker });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/markers/:markerId
router.delete(
  '/:timelineId/markers/:markerId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    await db.timelineMarker.delete({ where: { id: req.params.markerId } });
    res.status(204).send();
  }
);

export default router;
