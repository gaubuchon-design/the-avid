/**
 * @module PromptTemplates
 * @description System prompts and pre-built plan templates for the editing agent.
 *
 * Templates provide a reliable fallback when the Gemini API key is not
 * configured, ensuring the orchestrator can still produce deterministic plans
 * for common editing intents.
 */

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/**
 * Primary system prompt injected into every Gemini plan-generation request.
 * Describes the agent's role, capabilities, and constraints.
 */
export const SYSTEM_PROMPT = `You are an expert video editing assistant embedded in a professional non-linear editor (NLE).
Your role is to decompose a user's editing intent into a precise sequence of tool calls that the editor can execute.

Guidelines:
- Produce the MINIMUM number of steps required. Each step must map to exactly one tool.
- Prefer non-destructive operations (analysis, markers) before destructive edits (extract, split).
- Always analyse or detect before modifying (e.g., run detect_scene_changes before a split).
- Normalise audio AFTER making timeline changes, not before.
- When uncertain about parameters, prefer safe defaults (e.g., -40 dB silence threshold, 0.5 sensitivity).
- Provide a concise human-readable description for every step.
- Never hallucinate tool names — only use the tools provided in the function declarations.

Constraints:
- Maximum 10 steps per plan.
- Destructive tools (extract, lift, split_clip, overwrite) should appear later in the plan after analysis.
- Always include at least one non-destructive step (analysis, detection, search) before destructive edits.
- If the intent is ambiguous, produce a plan that analyses first and defers edits.

Output format:
Respond ONLY with function calls. Do not include any text outside of function calls.
Each function call represents one step in the execution plan, in order.`;

// ---------------------------------------------------------------------------
// Plan Template
// ---------------------------------------------------------------------------

/** A single step within a plan template. */
export interface PlanTemplateStep {
  /** Human-readable description. */
  readonly description: string;
  /** Tool to invoke. */
  readonly toolName: string;
  /** Default arguments for the tool. */
  readonly toolArgs: Record<string, unknown>;
}

/** A pre-built plan template matched by regex. */
export interface PlanTemplate {
  /** Unique template identifier. */
  readonly id: string;
  /** Human-readable template name. */
  readonly name: string;
  /** Regex pattern matched against the user intent. */
  readonly pattern: RegExp;
  /** Ordered steps to execute. */
  readonly steps: readonly PlanTemplateStep[];
  /** Estimated total token cost. */
  readonly estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// Pre-built Templates
// ---------------------------------------------------------------------------

/**
 * Map of intent patterns to pre-built plan templates.
 * Used as a deterministic fallback when no Gemini API key is available.
 */
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  // 1. Hero-shot teaser
  {
    id: 'hero-shot-teaser',
    name: 'Find every approved hero shot and build a 30-second teaser',
    pattern: /(?:find|search|get).*(?:hero|approved).*(?:build|create|make).*teaser/i,
    steps: [
      {
        description: 'Search bins for clips tagged as approved hero shots',
        toolName: 'find_similar_clips',
        toolArgs: { referenceClipId: 'hero_ref', similarity: 'visual', threshold: 0.7 },
      },
      {
        description: 'Analyse best hero shots and suggest optimal cut points',
        toolName: 'suggest_cuts',
        toolArgs: { clipId: 'hero_ref', style: 'action' },
      },
      {
        description: 'Generate a 30-second rough-cut assembly from hero footage',
        toolName: 'generate_rough_cut',
        toolArgs: { binId: 'approved_heroes', style: 'action', targetDurationSec: 30 },
      },
      {
        description: 'Auto colour-match all teaser clips to the first hero shot',
        toolName: 'auto_color_match',
        toolArgs: { referenceClipId: 'hero_001', targetClipIds: ['hero_002', 'hero_003', 'hero_004'] },
      },
      {
        description: 'Normalise audio to broadcast standard',
        toolName: 'normalize_audio',
        toolArgs: { trackId: 'a1', targetLufs: -23 },
      },
      {
        description: 'Add "Teaser Start" marker at frame 0',
        toolName: 'add_marker',
        toolArgs: { frame: 0, label: 'Teaser Start', color: '#f59e0b' },
      },
    ],
    estimatedTokens: 85,
  },

  // 2. Caption versions
  {
    id: 'caption-versions',
    name: 'Create Spanish and French caption versions',
    pattern: /(?:create|generate|make).*(?:spanish|french|caption|subtitle).*(?:version|translation)/i,
    steps: [
      {
        description: 'Analyse dialogue audio for transcription',
        toolName: 'analyze_audio',
        toolArgs: { trackId: 'a1' },
      },
      {
        description: 'Generate English word-level captions as a baseline',
        toolName: 'generate_captions',
        toolArgs: { trackId: 'a1', language: 'en', style: 'broadcast' },
      },
      {
        description: 'Generate Spanish caption version',
        toolName: 'generate_captions',
        toolArgs: { trackId: 'a1', language: 'es', style: 'broadcast' },
      },
      {
        description: 'Generate French caption version',
        toolName: 'generate_captions',
        toolArgs: { trackId: 'a1', language: 'fr', style: 'broadcast' },
      },
      {
        description: 'Place Spanish captions on subtitle track S1',
        toolName: 'splice_in',
        toolArgs: { trackId: 's1', clipId: 'captions_es', frame: 0 },
      },
      {
        description: 'Place French captions on subtitle track S2',
        toolName: 'splice_in',
        toolArgs: { trackId: 's2', clipId: 'captions_fr', frame: 0 },
      },
    ],
    estimatedTokens: 72,
  },

  // 3. Interview cleanup
  {
    id: 'interview-cleanup',
    name: 'Clean this interview and propose three temp music options',
    pattern: /(?:clean|fix|polish).*interview.*(?:music|temp|score)/i,
    steps: [
      {
        description: 'Analyse interview audio for loudness, peaks, and silence',
        toolName: 'analyze_audio',
        toolArgs: { trackId: 'a1' },
      },
      {
        description: 'Remove silence segments below -40 dB threshold',
        toolName: 'remove_silence',
        toolArgs: { trackId: 'a1', thresholdDb: -40, minDurationMs: 800 },
      },
      {
        description: 'Normalise dialogue levels to broadcast standard',
        toolName: 'normalize_audio',
        toolArgs: { trackId: 'a1', targetLufs: -23 },
      },
      {
        description: 'Detect scene/shot changes to identify interview segments',
        toolName: 'detect_scene_changes',
        toolArgs: { clipId: 'interview_main', sensitivity: 0.6 },
      },
      {
        description: 'Suggest cut points for interview pacing',
        toolName: 'suggest_cuts',
        toolArgs: { clipId: 'interview_main', style: 'interview' },
      },
      {
        description: 'Search for similar ambient/music clips as temp score candidates',
        toolName: 'find_similar_clips',
        toolArgs: { referenceClipId: 'music_ref', similarity: 'audio', threshold: 0.5 },
      },
    ],
    estimatedTokens: 68,
  },

  // 4. Remove silence
  {
    id: 'remove-silence',
    name: 'Remove silence from clips',
    pattern: /(?:remove|delete|strip|clean).*(?:silence|silent|quiet|dead\s*air)/i,
    steps: [
      {
        description: 'Analyse audio waveform on the primary audio track',
        toolName: 'analyze_audio',
        toolArgs: { trackId: 'a1' },
      },
      {
        description: 'Detect and remove silent segments below -40 dB',
        toolName: 'remove_silence',
        toolArgs: { trackId: 'a1', thresholdDb: -40, minDurationMs: 500 },
      },
      {
        description: 'Add markers at removal points for review',
        toolName: 'add_marker',
        toolArgs: { frame: 0, label: 'Silence removed', color: '#ef4444' },
      },
      {
        description: 'Normalise remaining audio to consistent levels',
        toolName: 'normalize_audio',
        toolArgs: { trackId: 'a1', targetLufs: -23 },
      },
    ],
    estimatedTokens: 42,
  },

  // 5. Rough cut
  {
    id: 'rough-cut',
    name: 'Generate a rough cut from selected clips',
    pattern: /(?:rough\s*cut|assembl|auto\s*edit|first\s*cut)/i,
    steps: [
      {
        description: 'Scan all media in the active bin',
        toolName: 'find_similar_clips',
        toolArgs: { referenceClipId: 'ref_001', similarity: 'both' },
      },
      {
        description: 'Analyse best takes by visual and audio quality',
        toolName: 'suggest_cuts',
        toolArgs: { clipId: 'ref_001', style: 'narrative' },
      },
      {
        description: 'Generate rough-cut timeline assembly',
        toolName: 'generate_rough_cut',
        toolArgs: { binId: 'b1', style: 'narrative', targetDurationSec: 180 },
      },
      {
        description: 'Normalise audio levels to broadcast standard (-23 LUFS)',
        toolName: 'normalize_audio',
        toolArgs: { trackId: 'a1', targetLufs: -23 },
      },
      {
        description: 'Add assembly start marker',
        toolName: 'add_marker',
        toolArgs: { frame: 0, label: 'Assembly Start', color: '#22c55e' },
      },
    ],
    estimatedTokens: 55,
  },

  // 6. Colour match
  {
    id: 'color-match',
    name: 'Auto colour-match clips',
    pattern: /(?:color|colour)\s*match|match\s*(?:color|colour|grade)/i,
    steps: [
      {
        description: 'Detect scene changes to identify distinct shots',
        toolName: 'detect_scene_changes',
        toolArgs: { clipId: 'c1', sensitivity: 0.5 },
      },
      {
        description: 'Auto colour-match all clips to the reference shot',
        toolName: 'auto_color_match',
        toolArgs: { referenceClipId: 'c1', targetClipIds: ['c2', 'c3', 'c4'] },
      },
      {
        description: 'Apply fine-tuning colour grade preset',
        toolName: 'apply_color_grade',
        toolArgs: { clipIds: ['c2', 'c3', 'c4'], preset: 'matched_gamma' },
      },
    ],
    estimatedTokens: 35,
  },

  // 7. Organise bins
  {
    id: 'organize-bins',
    name: 'Organise bins by content type',
    pattern: /(?:organis|organiz|sort|categori|tidy).*bin/i,
    steps: [
      {
        description: 'Scan media metadata across all bins',
        toolName: 'find_similar_clips',
        toolArgs: { referenceClipId: 'scan_all', similarity: 'both' },
      },
      {
        description: 'Create structured bin hierarchy',
        toolName: 'create_bin',
        toolArgs: { name: 'Organised', color: '#6d4cfa' },
      },
      {
        description: 'Auto-organise media by scene',
        toolName: 'auto_organize_bins',
        toolArgs: { strategy: 'scene', rootBinId: 'b1' },
      },
      {
        description: 'Tag clips with inferred metadata',
        toolName: 'set_clip_metadata',
        toolArgs: { clipId: 'batch_all', metadata: { organised: true, organisedAt: new Date().toISOString() } },
      },
    ],
    estimatedTokens: 40,
  },

  // 8. Social export
  {
    id: 'social-export',
    name: 'Export for social media platforms',
    pattern: /(?:export|publish|render).*(?:social|instagram|tiktok|youtube|twitter|x\.com|reel|short)/i,
    steps: [
      {
        description: 'Detect scene changes for smart reframing',
        toolName: 'detect_scene_changes',
        toolArgs: { clipId: 'c1', sensitivity: 0.5 },
      },
      {
        description: 'Auto-reframe sequence to 9:16 vertical for Instagram/TikTok',
        toolName: 'auto_reframe',
        toolArgs: { clipId: 'c1', targetAspect: '9:16' },
      },
      {
        description: 'Auto-reframe sequence to 1:1 square for social feeds',
        toolName: 'auto_reframe',
        toolArgs: { clipId: 'c1', targetAspect: '1:1' },
      },
      {
        description: 'Generate captions for accessibility',
        toolName: 'generate_captions',
        toolArgs: { trackId: 'a1', language: 'en', style: 'social' },
      },
      {
        description: 'Normalise audio for mobile playback (-16 LUFS)',
        toolName: 'normalize_audio',
        toolArgs: { trackId: 'a1', targetLufs: -16 },
      },
    ],
    estimatedTokens: 52,
  },
] as const;

/**
 * Find the first template whose pattern matches the given intent string.
 *
 * @param intent - The raw user intent string.
 * @returns The matching template, or `undefined` if none match.
 */
export function matchTemplate(intent: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((t) => t.pattern.test(intent));
}
