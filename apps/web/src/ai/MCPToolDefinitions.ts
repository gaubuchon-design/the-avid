/**
 * MCP Tool Definitions — 24 agent tools formatted as MCP-compatible tool definitions.
 * These map to the editing operations available in the AgentEngine and can be
 * exposed to external MCP servers for tool invocation.
 */

import type { MCPTool } from './MCPClient';

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'splice_in',
    description: 'Insert a clip into a track at a specific frame, pushing existing clips to the right.',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' }, frame: { type: 'number' } }, required: ['trackId', 'clipId', 'frame'] },
  },
  {
    name: 'overwrite',
    description: 'Overwrite a region on a track with a clip, replacing whatever is underneath.',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' }, startFrame: { type: 'number' }, endFrame: { type: 'number' } }, required: ['trackId', 'clipId', 'startFrame'] },
  },
  {
    name: 'lift',
    description: 'Remove a clip from the timeline leaving a gap (no ripple).',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' } }, required: ['clipId'] },
  },
  {
    name: 'extract',
    description: 'Remove a clip from the timeline and close the gap (ripple delete).',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' } }, required: ['clipId'] },
  },
  {
    name: 'ripple_trim',
    description: 'Trim a clip edge and ripple-shift all downstream clips.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, side: { type: 'string', enum: ['left', 'right'] }, frameDelta: { type: 'number' } }, required: ['clipId', 'side', 'frameDelta'] },
  },
  {
    name: 'split_clip',
    description: 'Split a clip into two at the given frame.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, frame: { type: 'number' } }, required: ['clipId', 'frame'] },
  },
  {
    name: 'set_clip_speed',
    description: 'Change the playback speed of a clip (1.0 = normal, 0.5 = half, 2.0 = double).',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, speed: { type: 'number' } }, required: ['clipId', 'speed'] },
  },
  {
    name: 'add_marker',
    description: 'Add a marker to the timeline at a specific frame.',
    inputSchema: { type: 'object', properties: { frame: { type: 'number' }, label: { type: 'string' }, color: { type: 'string' } }, required: ['frame', 'label'] },
  },
  {
    name: 'move_clip_to_bin',
    description: 'Move a clip reference to a different bin.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, binId: { type: 'string' } }, required: ['clipId', 'binId'] },
  },
  {
    name: 'set_clip_metadata',
    description: 'Set metadata key-value pairs on a clip (tags, scene, take, etc.).',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, metadata: { type: 'object' } }, required: ['clipId', 'metadata'] },
  },
  {
    name: 'apply_color_grade',
    description: 'Apply a color grading LUT or preset to one or more clips.',
    inputSchema: { type: 'object', properties: { clipIds: { type: 'array', items: { type: 'string' } }, preset: { type: 'string' } }, required: ['clipIds', 'preset'] },
  },
  {
    name: 'adjust_audio_level',
    description: 'Set the audio level (dB) for a clip or track.',
    inputSchema: { type: 'object', properties: { targetId: { type: 'string' }, targetType: { type: 'string', enum: ['clip', 'track'] }, levelDb: { type: 'number' } }, required: ['targetId', 'targetType', 'levelDb'] },
  },
  {
    name: 'generate_captions',
    description: 'Generate word-level captions from an audio track.',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, language: { type: 'string' }, style: { type: 'string' } }, required: ['trackId', 'language'] },
  },
  {
    name: 'create_bin',
    description: 'Create a new bin (folder) in the media browser.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentBinId: { type: 'string' }, color: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'auto_organize_bins',
    description: 'Automatically organize media in bins by scene, type, or date.',
    inputSchema: { type: 'object', properties: { strategy: { type: 'string', enum: ['scene', 'type', 'date', 'camera'] }, rootBinId: { type: 'string' } }, required: ['strategy'] },
  },
  {
    name: 'find_similar_clips',
    description: 'Find clips visually or audibly similar to a reference clip.',
    inputSchema: { type: 'object', properties: { referenceClipId: { type: 'string' }, similarity: { type: 'string', enum: ['visual', 'audio', 'both'] }, threshold: { type: 'number' } }, required: ['referenceClipId'] },
  },
  {
    name: 'suggest_cuts',
    description: 'Analyze a clip and suggest optimal cut points based on content.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, style: { type: 'string', enum: ['narrative', 'action', 'documentary', 'interview'] } }, required: ['clipId'] },
  },
  {
    name: 'remove_silence',
    description: 'Detect and remove silent segments from an audio track.',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, thresholdDb: { type: 'number' }, minDurationMs: { type: 'number' } }, required: ['trackId'] },
  },
  {
    name: 'auto_color_match',
    description: 'Match the color grading of target clips to a reference clip.',
    inputSchema: { type: 'object', properties: { referenceClipId: { type: 'string' }, targetClipIds: { type: 'array', items: { type: 'string' } } }, required: ['referenceClipId', 'targetClipIds'] },
  },
  {
    name: 'generate_rough_cut',
    description: 'Generate a rough-cut assembly from bin footage using AI analysis.',
    inputSchema: { type: 'object', properties: { binId: { type: 'string' }, style: { type: 'string' }, targetDurationSec: { type: 'number' } }, required: ['binId'] },
  },
  {
    name: 'analyze_audio',
    description: 'Analyze audio waveform for loudness, peaks, and silence regions.',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, clipId: { type: 'string' } }, required: ['trackId'] },
  },
  {
    name: 'detect_scene_changes',
    description: 'Detect scene/shot changes in a video clip based on visual analysis.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, sensitivity: { type: 'number' } }, required: ['clipId'] },
  },
  {
    name: 'normalize_audio',
    description: 'Normalize audio levels to broadcast standard (-23 LUFS).',
    inputSchema: { type: 'object', properties: { trackId: { type: 'string' }, targetLufs: { type: 'number' } }, required: ['trackId'] },
  },
  {
    name: 'auto_reframe',
    description: 'Automatically reframe a clip for a different aspect ratio.',
    inputSchema: { type: 'object', properties: { clipId: { type: 'string' }, targetAspect: { type: 'string' } }, required: ['clipId', 'targetAspect'] },
  },
];

/**
 * Convert MCP tools into the Gemini function declaration format.
 */
export function mcpToolsToGemini(): { functionDeclarations: { name: string; description: string; parameters: Record<string, any> }[] }[] {
  return [
    {
      functionDeclarations: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    },
  ];
}
