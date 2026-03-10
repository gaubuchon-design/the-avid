// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — News Workflow Types (N-01)
//  Core type definitions for newsroom integration, rundown management,
//  playout, breaking news, and supers/CG generation.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Story Status ──────────────────────────────────────────────────────────

export type StoryStatus =
  | 'UNASSIGNED'
  | 'IN_EDIT'
  | 'READY'
  | 'AIRED'
  | 'KILLED';

// ─── NRCS Connection ───────────────────────────────────────────────────────

export type NRCSSystemType = 'INEWS' | 'ENPS' | 'OCTOPUS' | 'OPENMEDIA';

export type NRCSConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'AUTH_FAILED'
  | 'ERROR';

export interface NRCSCredentials {
  username: string;
  password: string;
  token?: string;
}

export interface NRCSConnection {
  id: string;
  type: NRCSSystemType;
  host: string;
  port: number;
  credentials: NRCSCredentials;
  status: NRCSConnectionStatus;
  lastConnectedAt?: string;
  lastError?: string;
  mosId?: string;
  ncsId?: string;
  serverName?: string;
  lastHeartbeat?: string;
}

// ─── Rundown Event ─────────────────────────────────────────────────────────

export interface RundownMediaItem {
  id: string;
  assetId?: string;
  slug: string;
  type: 'VIDEO' | 'AUDIO' | 'GRAPHIC' | 'STILL';
  duration: number;
  status: 'MISSING' | 'AVAILABLE' | 'IN_TIMELINE';
  mosObjId?: string;
}

export interface RundownEvent {
  id: string;
  storyId: string;
  slugline: string;
  scriptText: string;
  targetDuration: number;
  actualDuration?: number;
  assignedEditorId?: string;
  assignedEditorName?: string;
  mediaItems: RundownMediaItem[];
  status: StoryStatus;
  sortOrder: number;
  pageNumber?: string;
  segment?: string;
  presenter?: string;
  lastModifiedAt: string;
  mosAbstract?: string;
  locaterText?: string;
  backTime?: string;
  frontTime?: string;
}

// ─── Breaking News ─────────────────────────────────────────────────────────

export type BreakingNewsPriority = 'BREAKING' | 'URGENT' | 'BULLETIN' | 'NORMAL';

export interface BreakingNewsAlert {
  id: string;
  storyId: string;
  priority: BreakingNewsPriority;
  alertTime: string;
  message: string;
  acknowledged: boolean;
  assignedEditorId?: string;
}

// ─── Supers / CG ──────────────────────────────────────────────────────────

export type CGSystemType = 'VIZRT' | 'CHYRON_HEGO' | 'ROSS_XPRESSION' | 'GENERIC';

export interface SupersData {
  id: string;
  storyId: string;
  personName: string;
  title: string;
  location?: string;
  sourceId?: string;
  graphicTemplateId: string;
  cgSystem: CGSystemType;
  line1?: string;
  line2?: string;
  line3?: string;
  timecodeIn?: string;
  timecodeOut?: string;
  trackTarget: string;
}

export interface CGTemplate {
  id: string;
  name: string;
  system: CGSystemType;
  fields: string[];
  previewUrl?: string;
}

// ─── Playout Destination ───────────────────────────────────────────────────

export type PlayoutServerType =
  | 'AIRSPEED'
  | 'VIZ_ARK'
  | 'ROSS_STRATUS'
  | 'K2'
  | 'GENERIC_FTP';

export type PlayoutExportFormat = 'MXF_DNXHD' | 'MXF_XDCAM' | 'MXF_AVC_INTRA' | 'MOV_PRORES';

export type PlayoutTransferProtocol = 'FTP' | 'HTTP' | 'CIFS' | 'SCP';

export interface PlayoutDestination {
  id: string;
  name: string;
  type: PlayoutServerType;
  host: string;
  port?: number;
  path: string;
  filenamePattern: string;
  format: PlayoutExportFormat;
  protocol: PlayoutTransferProtocol;
  credentials?: NRCSCredentials;
  isDefault: boolean;
  isOnline?: boolean;
}

export type PlayoutJobStatus =
  | 'PENDING'
  | 'ENCODING'
  | 'TRANSFERRING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'QUEUED';

export interface PlayoutJob {
  id: string;
  storyId: string;
  destinationId: string;
  destinationName?: string;
  status: PlayoutJobStatus;
  progress: number;
  format?: PlayoutExportFormat;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputFilename?: string;
  fileSizeBytes?: number;
}

// ─── Broadcast Audio ───────────────────────────────────────────────────────

export type BroadcastAudioRole = 'DIALOGUE' | 'NAT_SOUND' | 'MUSIC' | 'EFFECTS' | 'MIX';

export interface BroadcastAudioPreset {
  id: string;
  trackName: string;
  defaultLevel: number;
  role: BroadcastAudioRole;
  panPosition: number;
  soloIsolate: boolean;
}

export interface BroadcastLoudnessTarget {
  standard: 'EBU_R128' | 'ATSC_A85' | 'ARIB_TR_B32';
  integratedLUFS: number;
  truePeakDBTP: number;
  loudnessRange?: number;
  shortTermMax?: number;
}

// ─── MOS Protocol ──────────────────────────────────────────────────────────

export type MOSMessageType =
  | 'roCreate'
  | 'roReplace'
  | 'roDelete'
  | 'roMetadataReplace'
  | 'roStoryInsert'
  | 'roStoryReplace'
  | 'roStoryDelete'
  | 'roStoryMove'
  | 'roStorySwap'
  | 'roItemInsert'
  | 'roItemReplace'
  | 'roItemDelete'
  | 'roReadyToAir'
  | 'roAck'
  | 'heartbeat';

export interface MOSMessage {
  messageId: string;
  type: MOSMessageType;
  roId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  ncsId: string;
  mosId: string;
}

export interface MOSRunningOrder {
  roId: string;
  roSlug: string;
  roChannel?: string;
  roEdStart?: string;
  roEdDur?: string;
  stories: MOSStory[];
}

export interface MOSStory {
  storyId: string;
  storySlug: string;
  storyNum?: string;
  items: MOSItem[];
}

export interface MOSItem {
  itemId: string;
  itemSlug: string;
  objId?: string;
  objDur?: number;
  objTB?: number;
  mosAbstract?: string;
}

// ─── Rundown / Newsroom State ──────────────────────────────────────────────

export interface RundownState {
  id: string;
  name: string;
  showDate: string;
  stories: RundownEvent[];
  activeStoryId: string | null;
  lastSyncAt: string | null;
}

export interface NewsStoreState {
  nrcsConnection: NRCSConnection | null;
  rundowns: RundownState[];
  activeRundownId: string | null;
  activeStoryId: string | null;
  breakingAlerts: BreakingNewsAlert[];
  storyTimers: Record<string, number>;
  playoutDestinations: PlayoutDestination[];
  playoutJobs: PlayoutJob[];
  supersQueue: SupersData[];
  cgTemplates: CGTemplate[];
  isPolling: boolean;
  pollIntervalMs: number;
  lastError: string | null;
}

// ─── Events / Callbacks ────────────────────────────────────────────────────

export interface NRCSEventMap {
  'rundown:updated': RundownState;
  'story:inserted': RundownEvent;
  'story:replaced': RundownEvent;
  'story:deleted': { storyId: string; rundownId: string };
  'story:moved': { storyId: string; newIndex: number };
  'story:readyToAir': { storyId: string };
  'breaking:alert': BreakingNewsAlert;
  'connection:status': NRCSConnectionStatus;
  'playout:progress': PlayoutJob;
  'playout:completed': PlayoutJob;
  'playout:failed': PlayoutJob;
}

export type NRCSEventHandler<K extends keyof NRCSEventMap> = (
  event: NRCSEventMap[K],
) => void;
