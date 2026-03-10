import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import {
  validate, validateAll, schemas,
  projectIdAndTimelineIdParams, timelineAndTrackParams,
  timelineAndClipParams, timelineClipAndEffectParams, timelineAndMarkerParams,
} from '../../utils/validation';
import { NotFoundError, BadRequestError } from '../../utils/errors';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── TIMELINES ─────────────────────────────────────────────────────────────────

// GET /projects/:projectId/timelines
router.get('/', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const timelines = await db.timeline.findMany({
    where: { projectId: req.params['projectId'] },
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
    where: { id: req.params['projectId'] },
    select: { frameRate: true, width: true, height: true, sampleRate: true },
  });

  const timeline = await db.timeline.create({
    data: {
      projectId: req.params['projectId'],
      name,
      frameRate: frameRate ?? project?.frameRate ?? 23.976,
      width: width ?? project?.width ?? 1920,
      height: height ?? project?.height ?? 1080,
      sampleRate: project?.sampleRate ?? 48000,
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
router.get('/:timelineId', requireProjectAccess('VIEWER'), validate(projectIdAndTimelineIdParams, 'params'), async (req: Request, res: Response) => {
  const timeline = await db.timeline.findFirst({
    where: { id: req.params['timelineId'], projectId: req.params['projectId'] },
    include: {
      tracks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          clips: {
            orderBy: { startTime: 'asc' },
            include: { effects: true },
          },
          keyframes: true,
        },
      },
      markers: { orderBy: { time: 'asc' } },
    },
  });
  if (!timeline) throw new NotFoundError('Timeline');
  res.json({ timeline });
});

// PATCH /projects/:projectId/timelines/:timelineId
router.patch(
  '/:timelineId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndTimelineIdParams, body: schemas.updateTimeline }),
  async (req: Request, res: Response) => {
    const timeline = await db.timeline.update({
      where: { id: req.params['timelineId'] },
      data: req.body,
    });
    res.json({ timeline });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId
router.delete('/:timelineId', requireProjectAccess('ADMIN'), validate(projectIdAndTimelineIdParams, 'params'), async (req: Request, res: Response) => {
  // Can't delete the primary timeline
  const timeline = await db.timeline.findUnique({ where: { id: req.params['timelineId'] } });
  if (timeline?.isPrimary) throw new BadRequestError('Cannot delete the primary timeline');
  await db.timeline.delete({ where: { id: req.params['timelineId'] } });
  res.status(204).send();
});

// ─── TRACKS ────────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/tracks
router.post(
  '/:timelineId/tracks',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndTimelineIdParams, body: schemas.createTrack }),
  async (req: Request, res: Response) => {
    const track = await db.track.create({
      data: { ...req.body, timelineId: req.params['timelineId'] },
      include: { clips: true },
    });
    res.status(201).json({ track });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/tracks/:trackId
router.patch(
  '/:timelineId/tracks/:trackId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: timelineAndTrackParams, body: schemas.updateTrack }),
  async (req: Request, res: Response) => {
    const track = await db.track.update({ where: { id: req.params['trackId'] }, data: req.body });
    res.json({ track });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/tracks/:trackId
router.delete('/:timelineId/tracks/:trackId', requireProjectAccess('EDITOR'), validate(timelineAndTrackParams, 'params'), async (req: Request, res: Response) => {
  await db.track.delete({ where: { id: req.params['trackId'] } });
  res.status(204).send();
});

// POST reorder tracks
router.post(
  '/:timelineId/tracks/reorder',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndTimelineIdParams, body: schemas.reorderTracks }),
  async (req: Request, res: Response) => {
    const { order } = req.body;
    await db.$transaction(
      order.map(({ id, sortOrder }: { id: string; sortOrder: number }) =>
        db.track.update({ where: { id }, data: { sortOrder } })
      )
    );
    res.json({ message: 'Tracks reordered' });
  }
);

// ─── CLIPS ─────────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/clips
router.post(
  '/:timelineId/clips',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndTimelineIdParams, body: schemas.createClip }),
  async (req: Request, res: Response) => {
    const { trackId, ...clipData } = req.body;

    // Verify track belongs to this timeline
    const track = await db.track.findFirst({
      where: { id: trackId, timelineId: req.params['timelineId'] },
    });
    if (!track) throw new NotFoundError('Track');

    const clip = await db.clip.create({
      data: { ...clipData, trackId },
      include: { effects: true, mediaAsset: { select: { id: true, name: true, type: true, duration: true } } },
    });

    // Update timeline duration if the new clip extends beyond it
    if (clip.endTime > 0) {
      await db.timeline.updateMany({
        where: { id: req.params['timelineId']!, duration: { lt: clip.endTime } },
        data: { duration: clip.endTime },
      });
    }

    res.status(201).json({ clip });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/clips/:clipId -- trim / move
router.patch(
  '/:timelineId/clips/:clipId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: timelineAndClipParams, body: schemas.trimClip }),
  async (req: Request, res: Response) => {
    const clip = await db.clip.update({
      where: { id: req.params['clipId'] },
      data: req.body,
      include: { effects: true },
    });
    res.json({ clip });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/clips/:clipId
router.delete('/:timelineId/clips/:clipId', requireProjectAccess('EDITOR'), validate(timelineAndClipParams, 'params'), async (req: Request, res: Response) => {
  await db.clip.delete({ where: { id: req.params['clipId'] } });
  res.status(204).send();
});

// POST split clip at timecode
router.post(
  '/:timelineId/clips/:clipId/split',
  requireProjectAccess('EDITOR'),
  validateAll({ params: timelineAndClipParams, body: schemas.splitClip }),
  async (req: Request, res: Response) => {
    const { splitTime } = req.body;

    const clip = await db.clip.findUnique({ where: { id: req.params['clipId'] } });
    if (!clip) throw new NotFoundError('Clip');
    if (splitTime <= clip.startTime || splitTime >= clip.endTime) {
      throw new BadRequestError('splitTime must be within clip range');
    }

    const duration = clip.endTime - clip.startTime;
    const splitRatio = (splitTime - clip.startTime) / duration;
    const midTrimPoint = clip.trimStart + splitRatio * (clip.endTime - clip.startTime - clip.trimEnd - clip.trimStart);

    const [updatedClip, newClip] = await db.$transaction([
      db.clip.update({ where: { id: clip.id }, data: { endTime: splitTime, trimEnd: midTrimPoint } }),
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
  validateAll({ params: timelineAndClipParams, body: schemas.createEffect }),
  async (req: Request, res: Response) => {
    const { type, params, sortOrder } = req.body;
    const effect = await db.clipEffect.create({
      data: { clipId: req.params['clipId'], type, params: params ?? {}, sortOrder: sortOrder ?? 0 },
    });
    res.status(201).json({ effect });
  }
);

// PATCH update effect
router.patch(
  '/:timelineId/clips/:clipId/effects/:effectId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: timelineClipAndEffectParams, body: schemas.updateEffect }),
  async (req: Request, res: Response) => {
    const effect = await db.clipEffect.update({
      where: { id: req.params['effectId'] },
      data: req.body,
    });
    res.json({ effect });
  }
);

// DELETE effect
router.delete(
  '/:timelineId/clips/:clipId/effects/:effectId',
  requireProjectAccess('EDITOR'),
  validate(timelineClipAndEffectParams, 'params'),
  async (req: Request, res: Response) => {
    await db.clipEffect.delete({ where: { id: req.params['effectId'] } });
    res.status(204).send();
  }
);

// ─── MARKERS ──────────────────────────────────────────────────────────────────

// POST /projects/:projectId/timelines/:timelineId/markers
router.post(
  '/:timelineId/markers',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndTimelineIdParams, body: schemas.createMarker }),
  async (req: Request, res: Response) => {
    const { time, label, color, type, notes } = req.body;
    const marker = await db.timelineMarker.create({
      data: { time, label, color, type, notes, timelineId: req.params['timelineId'], createdById: req.user!.id },
    });
    res.status(201).json({ marker });
  }
);

// PATCH /projects/:projectId/timelines/:timelineId/markers/:markerId
router.patch(
  '/:timelineId/markers/:markerId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: timelineAndMarkerParams, body: schemas.updateMarker }),
  async (req: Request, res: Response) => {
    const marker = await db.timelineMarker.update({
      where: { id: req.params['markerId'] },
      data: req.body,
    });
    res.json({ marker });
  }
);

// DELETE /projects/:projectId/timelines/:timelineId/markers/:markerId
router.delete('/:timelineId/markers/:markerId', requireProjectAccess('EDITOR'), validate(timelineAndMarkerParams, 'params'), async (req: Request, res: Response) => {
  await db.timelineMarker.delete({ where: { id: req.params['markerId'] } });
  res.status(204).send();
});

export default router;
