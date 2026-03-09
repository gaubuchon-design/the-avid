import { Router, Request, Response } from 'express';
import { renderFarmService } from '../../services/renderfarm.service';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const router = Router();

// ─── Workers ────────────────────────────────────────────────────────────────

// POST /workers — register a new render worker
router.post('/workers', async (req: Request, res: Response) => {
  const { hostname, ip, port, workerTypes, capabilities } = req.body;
  if (!hostname) throw new BadRequestError('hostname is required');

  const node = renderFarmService.registerWorker({
    hostname,
    ip: ip ?? req.ip ?? '0.0.0.0',
    port: port ?? 0,
    workerTypes: workerTypes ?? ['render'],
    capabilities,
  });

  res.status(201).json({ node });
});

// DELETE /workers/:nodeId — remove a worker
router.delete('/workers/:nodeId', async (req: Request, res: Response) => {
  const worker = renderFarmService.getWorker(req.params.nodeId);
  if (!worker) throw new NotFoundError('Worker node');

  renderFarmService.removeWorker(req.params.nodeId);
  res.status(204).send();
});

// GET /workers — list all workers
router.get('/workers', async (_req: Request, res: Response) => {
  const workers = renderFarmService.getWorkers();
  res.json({ workers });
});

// ─── Jobs ───────────────────────────────────────────────────────────────────

// POST /jobs — submit a new render job
router.post('/jobs', async (req: Request, res: Response) => {
  const { name, presetId, priority, sourceTimelineId, totalFrames, templateId, exportSettings, segmentCount } = req.body;
  if (!name) throw new BadRequestError('name is required');
  if (!presetId) throw new BadRequestError('presetId is required');
  if (!sourceTimelineId) throw new BadRequestError('sourceTimelineId is required');
  if (!totalFrames || totalFrames <= 0) throw new BadRequestError('totalFrames must be a positive number');

  const job = renderFarmService.submitJob({
    name,
    presetId,
    priority,
    sourceTimelineId,
    totalFrames,
    templateId,
    exportSettings,
    segmentCount,
  });

  res.status(201).json({ job });
});

// GET /jobs — list queued/active jobs
router.get('/jobs', async (_req: Request, res: Response) => {
  const jobs = renderFarmService.getJobs();
  res.json({ jobs });
});

// PUT /jobs/:jobId/cancel — cancel a job
router.put('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
  const job = renderFarmService.getJob(req.params.jobId);
  if (!job) throw new NotFoundError('Render job');

  renderFarmService.cancelJob(req.params.jobId);
  res.json({ status: 'cancelled', jobId: req.params.jobId });
});

// PUT /jobs/:jobId/pause — pause a job
router.put('/jobs/:jobId/pause', async (req: Request, res: Response) => {
  const job = renderFarmService.getJob(req.params.jobId);
  if (!job) throw new NotFoundError('Render job');

  renderFarmService.pauseJob(req.params.jobId);
  res.json({ status: 'paused', jobId: req.params.jobId });
});

// PUT /jobs/:jobId/resume — resume a paused job
router.put('/jobs/:jobId/resume', async (req: Request, res: Response) => {
  const job = renderFarmService.getJob(req.params.jobId);
  if (!job) throw new NotFoundError('Render job');

  renderFarmService.resumeJob(req.params.jobId);
  res.json({ status: 'resumed', jobId: req.params.jobId });
});

// ─── Queue ──────────────────────────────────────────────────────────────────

// PUT /queue/reorder — reorder a job in the queue
router.put('/queue/reorder', async (req: Request, res: Response) => {
  const { jobId, newIndex } = req.body;
  if (!jobId) throw new BadRequestError('jobId is required');
  if (newIndex === undefined || newIndex < 0) throw new BadRequestError('newIndex must be a non-negative integer');

  const job = renderFarmService.getJob(jobId);
  if (!job) throw new NotFoundError('Render job');

  // Reordering is achieved by adjusting the createdAt timestamp so the sort
  // order changes.  Get the sorted list, find the target position, and set
  // createdAt to slot just before the item currently at that position.
  const sorted = renderFarmService.getJobs();
  const clampedIndex = Math.min(newIndex, sorted.length - 1);

  if (clampedIndex <= 0) {
    job.createdAt = sorted[0] ? sorted[0].createdAt - 1 : Date.now();
  } else if (clampedIndex >= sorted.length - 1) {
    job.createdAt = sorted[sorted.length - 1].createdAt + 1;
  } else {
    const before = sorted[clampedIndex - 1];
    const after = sorted[clampedIndex];
    job.createdAt = Math.floor((before.createdAt + after.createdAt) / 2);
  }

  res.json({ status: 'reordered', jobId, newIndex: clampedIndex });
});

// ─── Install Script ─────────────────────────────────────────────────────────

// GET /install-script — generate a bash install script for render agents
router.get('/install-script', async (req: Request, res: Response) => {
  const host = (req.query.host as string) || req.get('host') || 'localhost:4000';
  const workerTypes = (req.query.workerTypes as string)?.split(',') ?? ['render'];

  const script = renderFarmService.generateInstallScript(host, workerTypes);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="avid-render-agent-install.sh"');
  res.send(script);
});

// ─── History ────────────────────────────────────────────────────────────────

// GET /history — completed job history
router.get('/history', async (_req: Request, res: Response) => {
  const history = renderFarmService.getHistory();
  res.json({ history });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

// GET /stats — farm statistics
router.get('/stats', async (_req: Request, res: Response) => {
  const stats = renderFarmService.getFarmStats();
  res.json({ stats });
});

export default router;
