import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, InsufficientTokensError, BadRequestError } from '../../utils/errors';
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

// ─── POST /ai/jobs — create & queue job ────────────────────────────────────────
router.post('/jobs', validate(schemas.createAIJob), async (req: Request, res: Response) => {
  const { type, mediaAssetId, projectId, inputParams, priority } = req.body;
  const userId = req.user!.id;

  // Check token balance
  const cost = TOKEN_COSTS[type] ?? 10;
  const balance = await tokenService.getBalance(userId);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);

  // Reserve tokens
  await tokenService.debit(userId, cost, type.toLowerCase(), undefined);

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

  // Enqueue in background job queue
  await aiService.enqueue(job);

  res.status(202).json({ job, tokensDeducted: cost });
});

// ─── GET /ai/jobs — list user's jobs ──────────────────────────────────────────
router.get('/jobs', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortOrder } = req.query as any;
  const { type, status, projectId } = req.query as any;
  const skip = (page - 1) * limit;

  const where: any = {
    userId: req.user!.id,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
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
  const job = await db.aIJob.findUnique({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!job) throw new NotFoundError('AI Job');
  res.json({ job });
});

// ─── DELETE /ai/jobs/:id — cancel ─────────────────────────────────────────────
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  const job = await db.aIJob.findUnique({ where: { id: req.params.id, userId: req.user!.id } });
  if (!job) throw new NotFoundError('AI Job');
  if (!['QUEUED', 'RUNNING'].includes(job.status)) {
    throw new BadRequestError('Job cannot be cancelled in its current state');
  }

  await db.aIJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });

  // Refund tokens if still queued
  if (job.status === 'QUEUED') {
    await tokenService.credit(req.user!.id, job.tokensUsed, 'refund_cancelled_job', job.id);
  }

  res.json({ message: 'Job cancelled', refunded: job.status === 'QUEUED' ? job.tokensUsed : 0 });
});

// ─── POST /ai/transcribe — quick transcription shortcut ───────────────────────
router.post('/transcribe', async (req: Request, res: Response) => {
  const { mediaAssetId, language, diarize } = req.body;
  if (!mediaAssetId) throw new BadRequestError('mediaAssetId required');

  const asset = await db.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) throw new NotFoundError('Media asset');

  const cost = TOKEN_COSTS.TRANSCRIPTION;
  const balance = await tokenService.getBalance(req.user!.id);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);

  await tokenService.debit(req.user!.id, cost, 'transcription', mediaAssetId);

  const job = await db.aIJob.create({
    data: {
      type: 'TRANSCRIPTION',
      userId: req.user!.id,
      mediaAssetId,
      inputParams: { language: language ?? 'en', diarize: diarize ?? false },
      tokensUsed: cost,
      priority: 7,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── POST /ai/phrase-search — semantic search across bins ─────────────────────
router.post('/phrase-search', async (req: Request, res: Response) => {
  const { projectId, query, searchType } = req.body; // searchType: 'phonetic' | 'semantic' | 'visual'
  if (!projectId || !query) throw new BadRequestError('projectId and query required');

  const results = await aiService.phraseSearch({
    projectId,
    query,
    searchType: searchType ?? 'semantic',
    userId: req.user!.id,
  });

  res.json({ results });
});

// ─── POST /ai/script-sync — sync transcript to footage ────────────────────────
router.post('/script-sync', async (req: Request, res: Response) => {
  const { projectId, scriptText, mediaAssetIds } = req.body;
  if (!projectId || !scriptText) throw new BadRequestError('projectId and scriptText required');

  const cost = TOKEN_COSTS.SCRIPT_SYNC;
  const balance = await tokenService.getBalance(req.user!.id);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);

  await tokenService.debit(req.user!.id, cost, 'script_sync', projectId);

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

// ─── POST /ai/assembly — agentic first-pass assembly ──────────────────────────
router.post('/assembly', async (req: Request, res: Response) => {
  const { projectId, timelineId, prompt, role, mediaAssetIds } = req.body;
  if (!projectId) throw new BadRequestError('projectId required');

  const cost = TOKEN_COSTS.ASSEMBLY;
  const balance = await tokenService.getBalance(req.user!.id);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);

  await tokenService.debit(req.user!.id, cost, 'assembly', projectId);

  const job = await db.aIJob.create({
    data: {
      type: 'ASSEMBLY',
      userId: req.user!.id,
      projectId,
      inputParams: { timelineId, prompt, role: role ?? 'editor', mediaAssetIds },
      tokensUsed: cost,
      priority: 5,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── POST /ai/highlights — extract highlights ─────────────────────────────────
router.post('/highlights', async (req: Request, res: Response) => {
  const { mediaAssetId, projectId, criteria, maxDuration } = req.body;

  const cost = TOKEN_COSTS.HIGHLIGHTS;
  const balance = await tokenService.getBalance(req.user!.id);
  if (balance < cost) throw new InsufficientTokensError(cost, balance);

  await tokenService.debit(req.user!.id, cost, 'highlights', projectId ?? mediaAssetId);

  const job = await db.aIJob.create({
    data: {
      type: 'HIGHLIGHTS',
      userId: req.user!.id,
      projectId,
      mediaAssetId,
      inputParams: { criteria: criteria ?? 'action,emotion,key-moments', maxDuration: maxDuration ?? 90 },
      tokensUsed: cost,
      priority: 5,
    },
  });

  await aiService.enqueue(job);
  res.status(202).json({ job });
});

// ─── GET /ai/tokens — token balance ───────────────────────────────────────────
router.get('/tokens', async (req: Request, res: Response) => {
  const balance = await tokenService.getBalance(req.user!.id);
  const transactions = await db.tokenTransaction.findMany({
    where: { balance: { userId: req.user!.id } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ balance, transactions });
});

export default router;
