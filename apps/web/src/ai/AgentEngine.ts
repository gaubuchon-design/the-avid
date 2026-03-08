// ─── Agentic Engine ─────────────────────────────────────────────────────────
// Plan-and-execute agent that decomposes user intents into tool-call steps.
// Each plan enters a "preview" state so the user can approve/cancel individual
// steps before they are executed against the editor store.

import { geminiClient, type FunctionTool } from './GeminiClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentStep {
  id: string;
  description: string;
  toolName: string;
  toolArgs: Record<string, any>;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  result?: string;
}

export interface AgentPlan {
  id: string;
  intent: string;
  steps: AgentStep[];
  status: 'planning' | 'preview' | 'executing' | 'completed' | 'failed';
  tokensUsed: number;
}

type Subscriber = (plan: AgentPlan) => void;

// ─── Tool definitions (20+) ────────────────────────────────────────────────

const TOOLS: FunctionTool[] = [
  {
    name: 'splice_in',
    description: 'Insert a clip into a track at a specific frame, pushing existing clips to the right.',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' }, frame: { type: 'number' } }, required: ['trackId', 'clipId', 'frame'] },
  },
  {
    name: 'overwrite',
    description: 'Overwrite a region on a track with a clip, replacing whatever is underneath.',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' }, startFrame: { type: 'number' }, endFrame: { type: 'number' } }, required: ['trackId', 'clipId', 'startFrame'] },
  },
  {
    name: 'lift',
    description: 'Remove a clip from the timeline leaving a gap (no ripple).',
    parameters: { type: 'object', properties: { clipId: { type: 'string' } }, required: ['clipId'] },
  },
  {
    name: 'extract',
    description: 'Remove a clip from the timeline and close the gap (ripple delete).',
    parameters: { type: 'object', properties: { clipId: { type: 'string' } }, required: ['clipId'] },
  },
  {
    name: 'ripple_trim',
    description: 'Trim a clip edge and ripple-shift all downstream clips.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, side: { type: 'string', enum: ['left', 'right'] }, frameDelta: { type: 'number' } }, required: ['clipId', 'side', 'frameDelta'] },
  },
  {
    name: 'split_clip',
    description: 'Split a clip into two at the given frame.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, frame: { type: 'number' } }, required: ['clipId', 'frame'] },
  },
  {
    name: 'set_clip_speed',
    description: 'Change the playback speed of a clip (1.0 = normal, 0.5 = half, 2.0 = double).',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, speed: { type: 'number' } }, required: ['clipId', 'speed'] },
  },
  {
    name: 'add_marker',
    description: 'Add a marker to the timeline at a specific frame.',
    parameters: { type: 'object', properties: { frame: { type: 'number' }, label: { type: 'string' }, color: { type: 'string' } }, required: ['frame', 'label'] },
  },
  {
    name: 'move_clip_to_bin',
    description: 'Move a clip reference to a different bin.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, binId: { type: 'string' } }, required: ['clipId', 'binId'] },
  },
  {
    name: 'set_clip_metadata',
    description: 'Set metadata key-value pairs on a clip (tags, scene, take, etc.).',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, metadata: { type: 'object' } }, required: ['clipId', 'metadata'] },
  },
  {
    name: 'apply_color_grade',
    description: 'Apply a color grading LUT or preset to one or more clips.',
    parameters: { type: 'object', properties: { clipIds: { type: 'array', items: { type: 'string' } }, preset: { type: 'string' } }, required: ['clipIds', 'preset'] },
  },
  {
    name: 'adjust_audio_level',
    description: 'Set the audio level (dB) for a clip or track.',
    parameters: { type: 'object', properties: { targetId: { type: 'string' }, targetType: { type: 'string', enum: ['clip', 'track'] }, levelDb: { type: 'number' } }, required: ['targetId', 'targetType', 'levelDb'] },
  },
  {
    name: 'generate_captions',
    description: 'Generate word-level captions from an audio track.',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, language: { type: 'string' }, style: { type: 'string' } }, required: ['trackId', 'language'] },
  },
  {
    name: 'create_bin',
    description: 'Create a new bin (folder) in the media browser.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, parentBinId: { type: 'string' }, color: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'auto_organize_bins',
    description: 'Automatically organize media in bins by scene, type, or date.',
    parameters: { type: 'object', properties: { strategy: { type: 'string', enum: ['scene', 'type', 'date', 'camera'] }, rootBinId: { type: 'string' } }, required: ['strategy'] },
  },
  {
    name: 'find_similar_clips',
    description: 'Find clips visually or audibly similar to a reference clip.',
    parameters: { type: 'object', properties: { referenceClipId: { type: 'string' }, similarity: { type: 'string', enum: ['visual', 'audio', 'both'] }, threshold: { type: 'number' } }, required: ['referenceClipId'] },
  },
  {
    name: 'suggest_cuts',
    description: 'Analyze a clip and suggest optimal cut points based on content.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, style: { type: 'string', enum: ['narrative', 'action', 'documentary', 'interview'] } }, required: ['clipId'] },
  },
  {
    name: 'remove_silence',
    description: 'Detect and remove silent segments from an audio track.',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, thresholdDb: { type: 'number' }, minDurationMs: { type: 'number' } }, required: ['trackId'] },
  },
  {
    name: 'auto_color_match',
    description: 'Match the color grading of target clips to a reference clip.',
    parameters: { type: 'object', properties: { referenceClipId: { type: 'string' }, targetClipIds: { type: 'array', items: { type: 'string' } } }, required: ['referenceClipId', 'targetClipIds'] },
  },
  {
    name: 'generate_rough_cut',
    description: 'Generate a rough-cut assembly from bin footage using AI analysis.',
    parameters: { type: 'object', properties: { binId: { type: 'string' }, style: { type: 'string' }, targetDurationSec: { type: 'number' } }, required: ['binId'] },
  },
  {
    name: 'analyze_audio',
    description: 'Analyze audio waveform for loudness, peaks, and silence regions.',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' } }, required: ['trackId'] },
  },
  {
    name: 'detect_scene_changes',
    description: 'Detect scene/shot changes in a video clip based on visual analysis.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, sensitivity: { type: 'number' } }, required: ['clipId'] },
  },
  {
    name: 'normalize_audio',
    description: 'Normalize audio levels to broadcast standard (-23 LUFS).',
    parameters: { type: 'object', properties: { trackId: { type: 'string' }, targetLufs: { type: 'number' } }, required: ['trackId'] },
  },
  {
    name: 'auto_reframe',
    description: 'Automatically reframe a clip for a different aspect ratio.',
    parameters: { type: 'object', properties: { clipId: { type: 'string' }, targetAspect: { type: 'string' } }, required: ['clipId', 'targetAspect'] },
  },
];

// ─── Intent -> Plan mapping ─────────────────────────────────────────────────

interface PlanTemplate {
  match: (msg: string) => boolean;
  plan: (msg: string) => Omit<AgentStep, 'id' | 'status'>[];
}

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    match: (m) => /remove\s+(all\s+)?silence/i.test(m) || /delete\s+silent/i.test(m),
    plan: () => [
      { description: 'Analyze audio waveform on track A1', toolName: 'analyze_audio', toolArgs: { trackId: 't3' } },
      { description: 'Identify silence segments below -40dB threshold', toolName: 'remove_silence', toolArgs: { trackId: 't3', thresholdDb: -40, minDurationMs: 500 } },
      { description: 'Mark segments for removal', toolName: 'add_marker', toolArgs: { frame: 0, label: 'Silence removal region', color: '#ef4444' } },
      { description: 'Execute ripple delete on silent segments', toolName: 'extract', toolArgs: { clipId: 'silence_segments' } },
    ],
  },
  {
    match: (m) => /color\s*match/i.test(m) || /match\s*color/i.test(m) || /color\s*grade/i.test(m),
    plan: () => [
      { description: 'Analyze reference clip color profile (INT. OFFICE)', toolName: 'detect_scene_changes', toolArgs: { clipId: 'c1', sensitivity: 0.5 } },
      { description: 'Apply auto color match to all V1 clips', toolName: 'auto_color_match', toolArgs: { referenceClipId: 'c1', targetClipIds: ['c2', 'c3'] } },
      { description: 'Fine-tune gamma on matched clips', toolName: 'apply_color_grade', toolArgs: { clipIds: ['c2', 'c3'], preset: 'matched_gamma' } },
    ],
  },
  {
    match: (m) => /rough\s*cut/i.test(m) || /assembl/i.test(m),
    plan: () => [
      { description: 'Scan all media in Rushes bin', toolName: 'find_similar_clips', toolArgs: { referenceClipId: 'a1', similarity: 'both' } },
      { description: 'Analyze best takes by quality score', toolName: 'suggest_cuts', toolArgs: { clipId: 'a1', style: 'narrative' } },
      { description: 'Generate rough-cut timeline assembly', toolName: 'generate_rough_cut', toolArgs: { binId: 'b1', style: 'narrative', targetDurationSec: 180 } },
      { description: 'Normalize audio levels to broadcast standard', toolName: 'normalize_audio', toolArgs: { trackId: 't3', targetLufs: -23 } },
      { description: 'Add scene markers to timeline', toolName: 'add_marker', toolArgs: { frame: 0, label: 'Assembly Start', color: '#22c55e' } },
    ],
  },
  {
    match: (m) => /caption/i.test(m) || /subtitle/i.test(m),
    plan: () => [
      { description: 'Transcribe dialogue track audio', toolName: 'analyze_audio', toolArgs: { trackId: 't3' } },
      { description: 'Generate word-level captions', toolName: 'generate_captions', toolArgs: { trackId: 't3', language: 'en', style: 'broadcast' } },
      { description: 'Place caption clips on subtitle track', toolName: 'splice_in', toolArgs: { trackId: 't6', clipId: 'captions_generated', frame: 0 } },
    ],
  },
  {
    match: (m) => /trim/i.test(m),
    plan: () => [
      { description: 'Identify clip to trim', toolName: 'detect_scene_changes', toolArgs: { clipId: 'c1', sensitivity: 0.7 } },
      { description: 'Execute ripple trim on clip', toolName: 'ripple_trim', toolArgs: { clipId: 'c1', side: 'right', frameDelta: -24 } },
    ],
  },
  {
    match: (m) => /split/i.test(m) || /cut\s+at/i.test(m),
    plan: () => [
      { description: 'Split clip at playhead', toolName: 'split_clip', toolArgs: { clipId: 'c1', frame: 204 } },
    ],
  },
  {
    match: (m) => /organiz/i.test(m) || /sort\s+bin/i.test(m),
    plan: () => [
      { description: 'Scan media metadata across all bins', toolName: 'find_similar_clips', toolArgs: { referenceClipId: 'a1', similarity: 'both' } },
      { description: 'Create organized bin structure', toolName: 'create_bin', toolArgs: { name: 'Organized', color: '#6d4cfa' } },
      { description: 'Auto-organize media by scene', toolName: 'auto_organize_bins', toolArgs: { strategy: 'scene', rootBinId: 'b1' } },
    ],
  },
  {
    match: (m) => /reframe/i.test(m) || /aspect\s*ratio/i.test(m),
    plan: () => [
      { description: 'Analyze clip content for subject tracking', toolName: 'detect_scene_changes', toolArgs: { clipId: 'c1', sensitivity: 0.5 } },
      { description: 'Auto-reframe clip to 9:16 vertical', toolName: 'auto_reframe', toolArgs: { clipId: 'c1', targetAspect: '9:16' } },
    ],
  },
];

// ─── Agent Engine ───────────────────────────────────────────────────────────

let planCounter = 0;
let stepCounter = 0;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AgentEngine {
  private tools: FunctionTool[] = TOOLS;
  private plans: Map<string, AgentPlan> = new Map();
  private subscribers: Set<Subscriber> = new Set();

  /**
   * Parse a user message and generate an execution plan.
   * The plan enters "preview" status so the user can inspect and approve.
   */
  async executeUserIntent(message: string): Promise<AgentPlan> {
    const planId = uid('plan');

    // Start planning
    const plan: AgentPlan = {
      id: planId,
      intent: message,
      steps: [],
      status: 'planning',
      tokensUsed: 0,
    };
    this.plans.set(planId, plan);
    this.notify(plan);

    // Simulate planning delay
    await new Promise(r => setTimeout(r, 100));

    // Try to match a template
    const template = PLAN_TEMPLATES.find(t => t.match(message));

    if (template) {
      const rawSteps = template.plan(message);
      plan.steps = rawSteps.map(s => ({
        ...s,
        id: uid('step'),
        status: 'pending' as const,
      }));
    } else {
      // Use Gemini to attempt to understand the intent
      const response = await geminiClient.chat(
        [{ role: 'user', parts: [{ text: message }] }],
        this.tools,
      );
      plan.tokensUsed += response.tokensUsed;

      if (response.functionCalls && response.functionCalls.length > 0) {
        plan.steps = response.functionCalls.map(fc => ({
          id: uid('step'),
          description: `Execute ${fc.name}`,
          toolName: fc.name,
          toolArgs: fc.args,
          status: 'pending' as const,
        }));
      } else {
        // Generic fallback plan
        plan.steps = [
          {
            id: uid('step'),
            description: `Analyze request: "${message}"`,
            toolName: 'detect_scene_changes',
            toolArgs: { clipId: 'c1', sensitivity: 0.5 },
            status: 'pending',
          },
          {
            id: uid('step'),
            description: 'Prepare edit operations based on analysis',
            toolName: 'suggest_cuts',
            toolArgs: { clipId: 'c1', style: 'narrative' },
            status: 'pending',
          },
        ];
      }
    }

    plan.status = 'preview';
    plan.tokensUsed += 15 + Math.floor(Math.random() * 10);
    this.notify(plan);

    return plan;
  }

  /**
   * Approve and execute all pending steps in a plan.
   */
  async approvePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== 'preview') return;

    plan.status = 'executing';
    plan.steps.forEach(s => {
      if (s.status === 'pending') s.status = 'approved';
    });
    this.notify(plan);

    // Execute each approved step sequentially
    for (const step of plan.steps) {
      if (step.status === 'cancelled') continue;
      if (step.status !== 'approved') continue;

      step.status = 'executing';
      this.notify(plan);

      // Simulate execution
      await new Promise(r => setTimeout(r, 150 + Math.random() * 200));

      step.status = 'completed';
      step.result = `${step.toolName} executed successfully`;
      plan.tokensUsed += 5 + Math.floor(Math.random() * 8);
      this.notify(plan);
    }

    plan.status = 'completed';
    this.notify(plan);
  }

  /**
   * Cancel an entire plan.
   */
  cancelPlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) return;

    plan.status = 'failed';
    plan.steps.forEach(s => {
      if (s.status === 'pending' || s.status === 'approved') {
        s.status = 'cancelled';
      }
    });
    this.notify(plan);
  }

  /**
   * Approve a single step within a plan.
   */
  approveStep(planId: string, stepId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) return;
    const step = plan.steps.find(s => s.id === stepId);
    if (step && step.status === 'pending') {
      step.status = 'approved';
      this.notify(plan);
    }
  }

  /**
   * Cancel a single step within a plan.
   */
  cancelStep(planId: string, stepId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) return;
    const step = plan.steps.find(s => s.id === stepId);
    if (step && (step.status === 'pending' || step.status === 'approved')) {
      step.status = 'cancelled';
      this.notify(plan);
    }
  }

  /**
   * Get the list of available tools.
   */
  getTools(): FunctionTool[] {
    return [...this.tools];
  }

  /**
   * Subscribe to plan updates. Returns an unsubscribe function.
   */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => { this.subscribers.delete(cb); };
  }

  private notify(plan: AgentPlan): void {
    // Create a deep-ish copy so subscribers get a snapshot
    const snapshot: AgentPlan = {
      ...plan,
      steps: plan.steps.map(s => ({ ...s })),
    };
    this.subscribers.forEach(cb => cb(snapshot));
  }
}

export const agentEngine = new AgentEngine();
