// ─── Creative Agent ──────────────────────────────────────────────────────────
// Marketing brief to video: brief parsing, video structure outline generation,
// bin/DAM search for matching footage, auto-assembly with brand kit, and
// caption generation.

import { generateId } from '../utils';
import type {
  CreativeBrief,
  VideoStructureOutline,
  VideoSection,
  SuggestedFootage,
  CreativeAgentJob,
  CreativeAgentStatus,
  BrandKit,
} from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const briefStore = new Map<string, CreativeBrief>();
const outlineStore = new Map<string, VideoStructureOutline>();
const jobStore = new Map<string, CreativeAgentJob>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Brief Management ────────────────────────────────────────────────────────

export function createBrief(
  params: Omit<CreativeBrief, 'id'>,
): CreativeBrief {
  const brief: CreativeBrief = {
    id: generateId(),
    ...clone(params),
  };
  briefStore.set(brief.id, clone(brief));
  return clone(brief);
}

export function getBrief(id: string): CreativeBrief | null {
  const brief = briefStore.get(id);
  return brief ? clone(brief) : null;
}

export function listBriefs(): CreativeBrief[] {
  return Array.from(briefStore.values()).map(clone);
}

// ─── Brief Parsing ───────────────────────────────────────────────────────────

export interface ParsedBrief {
  objective: string;
  audience: string;
  message: string;
  tone: string;
  requiredElements: string[];
  duration: number;
  platforms: string[];
  suggestedSections: VideoSection[];
}

/**
 * Parse a brief into structured components and suggest a video structure.
 * In production this would use an LLM. Here we use heuristics.
 */
export function parseBrief(brief: CreativeBrief): ParsedBrief {
  const sections = generateSections(brief);

  return {
    objective: brief.objective,
    audience: brief.audience,
    message: brief.message,
    tone: brief.tone,
    requiredElements: [...brief.requiredElements],
    duration: brief.duration,
    platforms: [...brief.platforms],
    suggestedSections: sections,
  };
}

// ─── Video Structure Generation ──────────────────────────────────────────────

function generateSections(brief: CreativeBrief): VideoSection[] {
  const duration = brief.duration;
  const sections: VideoSection[] = [];

  if (duration <= 6) {
    // Bumper: single hook
    sections.push({
      order: 1,
      label: 'Hook + CTA',
      description: 'Immediate visual hook with brand message and call to action.',
      duration,
      type: 'hook',
      suggestedAssetTags: ['hero', 'product', 'action'],
    });
  } else if (duration <= 15) {
    // Short-form
    sections.push(
      {
        order: 1,
        label: 'Hook',
        description: 'Attention-grabbing opening with the strongest visual.',
        duration: Math.min(3, duration * 0.2),
        type: 'hook',
        suggestedAssetTags: ['hero', 'action', 'attention'],
      },
      {
        order: 2,
        label: 'Message',
        description: `Core message: ${brief.message.slice(0, 60)}`,
        duration: duration * 0.5,
        type: 'body',
        suggestedAssetTags: ['product', 'lifestyle', 'benefit'],
      },
      {
        order: 3,
        label: 'CTA + End Card',
        description: 'Call to action with brand logo and end card.',
        duration: duration * 0.3,
        type: 'endcard',
        suggestedAssetTags: ['cta', 'logo', 'endcard'],
      },
    );
  } else if (duration <= 30) {
    // Standard spot
    sections.push(
      {
        order: 1,
        label: 'Hook',
        description: 'Opening hook that captures attention within the first 2-3 seconds.',
        duration: 3,
        type: 'hook',
        suggestedAssetTags: ['hero', 'action', 'emotion'],
      },
      {
        order: 2,
        label: 'Setup',
        description: 'Establish the problem or context for the audience.',
        duration: (duration - 8) * 0.35,
        type: 'setup',
        suggestedAssetTags: ['context', 'problem', 'relatable'],
      },
      {
        order: 3,
        label: 'Body',
        description: `Present the solution: ${brief.message.slice(0, 80)}`,
        duration: (duration - 8) * 0.45,
        type: 'body',
        suggestedAssetTags: ['product', 'benefit', 'demonstration'],
      },
      {
        order: 4,
        label: 'CTA',
        description: 'Clear call to action.',
        duration: 2,
        type: 'cta',
        suggestedAssetTags: ['cta', 'offer'],
      },
      {
        order: 5,
        label: 'End Card',
        description: 'Brand logo lockup with URL/hashtag.',
        duration: 3,
        type: 'endcard',
        suggestedAssetTags: ['logo', 'endcard', 'branding'],
      },
    );
  } else {
    // Long-form
    sections.push(
      {
        order: 1,
        label: 'Cold Open',
        description: 'Compelling opening scene or statement.',
        duration: Math.min(5, duration * 0.08),
        type: 'hook',
        suggestedAssetTags: ['hero', 'cinematic', 'attention'],
      },
      {
        order: 2,
        label: 'Setup',
        description: 'Introduce the story, problem, or context.',
        duration: duration * 0.2,
        type: 'setup',
        suggestedAssetTags: ['narrative', 'context', 'character'],
      },
      {
        order: 3,
        label: 'Body',
        description: `Core narrative: ${brief.message.slice(0, 100)}`,
        duration: duration * 0.5,
        type: 'body',
        suggestedAssetTags: ['product', 'story', 'benefit', 'demonstration'],
      },
      {
        order: 4,
        label: 'Call to Action',
        description: 'Drive the viewer to act.',
        duration: duration * 0.1,
        type: 'cta',
        suggestedAssetTags: ['cta', 'urgency', 'offer'],
      },
      {
        order: 5,
        label: 'End Card',
        description: 'Brand lockup, social handles, legal.',
        duration: duration * 0.12,
        type: 'endcard',
        suggestedAssetTags: ['logo', 'endcard', 'social', 'legal'],
      },
    );
  }

  return sections;
}

// ─── Outline Generation ──────────────────────────────────────────────────────

export function generateOutline(
  brief: CreativeBrief,
): VideoStructureOutline {
  const sections = generateSections(brief);

  const outline: VideoStructureOutline = {
    id: generateId(),
    briefId: brief.id,
    sections,
    estimatedDuration: sections.reduce((sum, s) => sum + s.duration, 0),
    suggestedMusic: ['upbeat-corporate', 'inspiring-ambient', 'modern-electronic'],
    suggestedFootage: sections.flatMap((section) =>
      section.suggestedAssetTags.map((tag) => ({
        tags: [tag],
        source: Math.random() > 0.5 ? 'bin' as const : 'dam' as const,
        confidence: 0.6 + Math.random() * 0.35,
      })),
    ),
  };

  outlineStore.set(outline.id, clone(outline));
  return clone(outline);
}

export function getOutline(id: string): VideoStructureOutline | null {
  const outline = outlineStore.get(id);
  return outline ? clone(outline) : null;
}

// ─── Footage Search (simulated) ──────────────────────────────────────────────

export interface FootageSearchResult {
  assetId: string;
  name: string;
  source: 'bin' | 'dam';
  matchScore: number;
  tags: string[];
}

/**
 * Search for footage matching the outline's suggested tags.
 * In production this queries both the local bin library and connected DAMs.
 */
export async function searchFootage(
  outline: VideoStructureOutline,
): Promise<FootageSearchResult[]> {
  await new Promise<void>((resolve) => setTimeout(resolve, 300 + Math.random() * 200));

  const results: FootageSearchResult[] = [];
  const seenTags = new Set<string>();

  for (const footage of outline.suggestedFootage) {
    const tag = footage.tags[0] ?? 'unknown';
    if (seenTags.has(tag)) continue;
    seenTags.add(tag);

    results.push({
      assetId: generateId(),
      name: `${tag}-footage-${Math.floor(Math.random() * 100)}`,
      source: footage.source,
      matchScore: footage.confidence,
      tags: [...footage.tags],
    });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ─── Auto-Assembly (simulated) ───────────────────────────────────────────────

/**
 * Auto-assemble a video from the outline using matched footage and brand kit.
 * In production this creates clips on the timeline and applies brand elements.
 */
export async function autoAssemble(
  outline: VideoStructureOutline,
  brandKit: BrandKit,
  footage: FootageSearchResult[],
): Promise<{ sequenceId: string; duration: number }> {
  await new Promise<void>((resolve) => setTimeout(resolve, 800 + Math.random() * 500));

  return {
    sequenceId: generateId(),
    duration: outline.estimatedDuration,
  };
}

// ─── Caption Generation (simulated) ──────────────────────────────────────────

export interface GeneratedCaption {
  startTime: number;
  endTime: number;
  text: string;
}

export async function generateCaptions(
  sequenceId: string,
  durationSeconds: number,
): Promise<GeneratedCaption[]> {
  await new Promise<void>((resolve) => setTimeout(resolve, 400));

  const captions: GeneratedCaption[] = [];
  let time = 0;
  let index = 0;

  while (time < durationSeconds) {
    const segDuration = 2 + Math.random() * 3;
    captions.push({
      startTime: time,
      endTime: Math.min(time + segDuration, durationSeconds),
      text: `Caption segment ${index + 1}`,
    });
    time += segDuration + 0.3; // gap between captions
    index++;
  }

  return captions;
}

// ─── Full Creative Pipeline ──────────────────────────────────────────────────

export interface CreativePipelineOptions {
  brief: CreativeBrief;
  brandKit: BrandKit;
}

/**
 * Run the complete creative agent pipeline: parse brief -> generate outline ->
 * search footage -> auto-assemble -> generate captions.
 */
export async function runCreativePipeline(
  options: CreativePipelineOptions,
): Promise<CreativeAgentJob> {
  const { brief, brandKit } = options;
  const job: CreativeAgentJob = {
    id: generateId(),
    briefId: brief.id,
    status: 'parsing-brief',
    progress: 0,
    createdAt: now(),
  };
  jobStore.set(job.id, clone(job));

  try {
    // Step 1: Parse brief
    updateJobStatus(job, 'parsing-brief', 10);
    parseBrief(brief);

    // Step 2: Generate outline
    updateJobStatus(job, 'generating-outline', 25);
    const outline = generateOutline(brief);
    job.outline = outline;

    // Step 3: Search footage
    updateJobStatus(job, 'searching-footage', 40);
    const footage = await searchFootage(outline);

    // Step 4: Auto-assemble
    updateJobStatus(job, 'assembling', 65);
    const assembly = await autoAssemble(outline, brandKit, footage);
    job.resultSequenceId = assembly.sequenceId;

    // Step 5: Generate captions
    updateJobStatus(job, 'generating-captions', 85);
    await generateCaptions(assembly.sequenceId, assembly.duration);

    // Complete
    updateJobStatus(job, 'complete', 100);
    job.completedAt = now();
    jobStore.set(job.id, clone(job));

    return clone(job);
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Unknown error';
    jobStore.set(job.id, clone(job));
    return clone(job);
  }
}

function updateJobStatus(
  job: CreativeAgentJob,
  status: CreativeAgentStatus,
  progress: number,
): void {
  job.status = status;
  job.progress = progress;
  jobStore.set(job.id, clone(job));
}

// ─── Job access ──────────────────────────────────────────────────────────────

export function getCreativeJob(id: string): CreativeAgentJob | null {
  const job = jobStore.get(id);
  return job ? clone(job) : null;
}

export function listCreativeJobs(): CreativeAgentJob[] {
  return Array.from(jobStore.values())
    .map(clone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export function seedDemoBrief(brandKitId: string): CreativeBrief {
  return createBrief({
    objective: 'Drive awareness for the Q1 product launch.',
    audience: 'Professionals aged 25-45 interested in productivity tools.',
    message: 'Acme Pro helps you do more in less time. Start your free trial today.',
    tone: 'Confident, modern, aspirational.',
    requiredElements: ['product-demo', 'customer-testimonial', 'brand-logo', 'cta-button'],
    duration: 30,
    platforms: ['META', 'YOUTUBE', 'LINKEDIN'],
    brandKitId,
  });
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetCreativeStore(): void {
  briefStore.clear();
  outlineStore.clear();
  jobStore.clear();
}
