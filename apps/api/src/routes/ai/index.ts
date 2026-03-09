import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, InsufficientTokensError, BadRequestError, assertFound } from '../../utils/errors';
import { aiService } from '../../services/ai.service';
import { tokenService } from '../../services/token.service';

const router = Router();
router.use(authenticate);

// Token costs per job type
const TOKEN_COSTS: Record<string, number> = {
  TRANSCRIPTION: 10,
  ASSEMBLY: 50,
  PHRASE_SEARCH: 2,
  SMART_REFRAME: 20,
  VOICE_ISOLATION: 25,
  OBJECT_MASK: 30,
  AUTO_CAPTIONS: 15,
  HIGHLIGHTS: 40,
  COMPLIANCE_SCAN: 10,
  SCENE_DETECTION: 15,
  MUSIC_BEATS: 5,
  SCRIPT_SYNC: 30,
};

// ─── Helper: check and debit tokens ───────────────────────────────────────────
async function checkAndDebitTokens(userId: string, jobType: string, referenceId?: string): Promise<number> {
  const cost = TOKEN_COSTS[jobType] ?? 10;
  const balance = await tokenService.getBalance(userId);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);
  await tokenService.debit(userId, cost, jobType.toLowerCase(), referenceId);
  return cost;
}

// ─── POST /ai/jobs -- create & queue job ────────────────────────────────────────
router.post('/jobs', validate(schemas.createAIJob), async (req: Request, res: Response) => {
  const { type, mediaAssetId, projectId, inputParams, priority } = req.body;
  const userId = req.user!.id;

  // Verify referenced entities
  if (mediaAssetId) {
    const asset = await db.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new NotFoundError('Media asset');
  }
  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError('Project');
  }

  const cost = await checkAndDebitTokens(userId, type, projectId ?? mediaAssetId);

  const job = await db.aIJob.create({
    data: {
      type,
      userId,
      mediaAssetId,
      projectId,
      inputParams,
      priority,
      tokensUsed: cost,
      status: 'QUEUED',
    },
  });

  await aiService.enqueue(job);

  res.status(202).json({ job, tokensDeducted: cost });
});

// ─── GET /ai/jobs -- list user's jobs ──────────────────────────────────────────
router.get('/jobs', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortOrder } = req.query as any;
  const { type, status, projectId } = req.query as Record<string, string>;
  const skip = (page - 1) * limit;

  const where: any = {
    userId: req.user!.id,
    ...(type ? { type: type.toUpperCase() } : {}),
    ...(status ? { status: status.toUpperCase() } : {}),
    ...(projectId ? { projectId } : {}),
  };

  const [jobs, total] = await Promise.all([
    db.aIJob.findMany({ where, skip, take: limit, orderBy: { queuedAt: sortOrder } }),
    db.aIJob.count({ where }),
  ]);

  res.json({ jobs, pagination: paginate(total, page, limit) });
});

// ─── GET /ai/jobs/:id ─────────────────────────────────────────────────────────
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const job = await db.aIJob.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  assertFound(job, 'AI Job');
  res.json({ job });
});

// ─── DELETE /ai/jobs/:id -- cancel ─────────────────────────────────────────────
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  const job = await db.aIJob.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  assertFound(job, 'AI Job');

  if (!['QUEUED', 'RUNNING'].includes(job.status)) {
    throw new BadRequestError(`Job cannot be cancelled in "${job.status}" state`);
  }

  await db.aIJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });

  // Refund tokens if still queued (not yet consumed resources)
  let refunded = 0;
  if (job.status === 'QUEUED') {
    await tokenService.credit(req.user!.id, job.tokensUsed, 'refund_cancelled_job', job.id);
    refunded = job.tokensUsed;
  }

  res.json({ message: 'Job cancelled', refunded });
});

// ─── POST /ai/transcribe -- quick transcription shortcut ───────────────────────
router.post('/transcribe', validate(schemas.transcribe), async (req: Request, res: Response) => {
  const { mediaAssetId, language, diarize } = req.body;

  const asset = await db.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  assertFound(asset, 'Media asset');

  if (!['VIDEO', 'AUDIO'].includes(asset.type)) {
    throw new BadRequestError('Transcription is only supported for audio and video assets');
  }

  const cost = await checkAndDebitTokens(req.user!.id, 'TRANSCRIPTION', mediaAssetId);

  const job = await db.aIJob.create({
    data: {
      type: 'TRANSCRIPTION',
      userId: req.user!.id,
      mediaAssetId,
      inputParams: { language, diarize },
      tokensUsed: cost,
      priority: 7,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── POST /ai/phrase-search -- semantic search across bins ─────────────────────
router.post('/phrase-search', validate(schemas.phraseSearch), async (req: Request, res: Response) => {
  const { projectId, query, searchType } = req.body;

  // Verify project access
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user!.id } },
  });
  if (!member) throw new NotFoundError('Project');

  const results = await aiService.phraseSearch({
    projectId,
    query,
    searchType,
    userId: req.user!.id,
  });

  res.json({ results, query, searchType });
});

// ─── POST /ai/script-sync -- sync transcript to footage ────────────────────────
router.post('/script-sync', validate(schemas.scriptSync), async (req: Request, res: Response) => {
  const { projectId, scriptText, mediaAssetIds } = req.body;

  const cost = await checkAndDebitTokens(req.user!.id, 'SCRIPT_SYNC', projectId);

  const job = await db.aIJob.create({
    data: {
      type: 'SCRIPT_SYNC',
      userId: req.user!.id,
      projectId,
      inputParams: { scriptText, mediaAssetIds },
      tokensUsed: cost,
      priority: 6,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── POST /ai/assembly -- agentic first-pass assembly ──────────────────────────
router.post('/assembly', validate(schemas.assembly), async (req: Request, res: Response) => {
  const { projectId, timelineId, prompt, role, mediaAssetIds } = req.body;

  const cost = await checkAndDebitTokens(req.user!.id, 'ASSEMBLY', projectId);

  const job = await db.aIJob.create({
    data: {
      type: 'ASSEMBLY',
      userId: req.user!.id,
      projectId,
      inputParams: { timelineId, prompt, role, mediaAssetIds },
      tokensUsed: cost,
      priority: 5,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── POST /ai/highlights -- extract highlights ─────────────────────────────────
router.post('/highlights', validate(schemas.highlights), async (req: Request, res: Response) => {
  const { mediaAssetId, projectId, criteria, maxDuration } = req.body;

  if (!mediaAssetId && !projectId) {
    throw new BadRequestError('Either mediaAssetId or projectId is required');
  }

  const cost = await checkAndDebitTokens(req.user!.id, 'HIGHLIGHTS', projectId ?? mediaAssetId);

  const job = await db.aIJob.create({
    data: {
      type: 'HIGHLIGHTS',
      userId: req.user!.id,
      projectId,
      mediaAssetId,
      inputParams: { criteria: criteria ?? 'action,emotion,key-moments', maxDuration },
      tokensUsed: cost,
      priority: 5,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── GET /ai/tokens -- token balance ───────────────────────────────────────────
router.get('/tokens', async (req: Request, res: Response) => {
  const balance = await tokenService.getBalance(req.user!.id);
  const transactions = await tokenService.getTransactionHistory(req.user!.id, 20);
  res.json({ balance, transactions });
});

// ─── GET /ai/costs -- token cost reference ──────────────────────────────────────
router.get('/costs', async (_req: Request, res: Response) => {
  res.json({ costs: TOKEN_COSTS });
});

export default router;
