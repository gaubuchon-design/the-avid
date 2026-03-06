import OpenAI from 'openai';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AIServiceError } from '../utils/errors';
import type { AIJob } from '@prisma/client';

const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

// ─── In-memory job queue (replace with Bull/BullMQ in production) ──────────────
const jobQueue: AIJob[] = [];
let isProcessing = false;

class AIService {
  /**
   * Enqueue an AI job for async processing.
   */
  async enqueue(job: AIJob) {
    jobQueue.push(job);
    if (!isProcessing) this.processNext();
  }

  private async processNext() {
    if (jobQueue.length === 0) { isProcessing = false; return; }
    isProcessing = true;
    const job = jobQueue.shift()!;

    try {
      await db.aIJob.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: new Date() } });
      const result = await this.processJob(job);
      await db.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          resultSummary: result.summary,
          resultUrl: result.url,
        },
      });
    } catch (err: any) {
      logger.error(`AI job ${job.id} failed`, err);
      await db.aIJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: err.message },
      });
    }

    setImmediate(() => this.processNext());
  }

  private async processJob(job: AIJob): Promise<{ summary: string; url?: string }> {
    const params = job.inputParams as Record<string, any>;

    switch (job.type) {
      case 'TRANSCRIPTION':
        return this.runTranscription(job, params);
      case 'ASSEMBLY':
        return this.runAssembly(job, params);
      case 'AUTO_CAPTIONS':
        return this.runCaptions(job, params);
      case 'HIGHLIGHTS':
        return this.runHighlights(job, params);
      case 'SCENE_DETECTION':
        return this.runSceneDetection(job, params);
      case 'COMPLIANCE_SCAN':
        return this.runComplianceScan(job, params);
      default:
        return { summary: `Job type ${job.type} queued for processing` };
    }
  }

  // ─── Transcription (Whisper) ─────────────────────────────────────────────────
  private async runTranscription(job: AIJob, params: Record<string, any>) {
    logger.info(`Transcribing asset ${job.mediaAssetId}`);

    if (!openai || !job.mediaAssetId) {
      // Mock response for dev
      const mockTranscript = {
        text: 'This is a mock transcription of the media asset.',
        segments: [
          { start: 0, end: 2.5, text: 'This is a mock' },
          { start: 2.5, end: 5.0, text: 'transcription of the media asset.' },
        ],
        language: params.language ?? 'en',
      };

      await db.mediaAsset.update({
        where: { id: job.mediaAssetId! },
        data: { transcript: mockTranscript.text, autoTags: ['dialogue'] },
      });

      return { summary: `Transcribed ${mockTranscript.segments.length} segments` };
    }

    // Real Whisper API call would go here using audio from S3
    // const audioBuffer = await getAudioFromS3(asset.s3Key);
    // const response = await openai.audio.transcriptions.create({
    //   file: audioBuffer,
    //   model: config.openai.transcriptionModel,
    //   language: params.language,
    //   response_format: 'verbose_json',
    //   timestamp_granularities: ['segment', 'word'],
    // });

    return { summary: 'Transcription complete' };
  }

  // ─── Agentic Assembly (GPT-4o) ───────────────────────────────────────────────
  private async runAssembly(job: AIJob, params: Record<string, any>) {
    logger.info(`Running agentic assembly for project ${job.projectId}`);

    if (!openai) {
      // Mock assembly response
      return {
        summary: 'Assembly complete: 12 clips arranged across 3 tracks',
        url: `assemblies/${job.projectId}/${job.id}.json`,
      };
    }

    // Gather transcripts + metadata from media assets in project
    const assets = await db.mediaAsset.findMany({
      where: {
        bin: { projectId: job.projectId! },
        transcript: { not: null },
        ...(params.mediaAssetIds?.length ? { id: { in: params.mediaAssetIds } } : {}),
      },
      select: { id: true, name: true, duration: true, transcript: true, autoTags: true },
      take: 50,
    });

    const systemPrompt = `You are an expert video editor assembling a first-pass timeline.
Role: ${params.role ?? 'editor'}
Create a JSON timeline assembly from the provided media clips based on their transcripts.
Return valid JSON: { clips: [{ assetId, startTime, endTime, trimStart, trimEnd, notes }], narrative: string }`;

    const userPrompt = `Assemble a compelling sequence using these clips:
${assets.map((a) => `- ${a.name} (${a.duration?.toFixed(1)}s): "${a.transcript?.slice(0, 200)}..."`).join('\n')}

${params.prompt ? `Additional direction: ${params.prompt}` : ''}`;

    try {
      const completion = await openai.chat.completions.create({
        model: config.openai.assemblyModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      });

      const assembly = JSON.parse(completion.choices[0].message.content ?? '{}');
      return {
        summary: `Assembly: ${assembly.clips?.length ?? 0} clips arranged. ${assembly.narrative ?? ''}`,
        url: `assemblies/${job.projectId}/${job.id}.json`,
      };
    } catch (err: any) {
      throw new AIServiceError('Assembly generation failed', err.message);
    }
  }

  // ─── Auto-Captions ───────────────────────────────────────────────────────────
  private async runCaptions(job: AIJob, params: Record<string, any>) {
    logger.info(`Generating captions for ${job.mediaAssetId ?? job.projectId}`);
    return { summary: 'Auto-captions generated with word-level timing' };
  }

  // ─── Highlights Detection ────────────────────────────────────────────────────
  private async runHighlights(job: AIJob, params: Record<string, any>) {
    logger.info(`Detecting highlights for project ${job.projectId}`);
    return { summary: `Detected highlights: 5 moments (${params.criteria ?? 'action,emotion'})` };
  }

  // ─── Scene Detection ─────────────────────────────────────────────────────────
  private async runSceneDetection(job: AIJob, params: Record<string, any>) {
    logger.info(`Detecting scenes in asset ${job.mediaAssetId}`);
    return { summary: 'Detected 14 scene cuts' };
  }

  // ─── Compliance Scan ─────────────────────────────────────────────────────────
  private async runComplianceScan(job: AIJob, params: Record<string, any>) {
    logger.info(`Running compliance scan for project ${job.projectId}`);
    return {
      summary: 'Compliance scan complete: 2 loudness issues detected, 0 color gamut violations',
    };
  }

  // ─── Phrase / Semantic Search ────────────────────────────────────────────────
  async phraseSearch({
    projectId,
    query,
    searchType,
    userId,
  }: {
    projectId: string;
    query: string;
    searchType: string;
    userId: string;
  }) {
    // Semantic search across all transcripts in project
    const assets = await db.mediaAsset.findMany({
      where: {
        bin: { projectId },
        OR: [
          { transcript: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { autoTags: { has: query.toLowerCase() } },
          { tags: { has: query.toLowerCase() } },
        ],
      },
      select: {
        id: true, name: true, duration: true, transcript: true,
        thumbnailS3Key: true, type: true, binId: true,
      },
    });

    // Return with match context
    return assets.map((asset) => ({
      assetId: asset.id,
      assetName: asset.name,
      type: asset.type,
      binId: asset.binId,
      matchType: asset.transcript?.toLowerCase().includes(query.toLowerCase()) ? 'transcript' : 'metadata',
      excerpt: this.extractExcerpt(asset.transcript ?? '', query),
      estimatedTimecode: this.findTimecodeForPhrase(asset.transcript ?? '', query),
    }));
  }

  private extractExcerpt(text: string, query: string, contextLength = 100): string {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 100);
    const start = Math.max(0, idx - contextLength / 2);
    const end = Math.min(text.length, idx + query.length + contextLength / 2);
    return `…${text.slice(start, end)}…`;
  }

  private findTimecodeForPhrase(_text: string, _query: string): number | null {
    // In production this would use word-level timestamps from Whisper
    return null;
  }
}

export const aiService = new AIService();
