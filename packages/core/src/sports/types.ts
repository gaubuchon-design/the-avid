// ─── Sports Production Module — Types ─────────────────────────────────────────
// SP-01: All sports-specific type definitions for the production pipeline.

// ─── Enums & Literals ─────────────────────────────────────────────────────────

export type SportEventType =
  | 'GOAL'
  | 'TACKLE'
  | 'DUNK'
  | 'TOUCHDOWN'
  | 'HOME_RUN'
  | 'THREE_POINTER'
  | 'PENALTY'
  | 'FOUL'
  | 'SUBSTITUTION'
  | 'TIMEOUT'
  | 'SAVE'
  | 'INTERCEPTION'
  | 'SACK'
  | 'STRIKEOUT'
  | 'ASSIST'
  | 'REBOUND'
  | 'TURNOVER'
  | 'RED_CARD'
  | 'YELLOW_CARD'
  | 'OFFSIDE'
  | 'FREE_KICK'
  | 'CORNER_KICK'
  | 'FIELD_GOAL'
  | 'SAFETY'
  | 'TWO_POINT_CONVERSION'
  | 'POWER_PLAY'
  | 'HAT_TRICK'
  | 'OTHER';

export type SportsCameraAngle =
  | 'MAIN_WIDE'
  | 'TIGHT'
  | 'ISO_1'
  | 'ISO_2'
  | 'ISO_3'
  | 'ISO_4'
  | 'HIGH_WIDE'
  | 'REVERSE'
  | 'BEAUTY'
  | 'SLASH'
  | 'HANDHELD'
  | 'STEADICAM'
  | 'SKYCAM'
  | 'ENDZONE'
  | 'GOAL_CAM'
  | 'NET_CAM'
  | 'RAIL_CAM'
  | 'SUPER_SLO_MO'
  | 'CUSTOM';

export type SportsLeague =
  | 'NFL'
  | 'NBA'
  | 'MLB'
  | 'NHL'
  | 'EPL'
  | 'LA_LIGA'
  | 'BUNDESLIGA'
  | 'SERIE_A'
  | 'LIGUE_1'
  | 'MLS'
  | 'UEFA_CL'
  | 'FIFA_WC'
  | 'NCAA_FB'
  | 'NCAA_BB'
  | 'CUSTOM';

export type SportsPackageType = 'PRE_GAME' | 'HALFTIME' | 'POST_GAME' | 'SOCIAL_CLIP';

export type GrowingFileFormat = 'GXF' | 'MXF_OP1A' | 'MP4_PROGRESSIVE';

export type HighlightConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type SpeedRampInterpolation = 'LINEAR' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_OUT' | 'BEZIER';

export type FrameBlendMode = 'NONE' | 'FRAME_BLEND' | 'OPTICAL_FLOW';

export type GraphicTemplateCategory =
  | 'PLAYER_NAME'
  | 'SCORE_BUG'
  | 'GAME_CLOCK'
  | 'STATS_CARD'
  | 'LEAGUE_STANDINGS'
  | 'SPONSOR_BUG'
  | 'LOWER_THIRD'
  | 'FULL_SCREEN';

export type StatsProvider = 'SPORTRADAR' | 'STATS_INC' | 'ESPN_STATS' | 'OPTA';

export type PartialExportStatus = 'PENDING' | 'EXPORTING' | 'COMPLETED' | 'STALE' | 'FAILED';

export type EVSConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export type StatsConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'STALE' | 'ERROR';

// ─── Core Data Structures ─────────────────────────────────────────────────────

export interface SportsMetadata {
  playerNames: string[];
  teams: string[];
  eventType: SportEventType;
  gameClock: string;
  period: number;
  scoreAtEvent: { home: number; away: number };
  cameraAngle: SportsCameraAngle;
  competitionName: string;
  venue: string;
  league: SportsLeague;
  gameDate: string;
  broadcaster?: string;
}

export interface GrowingFileState {
  id: string;
  filePath: string;
  currentDuration: number;
  expectedDuration?: number;
  isGrowing: boolean;
  lastFrameTime: number;
  latencyMs: number;
  format: GrowingFileFormat;
  frameRate: number;
  resolution: { width: number; height: number };
  startTimecode: string;
  bytesWritten: number;
  serverName?: string;
  error?: string;
}

export interface EVSClip {
  clipId: string;
  cameraAngle: SportsCameraAngle;
  inPoint: number;
  outPoint: number;
  operatorLabel: string;
  serverPath: string;
  isProxy: boolean;
  timecodeIn: string;
  timecodeOut: string;
  duration: number;
  operatorName?: string;
  tags: string[];
  createdAt: string;
  serverId: string;
  format: GrowingFileFormat;
  thumbnailUrl?: string;
}

export interface EVSServer {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  status: EVSConnectionStatus;
  clipCount: number;
  storageUsedPercent: number;
  lastSyncAt?: string;
  channels: EVSChannel[];
}

export interface EVSChannel {
  id: string;
  label: string;
  cameraAngle: SportsCameraAngle;
  isRecording: boolean;
  currentTimecode: string;
}

export interface EVSConnectionConfig {
  serverAddress: string;
  port: number;
  protocol: 'IP_DIRECTOR' | 'XFILE3';
  username?: string;
  password?: string;
  proxyWorkflow: boolean;
  autoSync: boolean;
  syncIntervalMs: number;
}

export interface StatsDataPoint {
  timestamp: number;
  gameState: 'PRE_GAME' | 'IN_PLAY' | 'HALFTIME' | 'BREAK' | 'POST_GAME' | 'DELAYED' | 'SUSPENDED';
  homeScore: number;
  awayScore: number;
  period: number;
  gameClockMs: number;
  events: StatsEvent[];
}

export interface StatsEvent {
  id: string;
  type: SportEventType;
  timestamp: number;
  playerName?: string;
  teamId: string;
  description: string;
  gameClockMs: number;
  period: number;
}

export interface StatsProviderConfig {
  provider: StatsProvider;
  apiKey: string;
  baseUrl: string;
  gameId: string;
  refreshIntervalMs: number;
  enabled: boolean;
}

export interface HighlightEvent {
  id: string;
  timestamp: number;
  type: SportEventType;
  confidence: number;
  confidenceLevel: HighlightConfidenceLevel;
  players: string[];
  description: string;
  duration: number;
  clipIds: string[];
  audioIntensity: number;
  crowdReactionScore: number;
  commentaryExcitement: number;
  isReplay: boolean;
  sourceDetections: HighlightDetectionSource[];
}

export interface HighlightDetectionSource {
  method: 'CROWD_NOISE' | 'SCOREBOARD_OCR' | 'PLAYER_TRACKING' | 'COMMENTARY_NLP' | 'REPLAY_MARKER' | 'STATS_API';
  confidence: number;
  rawData?: Record<string, unknown>;
}

export interface HighlightReelConfig {
  name: string;
  targetDuration: number;
  minConfidence: number;
  includeReplays: boolean;
  eventTypes: SportEventType[];
  musicBedAssetId?: string;
  introGraphicId?: string;
  outroGraphicId?: string;
  transitionStyle: 'CUT' | 'DISSOLVE' | 'WIPE' | 'PUSH';
  transitionDuration: number;
}

export interface SportsGraphicTemplate {
  id: string;
  name: string;
  category: GraphicTemplateCategory;
  league: SportsLeague;
  width: number;
  height: number;
  duration: number;
  fields: GraphicField[];
  previewUrl?: string;
  animationIn: string;
  animationOut: string;
}

export interface GraphicField {
  id: string;
  name: string;
  type: 'TEXT' | 'NUMBER' | 'IMAGE' | 'COLOR';
  defaultValue: string;
  liveBinding?: string;
  isRequired: boolean;
  maxLength?: number;
  position: { x: number; y: number };
  style: Record<string, string | number>;
}

export interface GraphicsDataBinding {
  fieldId: string;
  source: 'STATIC' | 'STATS_LIVE' | 'METADATA';
  key: string;
  format?: string;
  fallback: string;
}

export interface SpeedRampKeyframe {
  time: number;
  speed: number;
  interpolation: SpeedRampInterpolation;
  bezierHandleIn?: { x: number; y: number };
  bezierHandleOut?: { x: number; y: number };
}

export interface SpeedRampConfig {
  clipId: string;
  keyframes: SpeedRampKeyframe[];
  frameBlendMode: FrameBlendMode;
  sourceFrameRate: number;
  targetFrameRate: number;
  preserveAudioPitch: boolean;
}

export interface HFRClipMetadata {
  clipId: string;
  nativeFrameRate: number;
  sequenceFrameRate: number;
  autoSpeedPercent: number;
  speedRamp?: SpeedRampConfig;
  frameBlendMode: FrameBlendMode;
  isRetimed: boolean;
}

export interface SportsPackage {
  id: string;
  name: string;
  type: SportsPackageType;
  league: SportsLeague;
  status: 'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'APPROVED' | 'DELIVERED';
  createdAt: string;
  updatedAt: string;
  elements: PackageElement[];
  requiredElements: PackageRequirement[];
  deliveryTargets: DeliveryTarget[];
  metadata: SportsMetadata;
  duration?: number;
  assignedTo?: string;
}

export interface PackageElement {
  id: string;
  type: 'CLIP' | 'GRAPHIC' | 'AUDIO' | 'VOICEOVER' | 'STATS_CARD';
  assetId?: string;
  clipId?: string;
  graphicTemplateId?: string;
  label: string;
  duration: number;
  sortOrder: number;
  status: 'MISSING' | 'PLACED' | 'APPROVED';
}

export interface PackageRequirement {
  id: string;
  label: string;
  elementType: PackageElement['type'];
  isMet: boolean;
  autoFillQuery?: string;
}

export interface DeliveryTarget {
  id: string;
  name: string;
  type: 'PLAYOUT' | 'SOCIAL' | 'WEB' | 'ARCHIVE' | 'FTP';
  format: string;
  resolution: { width: number; height: number };
  frameRate: number;
  bitrate?: number;
  destination: string;
  status: 'PENDING' | 'QUEUED' | 'DELIVERING' | 'DELIVERED' | 'FAILED';
}

export interface PartialExport {
  id: string;
  name: string;
  inPoint: number;
  outPoint: number;
  status: PartialExportStatus;
  progress: number;
  outputPath?: string;
  deliveryTarget?: DeliveryTarget;
  isStale: boolean;
  originalHash?: string;
  currentHash?: string;
  exportedAt?: string;
  format: string;
  resolution: { width: number; height: number };
  frameRate: number;
}

// ─── Multi-Cam Grid ─────────────────────────────────────────────────────────

export interface SportsCamFeed {
  id: string;
  label: string;
  cameraAngle: SportsCameraAngle;
  streamUrl?: string;
  isLive: boolean;
  isRecording: boolean;
  tally: 'OFF' | 'PREVIEW' | 'PROGRAM';
  serverName?: string;
  thumbnailUrl?: string;
}

export interface SportsCamGridConfig {
  layout: '2x2' | '3x3' | '4x4';
  feeds: SportsCamFeed[];
  selectedFeedId: string | null;
  programFeedId: string | null;
  showTally: boolean;
  showLabels: boolean;
}

// ─── Workspace Preset ─────────────────────────────────────────────────────────

export interface SportsWorkspaceLayout {
  evsPanel: { position: 'top-left'; widthPercent: number; heightPercent: number };
  highlightsPanel: { position: 'center-left'; widthPercent: number; heightPercent: number };
  recordMonitor: { position: 'top-center'; widthPercent: number; heightPercent: number };
  sportsCamGrid: { position: 'top-right'; widthPercent: number; heightPercent: number };
  timeline: { position: 'bottom'; widthPercent: number; heightPercent: number };
  packageBuilder: { position: 'right'; widthPercent: number; heightPercent: number };
}

export const DEFAULT_SPORTS_WORKSPACE: SportsWorkspaceLayout = {
  evsPanel: { position: 'top-left', widthPercent: 25, heightPercent: 40 },
  highlightsPanel: { position: 'center-left', widthPercent: 25, heightPercent: 40 },
  recordMonitor: { position: 'top-center', widthPercent: 30, heightPercent: 40 },
  sportsCamGrid: { position: 'top-right', widthPercent: 20, heightPercent: 40 },
  timeline: { position: 'bottom', widthPercent: 100, heightPercent: 60 },
  packageBuilder: { position: 'right', widthPercent: 25, heightPercent: 100 },
};
