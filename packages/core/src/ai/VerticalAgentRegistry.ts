// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Vertical Agent Registry (AI-01)
//  Registry of specialized AI agents for different editing verticals.
//  Each agent has domain-specific system prompts, function tools,
//  and auto-selection based on workspace preset.
// ═══════════════════════════════════════════════════════════════════════════

import type { ProjectTemplate } from '../project-library';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentVertical = 'film' | 'commercial' | 'documentary' | 'sports' | 'podcast' | 'social' | 'music-video' | 'news';

export interface AgentToolDefinition {
  name: string;
  description: string;
  category: 'editing' | 'audio' | 'color' | 'effects' | 'export' | 'ai' | 'collaboration' | 'accessibility';
  parameters: AgentToolParameter[];
  requiresConfirmation: boolean;
  tokenCost: number;
}

export interface AgentToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface VerticalAgentDefinition {
  id: string;
  vertical: AgentVertical;
  name: string;
  description: string;
  systemPrompt: string;
  baseToolCount: number;
  domainTools: AgentToolDefinition[];
  templateMapping: ProjectTemplate[];
  icon: string;
  color: string;
  capabilities: string[];
  contextWindowTokens: number;
  maxOutputTokens: number;
}

export interface AgentSelectionResult {
  agentId: string;
  vertical: AgentVertical;
  confidence: number;
  reason: string;
  alternativeAgents: Array<{ agentId: string; confidence: number }>;
}

// ─── Base Tools (shared by all agents) ─────────────────────────────────────

const BASE_TOOLS: AgentToolDefinition[] = [
  // Editing tools
  { name: 'trim_clip', description: 'Trim a clip to specified in/out points', category: 'editing', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'startTime', type: 'number', description: 'New start time', required: false }, { name: 'endTime', type: 'number', description: 'New end time', required: false }], requiresConfirmation: false, tokenCost: 2 },
  { name: 'split_clip', description: 'Split a clip at the playhead position', category: 'editing', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'time', type: 'number', description: 'Split point in seconds', required: true }], requiresConfirmation: false, tokenCost: 2 },
  { name: 'move_clip', description: 'Move a clip to a new position or track', category: 'editing', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'trackId', type: 'string', description: 'Target track ID', required: true }, { name: 'startTime', type: 'number', description: 'New start position', required: true }], requiresConfirmation: false, tokenCost: 2 },
  { name: 'delete_clip', description: 'Delete a clip from the timeline', category: 'editing', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }], requiresConfirmation: true, tokenCost: 1 },
  { name: 'add_marker', description: 'Add a marker at a specific time', category: 'editing', parameters: [{ name: 'time', type: 'number', description: 'Marker time', required: true }, { name: 'label', type: 'string', description: 'Marker label', required: true }, { name: 'color', type: 'string', description: 'Marker color', required: false }], requiresConfirmation: false, tokenCost: 1 },
  // Audio tools
  { name: 'set_volume', description: 'Set track volume', category: 'audio', parameters: [{ name: 'trackId', type: 'string', description: 'Track ID', required: true }, { name: 'volume', type: 'number', description: 'Volume level 0-1', required: true }], requiresConfirmation: false, tokenCost: 1 },
  { name: 'apply_audio_effect', description: 'Apply an audio effect to a track', category: 'audio', parameters: [{ name: 'trackId', type: 'string', description: 'Track ID', required: true }, { name: 'effect', type: 'string', description: 'Effect name', required: true }], requiresConfirmation: false, tokenCost: 3 },
  { name: 'normalize_audio', description: 'Normalize audio levels', category: 'audio', parameters: [{ name: 'trackId', type: 'string', description: 'Track ID', required: true }, { name: 'targetDb', type: 'number', description: 'Target level in dBFS', required: false, defaultValue: -14 }], requiresConfirmation: false, tokenCost: 5 },
  // AI tools
  { name: 'generate_captions', description: 'Auto-generate captions from audio', category: 'ai', parameters: [{ name: 'language', type: 'string', description: 'Language code', required: false, defaultValue: 'en' }], requiresConfirmation: false, tokenCost: 15 },
  { name: 'detect_scenes', description: 'Detect scene boundaries in video', category: 'ai', parameters: [{ name: 'sensitivity', type: 'number', description: 'Detection sensitivity 0-1', required: false, defaultValue: 0.5 }], requiresConfirmation: false, tokenCost: 10 },
  { name: 'remove_silence', description: 'Remove silent passages from audio', category: 'ai', parameters: [{ name: 'thresholdDb', type: 'number', description: 'Silence threshold in dB', required: false, defaultValue: -40 }, { name: 'minDuration', type: 'number', description: 'Minimum silence to remove (seconds)', required: false, defaultValue: 1.0 }], requiresConfirmation: true, tokenCost: 8 },
  { name: 'search_transcript', description: 'Search transcript text', category: 'ai', parameters: [{ name: 'query', type: 'string', description: 'Search query', required: true }], requiresConfirmation: false, tokenCost: 2 },
  // Export tools
  { name: 'export_project', description: 'Export project to specified format', category: 'export', parameters: [{ name: 'format', type: 'string', description: 'Export format', required: true, enumValues: ['mp4', 'mov', 'wav', 'aaf', 'xml'] }], requiresConfirmation: true, tokenCost: 5 },
  // Collaboration
  { name: 'add_review_comment', description: 'Add a review comment at playhead', category: 'collaboration', parameters: [{ name: 'body', type: 'string', description: 'Comment text', required: true }], requiresConfirmation: false, tokenCost: 1 },
];

// ─── Domain Agent Definitions ──────────────────────────────────────────────

function createFilmAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-film',
    vertical: 'film',
    name: 'Film Editor Agent',
    description: 'Specialized for narrative filmmaking: scene assembly, continuity, coverage selection, sound design.',
    systemPrompt: `You are an expert film editing AI assistant. You understand narrative structure,
continuity editing, coverage selection, pacing, and sound design for feature films.
You help editors assemble scenes from coverage, maintain continuity, suggest reaction shots,
optimize pacing for dramatic beats, and coordinate with sound and music departments.
Always think in terms of story beats, emotional arcs, and visual grammar.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'select_best_take', description: 'Analyze takes and suggest the best performance', category: 'ai', parameters: [{ name: 'sceneNumber', type: 'string', description: 'Scene number', required: true }], requiresConfirmation: false, tokenCost: 12 },
      { name: 'check_continuity', description: 'Verify continuity between cuts', category: 'ai', parameters: [{ name: 'clipA', type: 'string', description: 'First clip', required: true }, { name: 'clipB', type: 'string', description: 'Second clip', required: true }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'suggest_coverage', description: 'Suggest which angle to use for coverage', category: 'ai', parameters: [{ name: 'timeRange', type: 'object', description: 'Time range to analyze', required: true }], requiresConfirmation: false, tokenCost: 10 },
      { name: 'analyze_pacing', description: 'Analyze scene pacing and suggest improvements', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 8 },
      { name: 'sync_sound', description: 'Sync dual-system sound to picture', category: 'audio', parameters: [{ name: 'videoClipId', type: 'string', description: 'Video clip', required: true }, { name: 'audioClipId', type: 'string', description: 'External audio', required: true }], requiresConfirmation: false, tokenCost: 6 },
      { name: 'create_selects_reel', description: 'Build a selects reel from marked favorites', category: 'editing', parameters: [{ name: 'binId', type: 'string', description: 'Source bin', required: true }], requiresConfirmation: true, tokenCost: 10 },
      { name: 'detect_eyeline', description: 'Detect eyeline match between shots', category: 'ai', parameters: [{ name: 'clipA', type: 'string', description: 'First shot', required: true }, { name: 'clipB', type: 'string', description: 'Reverse shot', required: true }], requiresConfirmation: false, tokenCost: 10 },
      { name: 'suggest_music_hit', description: 'Suggest music hit points for dramatic beats', category: 'ai', parameters: [{ name: 'startTime', type: 'number', description: 'Analysis start', required: true }, { name: 'endTime', type: 'number', description: 'Analysis end', required: true }], requiresConfirmation: false, tokenCost: 8 },
    ],
    templateMapping: ['film'],
    icon: 'clapperboard',
    color: '#4f63f5',
    capabilities: ['scene-assembly', 'continuity-check', 'coverage-selection', 'pacing-analysis', 'dual-system-sync', 'selects-management'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

function createCommercialAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-commercial',
    vertical: 'commercial',
    name: 'Commercial Editor Agent',
    description: 'Specialized for advertising: fast turnarounds, social cutdowns, brand compliance, deliverables management.',
    systemPrompt: `You are an expert commercial editing AI assistant. You excel at fast-paced brand storytelling,
creating social media cutdowns, managing deliverables across formats and aspect ratios,
ensuring brand guidelines compliance, and optimizing for engagement metrics.
Think in terms of hook-value-CTA structure, attention curves, and platform-specific best practices.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'create_cutdown', description: 'Auto-create a shorter version from master edit', category: 'editing', parameters: [{ name: 'targetDuration', type: 'number', description: 'Target duration in seconds', required: true }, { name: 'platform', type: 'string', description: 'Target platform', required: false, enumValues: ['instagram', 'tiktok', 'youtube', 'facebook'] }], requiresConfirmation: true, tokenCost: 15 },
      { name: 'adapt_aspect_ratio', description: 'Reframe content for different aspect ratios', category: 'editing', parameters: [{ name: 'targetRatio', type: 'string', description: 'Aspect ratio', required: true, enumValues: ['16:9', '9:16', '1:1', '4:5'] }], requiresConfirmation: true, tokenCost: 12 },
      { name: 'check_brand_compliance', description: 'Verify brand colors, logos, and guidelines', category: 'ai', parameters: [{ name: 'brandGuideUrl', type: 'string', description: 'Brand guide reference', required: false }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'optimize_hook', description: 'Analyze and suggest stronger opening hooks', category: 'ai', parameters: [{ name: 'maxDuration', type: 'number', description: 'Max hook duration in seconds', required: false, defaultValue: 3 }], requiresConfirmation: false, tokenCost: 10 },
      { name: 'add_end_card', description: 'Add branded end card with CTA', category: 'editing', parameters: [{ name: 'templateId', type: 'string', description: 'End card template', required: true }], requiresConfirmation: true, tokenCost: 5 },
      { name: 'batch_export_social', description: 'Batch export for multiple social platforms', category: 'export', parameters: [{ name: 'platforms', type: 'array', description: 'Target platforms', required: true }], requiresConfirmation: true, tokenCost: 20 },
      { name: 'analyze_attention_curve', description: 'Predict viewer attention throughout the edit', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 12 },
      { name: 'generate_subtitle_burn', description: 'Generate burned-in subtitles for social', category: 'ai', parameters: [{ name: 'style', type: 'string', description: 'Subtitle style', required: false, enumValues: ['minimal', 'bold', 'animated'] }], requiresConfirmation: true, tokenCost: 10 },
    ],
    templateMapping: ['commercial', 'social'],
    icon: 'tv',
    color: '#25a865',
    capabilities: ['social-cutdowns', 'aspect-ratio-reframing', 'brand-compliance', 'batch-deliverables', 'attention-optimization'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

function createDocumentaryAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-documentary',
    vertical: 'documentary',
    name: 'Documentary Editor Agent',
    description: 'Specialized for documentaries: transcript-driven editing, interview selects, story structure, archival footage.',
    systemPrompt: `You are an expert documentary editing AI assistant. You specialize in transcript-driven editing,
interview selects, narrative structure from non-fiction material, archival footage integration,
and story arc development. You help editors find the best quotes, build paper edits from transcripts,
maintain interview pacing, and create compelling story structures from raw documentary footage.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'paper_edit', description: 'Create a paper edit from transcript selections', category: 'editing', parameters: [{ name: 'selections', type: 'array', description: 'Transcript selections', required: true }], requiresConfirmation: true, tokenCost: 15 },
      { name: 'find_best_quotes', description: 'Find the strongest interview quotes on a topic', category: 'ai', parameters: [{ name: 'topic', type: 'string', description: 'Topic to search for', required: true }, { name: 'maxResults', type: 'number', description: 'Maximum results', required: false, defaultValue: 10 }], requiresConfirmation: false, tokenCost: 12 },
      { name: 'analyze_story_arc', description: 'Analyze and map the story arc structure', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 15 },
      { name: 'suggest_broll', description: 'Suggest B-roll placements for interview segments', category: 'ai', parameters: [{ name: 'interviewClipId', type: 'string', description: 'Interview clip', required: true }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'clean_interview', description: 'Remove uhms, stutters, and false starts', category: 'audio', parameters: [{ name: 'clipId', type: 'string', description: 'Interview clip ID', required: true }, { name: 'aggressiveness', type: 'number', description: 'Cleaning level 0-1', required: false, defaultValue: 0.5 }], requiresConfirmation: true, tokenCost: 10 },
      { name: 'create_string_out', description: 'Create a chronological string-out of all footage', category: 'editing', parameters: [{ name: 'binId', type: 'string', description: 'Source bin', required: true }], requiresConfirmation: true, tokenCost: 8 },
      { name: 'match_archival', description: 'Match archival footage quality to interview footage', category: 'color', parameters: [{ name: 'archivalClipId', type: 'string', description: 'Archival clip', required: true }, { name: 'referenceClipId', type: 'string', description: 'Reference clip', required: true }], requiresConfirmation: true, tokenCost: 12 },
      { name: 'build_act_structure', description: 'Suggest act breaks and structural beats', category: 'ai', parameters: [{ name: 'targetDuration', type: 'number', description: 'Target total duration', required: true }], requiresConfirmation: false, tokenCost: 10 },
    ],
    templateMapping: ['documentary'],
    icon: 'theater',
    color: '#d4873a',
    capabilities: ['transcript-editing', 'interview-selects', 'paper-edits', 'story-structure', 'archival-integration'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

function createSportsAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-sports',
    vertical: 'sports',
    name: 'Sports Editor Agent',
    description: 'Specialized for sports: highlight packages, replay management, graphics, fast turnaround.',
    systemPrompt: `You are an expert sports editing AI assistant. You excel at creating highlight packages,
managing replay angles, coordinating graphics and score bugs, maintaining pace for action sequences,
and delivering under tight turnarounds. You understand sports storytelling and broadcast conventions.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'create_highlight_reel', description: 'Auto-assemble a highlight reel from key moments', category: 'editing', parameters: [{ name: 'momentType', type: 'string', description: 'Type of moments', required: false, enumValues: ['goals', 'saves', 'penalties', 'all-action'] }], requiresConfirmation: true, tokenCost: 15 },
      { name: 'detect_action_moments', description: 'Detect high-action moments in footage', category: 'ai', parameters: [{ name: 'sensitivity', type: 'number', description: 'Detection sensitivity', required: false, defaultValue: 0.7 }], requiresConfirmation: false, tokenCost: 12 },
      { name: 'sync_replay_angles', description: 'Sync multiple replay camera angles', category: 'editing', parameters: [{ name: 'angleIds', type: 'array', description: 'Camera angle asset IDs', required: true }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'add_score_bug', description: 'Insert score/graphics overlay', category: 'effects', parameters: [{ name: 'templateId', type: 'string', description: 'Graphics template', required: true }, { name: 'data', type: 'object', description: 'Score data', required: true }], requiresConfirmation: true, tokenCost: 5 },
      { name: 'speed_ramp', description: 'Apply speed ramp for dramatic replay effect', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'slowFactor', type: 'number', description: 'Slow-motion factor', required: true }], requiresConfirmation: false, tokenCost: 5 },
      { name: 'crowd_audio_enhance', description: 'Enhance crowd/ambient audio for impact', category: 'audio', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'intensity', type: 'number', description: 'Enhancement level', required: false, defaultValue: 0.5 }], requiresConfirmation: false, tokenCost: 6 },
      { name: 'create_social_clip', description: 'Create platform-ready social clip from highlight', category: 'export', parameters: [{ name: 'platform', type: 'string', description: 'Target platform', required: true, enumValues: ['twitter', 'instagram', 'tiktok'] }, { name: 'maxDuration', type: 'number', description: 'Max duration', required: false, defaultValue: 60 }], requiresConfirmation: true, tokenCost: 10 },
      { name: 'analyze_game_flow', description: 'Map the flow of the game for structural editing', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 12 },
    ],
    templateMapping: ['sports'],
    icon: 'bolt',
    color: '#c94f84',
    capabilities: ['highlight-assembly', 'replay-management', 'speed-ramping', 'sports-graphics', 'fast-turnaround'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

function createPodcastAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-podcast',
    vertical: 'podcast',
    name: 'Podcast Editor Agent',
    description: 'Specialized for podcasts: audio-first editing, transcript-driven cuts, chapter markers, ad reads.',
    systemPrompt: `You are an expert podcast editing AI assistant. You specialize in audio-first workflows,
transcript-driven editing, removing verbal tics, managing ad reads, creating chapter markers,
and optimizing for listening platforms. You understand conversational pacing and audio quality.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'remove_verbal_tics', description: 'Remove uhms, ahs, and filler words', category: 'audio', parameters: [{ name: 'aggressiveness', type: 'number', description: 'Removal level 0-1', required: false, defaultValue: 0.6 }], requiresConfirmation: true, tokenCost: 10 },
      { name: 'create_chapters', description: 'Auto-generate chapter markers from content', category: 'ai', parameters: [{ name: 'minChapterDuration', type: 'number', description: 'Minimum chapter length in seconds', required: false, defaultValue: 120 }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'insert_ad_read', description: 'Insert ad read at optimal position', category: 'editing', parameters: [{ name: 'adAssetId', type: 'string', description: 'Ad audio asset', required: true }, { name: 'position', type: 'string', description: 'Position', required: false, enumValues: ['pre-roll', 'mid-roll', 'post-roll'] }], requiresConfirmation: true, tokenCost: 5 },
      { name: 'level_speakers', description: 'Match volume levels between speakers', category: 'audio', parameters: [{ name: 'targetLufs', type: 'number', description: 'Target LUFS level', required: false, defaultValue: -16 }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'create_show_notes', description: 'Generate show notes from transcript', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 10 },
      { name: 'extract_soundbite', description: 'Extract a compelling soundbite for promotion', category: 'ai', parameters: [{ name: 'maxDuration', type: 'number', description: 'Max soundbite duration', required: false, defaultValue: 30 }], requiresConfirmation: false, tokenCost: 8 },
      { name: 'detect_crosstalk', description: 'Detect and mark overlapping speech', category: 'ai', parameters: [], requiresConfirmation: false, tokenCost: 8 },
      { name: 'master_for_platform', description: 'Master audio for podcast platforms', category: 'audio', parameters: [{ name: 'platform', type: 'string', description: 'Target platform', required: true, enumValues: ['spotify', 'apple', 'youtube'] }], requiresConfirmation: true, tokenCost: 10 },
    ],
    templateMapping: ['podcast'],
    icon: 'mic',
    color: '#7c5cfc',
    capabilities: ['verbal-tic-removal', 'chapter-generation', 'ad-insertion', 'speaker-leveling', 'show-notes'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

function createVFXCompositorAgent(): VerticalAgentDefinition {
  return {
    id: 'agent-vfx',
    vertical: 'film' as AgentVertical,
    name: 'VFX Compositor Agent',
    description: 'Specialized for visual effects and compositing: object removal, rotoscoping, sky replacement, beauty, color matching, stabilization, and AI-driven compositing workflows.',
    systemPrompt: `You are an expert VFX compositor AI assistant. You specialize in:
- Object removal (wires, rigs, boom mics) using AI inpainting
- AI rotoscoping with SAM-based per-frame mask generation
- Sky replacement with edge refinement and color matching
- Beauty/skin retouching with frequency separation
- Cross-clip color matching using perceptual analysis
- Content-aware stabilization with optical flow
- Planar tracking for insert compositing (corner pin)
- Keying (chroma, luma, difference, IBK) with spill suppression
- Blend modes and alpha-aware compositing pipelines

When given a VFX task, decompose it into a pipeline: segmentation → mask → process → composite.
Always consider edge quality, temporal coherence, and render performance.
Suggest the simplest approach first and escalate to AI methods only when needed.`,
    baseToolCount: BASE_TOOLS.length,
    domainTools: [
      { name: 'ai_object_removal', description: 'Remove object from video using AI inpainting', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'description', type: 'string', description: 'Object description', required: true }, { name: 'method', type: 'string', description: 'Removal method', required: false, enumValues: ['inpaint', 'patch', 'clone'] }], requiresConfirmation: true, tokenCost: 25 },
      { name: 'ai_rotoscope', description: 'Generate AI per-frame masks for an object', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'description', type: 'string', description: 'Object to mask', required: true }, { name: 'propagate', type: 'boolean', description: 'Propagate across frames', required: false }], requiresConfirmation: false, tokenCost: 20 },
      { name: 'ai_sky_replacement', description: 'Replace sky using AI segmentation', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'replacementAssetId', type: 'string', description: 'Replacement sky asset', required: false }], requiresConfirmation: true, tokenCost: 22 },
      { name: 'ai_face_beauty', description: 'AI skin smoothing and beauty enhancement', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'smoothing', type: 'number', description: 'Smoothing 0-100', required: false }], requiresConfirmation: false, tokenCost: 15 },
      { name: 'ai_color_match', description: 'AI perceptual color matching between clips', category: 'color', parameters: [{ name: 'referenceClipId', type: 'string', description: 'Reference clip', required: true }, { name: 'targetClipIds', type: 'array', description: 'Target clips to match', required: true }], requiresConfirmation: false, tokenCost: 12 },
      { name: 'ai_stabilize', description: 'Content-aware video stabilization', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'smoothing', type: 'number', description: 'Smoothing amount 0-1', required: false }], requiresConfirmation: true, tokenCost: 18 },
      { name: 'apply_effect', description: 'Apply a VFX effect to a clip', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'effectId', type: 'string', description: 'Effect definition ID', required: true }], requiresConfirmation: false, tokenCost: 3 },
      { name: 'track_region', description: 'Run planar tracking on a region', category: 'effects', parameters: [{ name: 'clipId', type: 'string', description: 'Clip ID', required: true }, { name: 'region', type: 'object', description: 'Tracking region points', required: true }], requiresConfirmation: false, tokenCost: 15 },
      { name: 'apply_corner_pin', description: 'Apply tracked corner pin to an insert layer', category: 'effects', parameters: [{ name: 'insertClipId', type: 'string', description: 'Insert clip', required: true }, { name: 'trackingDataId', type: 'string', description: 'Tracking data to use', required: true }], requiresConfirmation: true, tokenCost: 8 },
    ],
    templateMapping: ['film', 'commercial'],
    icon: 'wand',
    color: '#f59e0b',
    capabilities: ['object-removal', 'rotoscoping', 'sky-replacement', 'beauty-retouching', 'color-matching', 'stabilization', 'planar-tracking', 'keying', 'compositing'],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
  };
}

// ─── Registry ──────────────────────────────────────────────────────────────

export class VerticalAgentRegistry {
  private agents: Map<string, VerticalAgentDefinition> = new Map();
  private templateToAgentMap: Map<string, string> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaults = [
      createFilmAgent(),
      createCommercialAgent(),
      createDocumentaryAgent(),
      createSportsAgent(),
      createPodcastAgent(),
      createVFXCompositorAgent(),
    ];

    for (const agent of defaults) {
      this.register(agent);
    }
  }

  /**
   * Registers a new vertical agent definition.
   */
  register(agent: VerticalAgentDefinition): void {
    this.agents.set(agent.id, agent);
    for (const template of agent.templateMapping) {
      this.templateToAgentMap.set(template, agent.id);
    }
  }

  /**
   * Unregisters an agent.
   */
  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      for (const template of agent.templateMapping) {
        if (this.templateToAgentMap.get(template) === agentId) {
          this.templateToAgentMap.delete(template);
        }
      }
      this.agents.delete(agentId);
    }
  }

  /**
   * Gets a specific agent definition.
   */
  getAgent(agentId: string): VerticalAgentDefinition | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * Gets all registered agents.
   */
  getAllAgents(): VerticalAgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Gets agents by vertical.
   */
  getAgentsByVertical(vertical: AgentVertical): VerticalAgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => a.vertical === vertical);
  }

  /**
   * Auto-selects the best agent based on workspace preset / project template.
   */
  selectAgentForTemplate(template: ProjectTemplate): AgentSelectionResult {
    const directMatch = this.templateToAgentMap.get(template);
    const agent = directMatch ? this.agents.get(directMatch) : null;

    if (agent) {
      return {
        agentId: agent.id,
        vertical: agent.vertical,
        confidence: 1.0,
        reason: `Direct template mapping: ${template} -> ${agent.name}`,
        alternativeAgents: this.getAllAgents()
          .filter((a) => a.id !== agent.id)
          .map((a) => ({ agentId: a.id, confidence: 0.3 })),
      };
    }

    // Fallback to film agent
    const fallback = this.agents.get('agent-film')!;
    return {
      agentId: fallback.id,
      vertical: fallback.vertical,
      confidence: 0.5,
      reason: `No direct mapping for template "${template}", defaulting to ${fallback.name}`,
      alternativeAgents: this.getAllAgents()
        .filter((a) => a.id !== fallback.id)
        .map((a) => ({ agentId: a.id, confidence: 0.4 })),
    };
  }

  /**
   * Gets the full tool set for an agent (base + domain tools).
   */
  getAgentTools(agentId: string): AgentToolDefinition[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [...BASE_TOOLS];
    return [...BASE_TOOLS, ...agent.domainTools];
  }

  /**
   * Gets the total tool count for an agent.
   */
  getAgentToolCount(agentId: string): number {
    return this.getAgentTools(agentId).length;
  }

  /**
   * Gets base tools shared by all agents.
   */
  getBaseTools(): AgentToolDefinition[] {
    return [...BASE_TOOLS];
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createVerticalAgentRegistry(): VerticalAgentRegistry {
  return new VerticalAgentRegistry();
}
