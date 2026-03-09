// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Engine Registry
//  Central export point for all editing engines.
// ═══════════════════════════════════════════════════════════════════════════

// Core undo/redo
export { editEngine } from './EditEngine';
export { type Command, type SnapResult, type SnapAnchor } from './types';

// Commands
export {
  AddClipCommand, RemoveClipCommand, MoveClipCommand,
  TrimClipLeftCommand, TrimClipRightCommand, SplitClipCommand,
  AddTrackCommand, RemoveTrackCommand,
  SlipClipCommand, SlideClipCommand, RippleDeleteCommand, GroupClipsCommand,
} from './commands';

// Timeline engines
export { snapEngine } from './SnapEngine';
export { trimEngine } from './TrimEngine';
export { TrimMode, TrimSide, type TrimState, type TrimResult, type SlipState, type SlideState } from './TrimEngine';
export { editOpsEngine } from './EditOperationsEngine';
export { type EditType, type EditResult, type MarkState, type SourceMonitorState } from './EditOperationsEngine';
export { smartToolEngine } from './SmartToolEngine';
export { type SmartToolMode, type SmartToolState, type CursorZone, type HitTestParams } from './SmartToolEngine';
export { trackPatchingEngine } from './TrackPatchingEngine';
export { type TrackPatch, type TrackMonitorState } from './TrackPatchingEngine';

// Multicam
export { multicamEngine } from './MulticamEngine';
export { type MulticamGroup, type CameraAngle, type MulticamCut, type MulticamState } from './MulticamEngine';

// Keyboard
export { keyboardEngine } from './KeyboardEngine';
export { type KeyBinding, type KeyCategory, type KeyboardLayout } from './KeyboardEngine';

// Match Frame
export { matchFrameEngine } from './MatchFrameEngine';
export { type MatchFrameResult } from './MatchFrameEngine';

// Markers
export { markerEngine } from './MarkerEngine';
export { type MarkerColor } from './MarkerEngine';

// Audio
export { audioMixerEngine } from './AudioMixerEngine';
export { type MixerChannel, type AudioKeyframe, type AutomationMode } from './AudioMixerEngine';

// Effects
export { effectsEngine } from './EffectsEngine';
export { type EffectDefinition, type EffectInstance } from './EffectsEngine';

// Transitions
export { transitionEngine } from './TransitionEngine';
export { type TransitionInstance, type TransitionDefinition } from './TransitionEngine';

// Titles
export { titleEngine } from './TitleEngine';
export { type TitleInstance, type TitleTextObject, type TitleTemplate } from './TitleEngine';

// Color Correction
export { colorCorrectionEngine } from './ColorCorrectionEngine';
export { type ColorCorrectionState, type ColorWheelValues } from './ColorCorrectionEngine';

// SubClips
export { subClipEngine } from './SubClipEngine';
export { type SubClip, type Subsequence } from './SubClipEngine';

// Workspace
export { workspaceEngine } from './WorkspaceEngine';
export { type WorkspaceLayout, type PanelConfig } from './WorkspaceEngine';

// Bin Views
export { binViewEngine } from './BinViewEngine';
export { type BinViewMode, type BinColumn, type BinSiftCriterion, type SuperBin } from './BinViewEngine';

// Media Management
export { mediaManagementEngine } from './MediaManagementEngine';
export { type MediaStatus, type CodecType, type AMALink } from './MediaManagementEngine';

// Playback
export { playbackEngine } from './PlaybackEngine';

// Audio
export { audioEngine } from './AudioEngine';

// Color
export { colorEngine } from './ColorEngine';

// Export
export { exportEngine } from './ExportEngine';

// Plugin Registry
export { pluginRegistry } from './PluginRegistry';

// Platform
export { platformCapabilities } from './PlatformCapabilities';

// Interchange formats
export { aafEngine } from './AAFEngine';
export {
  exportToOTIO, importFromOTIO, serializeOTIO, deserializeOTIO,
  adapterRegistry, getAdapterForExtension, listAdapters,
} from './OTIOEngine';
export { ocioEngine } from './OCIOEngine';
export { tamsEngine } from './TAMSEngine';
export { ofxBridge } from './OpenFXBridge';

// Timeline Display
export { timelineDisplayEngine } from './TimelineDisplayEngine';
export { type DupeInfo, type WaveformCache, type ResolvedClipColor } from './TimelineDisplayEngine';
