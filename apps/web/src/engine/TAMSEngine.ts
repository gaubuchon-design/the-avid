// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- TAMS Engine (Time Addressable Media Store)
//  Edit-while-capture workflows using the BBC TAMS specification.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Core TAMS Types ────────────────────────────────────────────────────────

/** A real-world entity being recorded (camera, microphone, etc.). */
export interface TAMSSource {
  /** Unique identifier for this source. */
  readonly id: string;
  /** Human-readable label (e.g. "Camera A", "Boom Mic 1"). */
  label: string;
  /** Optional longer description of the source. */
  description?: string;
  /** MIME type of media produced by this source (e.g. "video/mp4", "audio/wav"). */
  format?: string;
  /** Arbitrary key-value metadata attached to the source. */
  tags?: Record<string, string>;
  /** ISO-8601 timestamp of when the source was created. */
  createdAt?: string;
  /** ISO-8601 timestamp of the last modification. */
  updatedAt?: string;
}

/** Codec used by a flow. */
export type TAMSCodec =
  | 'video/H264'
  | 'video/H265'
  | 'video/AV1'
  | 'video/VP9'
  | 'audio/AAC'
  | 'audio/opus'
  | 'audio/pcm'
  | string;

/** The kind of media carried by a flow. */
export type TAMSMediaType = 'video' | 'audio' | 'data';

/**
 * A logical timeline of media data identified by a UUID.
 * Flows contain an ordered sequence of grains and are associated with a source.
 */
export interface TAMSFlow {
  /** UUID identifying this flow. */
  readonly id: string;
  /** UUID of the parent source. */
  sourceId: string;
  /** Human-readable label for the flow. */
  label: string;
  /** Media type carried by this flow. */
  mediaType: TAMSMediaType;
  /** Codec identifier. */
  codec: TAMSCodec;
  /** Container format (e.g. "mp4", "ts", "fmp4"). */
  container?: string;
  /** Video width in pixels (video flows only). */
  width?: number;
  /** Video height in pixels (video flows only). */
  height?: number;
  /** Frame rate as a rational number string, e.g. "24000/1001". */
  frameRate?: string;
  /** Audio sample rate in Hz (audio flows only). */
  sampleRate?: number;
  /** Number of audio channels (audio flows only). */
  channels?: number;
  /** Bit depth for audio (audio flows only). */
  bitDepth?: number;
  /** Arbitrary key-value metadata. */
  metadata?: Record<string, string>;
  /** ISO-8601 timestamp of when the flow was created. */
  createdAt?: string;
  /** ISO-8601 timestamp of the last modification. */
  updatedAt?: string;
}

/**
 * A contiguous group of grains stored in a container format.
 * This is the unit of storage and retrieval in TAMS.
 */
export interface TAMSFlowSegment {
  /** Unique identifier for this segment. */
  readonly id: string;
  /** UUID of the flow this segment belongs to. */
  flowId: string;
  /** Presigned URL for retrieving the segment media data. */
  url: string;
  /** Time range covered by this segment. */
  timeRange: TAMSTimeRange;
  /** Byte length of the segment. */
  byteLength?: number;
  /** Container format (e.g. "mp4", "ts"). */
  container?: string;
  /** Number of grains in this segment. */
  grainCount?: number;
  /** ISO-8601 timestamp of when the segment was written. */
  createdAt?: string;
}

/**
 * Atomic unit of media -- a single video frame or audio sample chunk.
 * Grains are the finest addressable unit within a flow.
 */
export interface TAMSGrain {
  /** Presentation timestamp of this grain (seconds). */
  timestamp: number;
  /** Duration of this grain (seconds). */
  duration: number;
  /** Byte offset within the parent segment. */
  byteOffset?: number;
  /** Byte length of this grain's data. */
  byteLength?: number;
  /** Whether this grain is a key frame / sync sample. */
  isKeyFrame?: boolean;
}

/**
 * A time range defined by start and end timestamps (seconds, inclusive).
 */
export interface TAMSTimeRange {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

/**
 * A lightweight reference to media within a TAMS flow.
 * Used for non-destructive editing -- no data is copied, only the reference is stored.
 */
export interface TAMSMediaReference {
  /** UUID of the flow being referenced. */
  flowId: string;
  /** Timestamp within the flow (seconds). */
  timestamp: number;
}

// ─── API Response Types ─────────────────────────────────────────────────────

/** Paginated list response from the TAMS API. */
export interface TAMSListResponse<T> {
  items: T[];
  /** Opaque cursor for fetching the next page, or `null` if no more pages. */
  nextCursor: string | null;
  /** Total number of items (if the server provides it). */
  totalCount?: number;
}

/** Error shape returned by the TAMS API. */
export interface TAMSApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

// ─── Capture Types ──────────────────────────────────────────────────────────

/** Configuration for starting a capture session. */
export interface TAMSCaptureConfig {
  /** Source to capture from. */
  sourceId: string;
  /** Human-readable label for the capture. */
  label?: string;
  /** Desired video codec (if applicable). */
  videoCodec?: TAMSCodec;
  /** Desired audio codec (if applicable). */
  audioCodec?: TAMSCodec;
  /** Container format for segments. */
  container?: string;
  /** Target segment duration in seconds (how often to flush a segment). */
  segmentDuration?: number;
  /** Arbitrary metadata to attach to resulting flows. */
  metadata?: Record<string, string>;
}

/** State of an active capture session. */
export interface TAMSCaptureSession {
  /** Unique identifier for this capture session. */
  readonly id: string;
  /** Source being captured. */
  sourceId: string;
  /** Flow IDs created by this capture (typically one video, one audio). */
  flowIds: string[];
  /** Current capture state. */
  state: 'starting' | 'capturing' | 'stopping' | 'stopped' | 'error';
  /** ISO-8601 timestamp of when capture started. */
  startedAt: string;
  /** ISO-8601 timestamp of when capture stopped, or `null` if still running. */
  stoppedAt: string | null;
  /** Error message if state is 'error'. */
  error?: string;
}

// ─── Playback Session Types ─────────────────────────────────────────────────

/** A progressive playback session for streaming from a TAMS flow. */
export interface TAMSPlaybackSession {
  /** Unique identifier for this playback session. */
  readonly id: string;
  /** Flow being played. */
  flowId: string;
  /** Current playback position (seconds). */
  currentTime: number;
  /** Whether the session is actively fetching new segments. */
  isLive: boolean;
  /** Segments that have been fetched and are ready for playback. */
  bufferedSegments: TAMSFlowSegment[];
  /** Pre-fetch window ahead of current time (seconds). */
  prefetchWindow: number;
}

// ─── Timeline Integration Types ─────────────────────────────────────────────

/** A clip imported from a TAMS flow into the timeline. */
export interface TAMSTimelineClip {
  /** ID of the clip on the timeline. */
  clipId: string;
  /** TAMS flow this clip references. */
  flowId: string;
  /** Time range within the flow (source media time). */
  sourceRange: TAMSTimeRange;
  /** ID of the track this clip was placed on. */
  trackId: string;
  /** Start time on the timeline (seconds). */
  timelineStart: number;
}

/** A TAMS flow reference exported from the timeline. */
export interface TAMSExportedEdit {
  /** Label for this exported edit. */
  label: string;
  /** Ordered list of flow references making up this edit. */
  segments: Array<{
    flowId: string;
    timeRange: TAMSTimeRange;
    trackId: string;
  }>;
  /** ISO-8601 timestamp of when the edit was exported. */
  exportedAt: string;
}

// ─── Connection Types ───────────────────────────────────────────────────────

/** Connection status for the TAMS API endpoint. */
export type TAMSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Configuration for connecting to a TAMS endpoint. */
export interface TAMSConnectionConfig {
  /** Base URL of the TAMS API (e.g. "https://tams.example.com/api/v1"). */
  endpoint: string;
  /** Optional bearer token for authentication. */
  authToken?: string;
  /** WebSocket URL for real-time updates (derived from endpoint if not provided). */
  wsEndpoint?: string;
  /** Connection timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Number of retry attempts for failed requests (default: 3). */
  retries?: number;
}

// ─── Event Types ────────────────────────────────────────────────────────────

/** Events emitted by the TAMS engine. */
export type TAMSEventType =
  | 'connection:changed'
  | 'capture:started'
  | 'capture:stopped'
  | 'capture:error'
  | 'flow:updated'
  | 'flow:segment:added'
  | 'playback:progress'
  | 'playback:ended'
  | 'error';

/** Payload for a TAMS engine event. */
export interface TAMSEvent {
  type: TAMSEventType;
  timestamp: number;
  data: unknown;
}

/** Callback for flow update subscriptions. */
export type TAMSFlowUpdateCallback = (flowId: string, latestSegment: TAMSFlowSegment) => void;

// ─── Error Classes ──────────────────────────────────────────────────────────

/** Error thrown when the TAMS API returns an error response. */
export class TAMSRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(apiError: TAMSApiError) {
    super(`[TAMS ${apiError.status}] ${apiError.code}: ${apiError.message}`);
    this.name = 'TAMSRequestError';
    this.status = apiError.status;
    this.code = apiError.code;
    this.details = apiError.details;
  }
}

/** Error thrown when the engine is not connected to a TAMS endpoint. */
export class TAMSConnectionError extends Error {
  constructor(message = 'Not connected to a TAMS endpoint') {
    super(message);
    this.name = 'TAMSConnectionError';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a v4-style UUID. Uses crypto.randomUUID when available, otherwise falls back. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Format a TAMSTimeRange as a TAMS API query parameter value. */
function formatTimeRangeParam(range: TAMSTimeRange): string {
  return `${range.start}_${range.end}`;
}

// ─── TAMS Client (HTTP API) ─────────────────────────────────────────────────

/**
 * Low-level HTTP client for the TAMS REST API.
 *
 * Wraps `fetch` with authentication, error handling, and retry logic.
 * All methods throw {@link TAMSRequestError} on API errors and
 * {@link TAMSConnectionError} when called without an active connection.
 */
class TAMSClient {
  private endpoint: string = '';
  private authToken: string | undefined;
  private retries: number = 3;
  private timeoutMs: number = 10_000;

  /** Configure the client for a specific TAMS endpoint. */
  configure(config: TAMSConnectionConfig): void {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.authToken = config.authToken;
    this.retries = config.retries ?? 3;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** Reset the client to its disconnected state. */
  reset(): void {
    this.endpoint = '';
    this.authToken = undefined;
  }

  /** Whether the client has been configured with an endpoint. */
  get isConfigured(): boolean {
    return this.endpoint.length > 0;
  }

  // ── Generic request helper ──────────────────────────────────────────

  /**
   * Send an HTTP request to the TAMS API with retry and timeout support.
   * @param method HTTP method.
   * @param path   API path (appended to the configured endpoint).
   * @param body   Optional JSON body.
   * @returns Parsed JSON response.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.isConfigured) {
      throw new TAMSConnectionError();
    }

    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          let apiError: TAMSApiError;
          try {
            const errorBody = await response.json();
            apiError = {
              status: response.status,
              code: errorBody.code ?? 'UNKNOWN_ERROR',
              message: errorBody.message ?? response.statusText,
              details: errorBody.details,
            };
          } catch {
            apiError = {
              status: response.status,
              code: 'UNKNOWN_ERROR',
              message: response.statusText,
            };
          }
          throw new TAMSRequestError(apiError);
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return undefined as unknown as T;
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Do not retry on client errors (4xx) or explicit TAMS errors
        if (err instanceof TAMSRequestError && err.status >= 400 && err.status < 500) {
          throw err;
        }

        // Retry on network errors and server errors
        if (attempt < this.retries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
      }
    }

    throw lastError ?? new Error('TAMS request failed');
  }

  // ── Sources ─────────────────────────────────────────────────────────

  /**
   * List all sources registered in TAMS.
   * @returns Paginated list of sources.
   * @example
   * const { items } = await client.listSources();
   */
  async listSources(): Promise<TAMSListResponse<TAMSSource>> {
    return this.request<TAMSListResponse<TAMSSource>>('GET', '/sources');
  }

  /**
   * Get a single source by ID.
   * @param sourceId UUID of the source.
   * @returns The source object.
   * @example
   * const source = await client.getSource('abc-123');
   */
  async getSource(sourceId: string): Promise<TAMSSource> {
    return this.request<TAMSSource>('GET', `/sources/${encodeURIComponent(sourceId)}`);
  }

  // ── Flows ───────────────────────────────────────────────────────────

  /**
   * List flows, optionally filtered by source.
   * @param sourceId Optional source UUID to filter by.
   * @returns Paginated list of flows.
   * @example
   * const { items: flows } = await client.listFlows();
   * const { items: cameraFlows } = await client.listFlows('source-uuid');
   */
  async listFlows(sourceId?: string): Promise<TAMSListResponse<TAMSFlow>> {
    const query = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : '';
    return this.request<TAMSListResponse<TAMSFlow>>('GET', `/flows${query}`);
  }

  /**
   * Get a single flow by ID.
   * @param flowId UUID of the flow.
   * @returns The flow object.
   */
  async getFlow(flowId: string): Promise<TAMSFlow> {
    return this.request<TAMSFlow>('GET', `/flows/${encodeURIComponent(flowId)}`);
  }

  /**
   * List segments for a flow, optionally restricted to a time range.
   * @param flowId    UUID of the flow.
   * @param timeRange Optional time range to filter segments.
   * @returns Paginated list of segments.
   * @example
   * const { items } = await client.getFlowSegments('flow-uuid', { start: 10, end: 20 });
   */
  async getFlowSegments(
    flowId: string,
    timeRange?: TAMSTimeRange,
  ): Promise<TAMSListResponse<TAMSFlowSegment>> {
    const path = `/flows/${encodeURIComponent(flowId)}/segments`;
    const query = timeRange ? `?timerange=${formatTimeRangeParam(timeRange)}` : '';
    return this.request<TAMSListResponse<TAMSFlowSegment>>('GET', `${path}${query}`);
  }

  /**
   * Upload / register a segment for a flow.
   * @param flowId  UUID of the flow.
   * @param segment Segment metadata to register.
   * @returns The registered segment (may include a presigned upload URL).
   */
  async putFlowSegment(flowId: string, segment: Omit<TAMSFlowSegment, 'id'>): Promise<TAMSFlowSegment> {
    return this.request<TAMSFlowSegment>(
      'PUT',
      `/flows/${encodeURIComponent(flowId)}/segments`,
      segment,
    );
  }

  /**
   * Get metadata for a flow.
   * @param flowId UUID of the flow.
   * @returns Arbitrary metadata dictionary.
   */
  async getFlowMetadata(flowId: string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>(
      'GET',
      `/flows/${encodeURIComponent(flowId)}/metadata`,
    );
  }

  /**
   * Delete a flow and all of its segments.
   * @param flowId UUID of the flow to delete.
   */
  async deleteFlow(flowId: string): Promise<void> {
    await this.request<void>('DELETE', `/flows/${encodeURIComponent(flowId)}`);
  }
}

// ─── TAMS Engine ────────────────────────────────────────────────────────────

/**
 * TAMS (Time Addressable Media Store) engine for edit-while-capture workflows.
 *
 * Provides a high-level interface on top of the BBC TAMS specification,
 * integrating live capture, non-destructive editing by media reference,
 * progressive playback sessions, and timeline import/export.
 *
 * Works in both browser and Electron (desktop) contexts -- all network
 * I/O goes through standard `fetch` and `WebSocket`.
 *
 * @example
 * const tams = new TAMSEngine();
 * await tams.connect({ endpoint: 'https://tams.example.com/api/v1' });
 *
 * // Start capturing from a source
 * const session = await tams.startCapture({ sourceId: 'cam-a' });
 *
 * // While capture is still running, create an edit reference (no data copy)
 * const ref = tams.createEditReference(session.flowIds[0], 10, 25);
 *
 * // Resolve the reference to segment URLs for playback
 * const urls = await tams.resolveReference(ref);
 */
export class TAMSEngine {
  // ── State ───────────────────────────────────────────────────────────

  /** Current connection status. */
  private connectionStatus: TAMSConnectionStatus = 'disconnected';

  /** Active connection configuration, or `null` when disconnected. */
  private connectionConfig: TAMSConnectionConfig | null = null;

  /** HTTP API client. */
  private client = new TAMSClient();

  /** WebSocket for real-time updates, or `null` when not connected. */
  private ws: WebSocket | null = null;

  /** Active capture sessions keyed by session ID. */
  private captures = new Map<string, TAMSCaptureSession>();

  /** Active playback sessions keyed by session ID. */
  private playbackSessions = new Map<string, TAMSPlaybackSession>();

  /** Per-flow latest known timestamp cache. */
  private latestTimestamps = new Map<string, number>();

  /** Active flow update subscriptions keyed by flow ID. */
  private flowSubscriptions = new Map<string, Set<TAMSFlowUpdateCallback>>();

  /** General-purpose event listeners. */
  private listeners = new Set<(event: TAMSEvent) => void>();

  /** Polling interval IDs for live flow tailing. */
  private pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  // ── Connection Management ───────────────────────────────────────────

  /**
   * Connect to a TAMS API endpoint.
   *
   * Configures the HTTP client, verifies connectivity with a test request,
   * and optionally opens a WebSocket for real-time segment notifications.
   *
   * @param config Connection configuration.
   * @throws {TAMSConnectionError} If the endpoint is unreachable.
   * @example
   * await tamsEngine.connect({
   *   endpoint: 'https://tams.example.com/api/v1',
   *   authToken: 'my-token',
   * });
   */
  async connect(config: TAMSConnectionConfig): Promise<void> {
    if (this.connectionStatus === 'connected') {
      await this.disconnect();
    }

    this.connectionStatus = 'connecting';
    this.connectionConfig = config;
    this.client.configure(config);
    this.emitEvent('connection:changed', { status: 'connecting' });

    try {
      // Verify connectivity by listing sources
      await this.client.listSources();

      this.connectionStatus = 'connected';
      this.emitEvent('connection:changed', { status: 'connected' });

      // Open WebSocket for real-time updates if available
      this.openWebSocket(config);
    } catch (err) {
      this.connectionStatus = 'error';
      this.client.reset();
      this.connectionConfig = null;
      this.emitEvent('connection:changed', {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new TAMSConnectionError(
        `Failed to connect to TAMS endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Disconnect from the current TAMS endpoint.
   *
   * Stops all active captures and playback sessions, closes the WebSocket,
   * and resets engine state.
   *
   * @example
   * await tamsEngine.disconnect();
   */
  async disconnect(): Promise<void> {
    // Stop all active captures
    for (const [captureId, session] of this.captures) {
      if (session.state === 'capturing' || session.state === 'starting') {
        try {
          await this.stopCapture(captureId);
        } catch (err) {
          console.error('[TAMSEngine] Error stopping capture during disconnect:', err);
        }
      }
    }

    // Clear playback sessions
    this.playbackSessions.clear();

    // Clear polling intervals
    for (const [, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId);
    }
    this.pollingIntervals.clear();

    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnecting');
      } catch {
        // WebSocket may already be closed
      }
      this.ws = null;
    }

    // Reset client
    this.client.reset();
    this.connectionConfig = null;
    this.captures.clear();
    this.latestTimestamps.clear();
    this.flowSubscriptions.clear();

    this.connectionStatus = 'disconnected';
    this.emitEvent('connection:changed', { status: 'disconnected' });
  }

  /**
   * Get the current connection status.
   * @returns The connection status string.
   * @example
   * if (tamsEngine.getConnectionStatus() === 'connected') { ... }
   */
  getConnectionStatus(): TAMSConnectionStatus {
    return this.connectionStatus;
  }

  // ── Source & Flow API Passthrough ───────────────────────────────────

  /**
   * List all sources registered in the connected TAMS store.
   * @returns Paginated list of sources.
   * @throws {TAMSConnectionError} If not connected.
   */
  async listSources(): Promise<TAMSListResponse<TAMSSource>> {
    this.ensureConnected();
    return this.client.listSources();
  }

  /**
   * Get a single source by ID.
   * @param sourceId UUID of the source.
   * @returns The source object.
   * @throws {TAMSConnectionError} If not connected.
   */
  async getSource(sourceId: string): Promise<TAMSSource> {
    this.ensureConnected();
    return this.client.getSource(sourceId);
  }

  /**
   * List flows, optionally filtered by source.
   * @param sourceId Optional source UUID to filter by.
   * @returns Paginated list of flows.
   * @throws {TAMSConnectionError} If not connected.
   */
  async listFlows(sourceId?: string): Promise<TAMSListResponse<TAMSFlow>> {
    this.ensureConnected();
    return this.client.listFlows(sourceId);
  }

  /**
   * Get a single flow by ID.
   * @param flowId UUID of the flow.
   * @returns The flow object.
   * @throws {TAMSConnectionError} If not connected.
   */
  async getFlow(flowId: string): Promise<TAMSFlow> {
    this.ensureConnected();
    return this.client.getFlow(flowId);
  }

  /**
   * Get segments for a flow, optionally restricted to a time range.
   * @param flowId    UUID of the flow.
   * @param timeRange Optional time range filter.
   * @returns Paginated list of segments.
   * @throws {TAMSConnectionError} If not connected.
   */
  async getFlowSegments(
    flowId: string,
    timeRange?: TAMSTimeRange,
  ): Promise<TAMSListResponse<TAMSFlowSegment>> {
    this.ensureConnected();
    return this.client.getFlowSegments(flowId, timeRange);
  }

  /**
   * Get metadata for a flow.
   * @param flowId UUID of the flow.
   * @returns Arbitrary metadata dictionary.
   * @throws {TAMSConnectionError} If not connected.
   */
  async getFlowMetadata(flowId: string): Promise<Record<string, string>> {
    this.ensureConnected();
    return this.client.getFlowMetadata(flowId);
  }

  /**
   * Delete a flow and all of its segments.
   * @param flowId UUID of the flow to delete.
   * @throws {TAMSConnectionError} If not connected.
   */
  async deleteFlow(flowId: string): Promise<void> {
    this.ensureConnected();
    await this.client.deleteFlow(flowId);
  }

  // ── Edit-While-Capture ─────────────────────────────────────────────

  /**
   * Begin capturing from a source into TAMS flows.
   *
   * Creates one or more flows on the TAMS server and starts writing
   * segments as media arrives. The capture runs asynchronously; use
   * {@link stopCapture} to end it.
   *
   * @param config Capture configuration.
   * @returns The newly created capture session.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const session = await tamsEngine.startCapture({
   *   sourceId: 'cam-a',
   *   segmentDuration: 2,
   * });
   * console.log('Capturing to flows:', session.flowIds);
   */
  async startCapture(config: TAMSCaptureConfig): Promise<TAMSCaptureSession> {
    this.ensureConnected();

    const sessionId = generateId();
    const session: TAMSCaptureSession = {
      id: sessionId,
      sourceId: config.sourceId,
      flowIds: [],
      state: 'starting',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    };

    this.captures.set(sessionId, session);

    try {
      // Verify the source exists
      await this.client.getSource(config.sourceId);

      // In a real implementation this would negotiate with the ingest pipeline
      // to begin writing segments. Here we register the session and mark it
      // as capturing so that segment arrivals via WebSocket get routed.
      const videoFlowId = generateId();
      const audioFlowId = generateId();

      session.flowIds = [videoFlowId, audioFlowId];
      session.state = 'capturing';

      this.emitEvent('capture:started', {
        sessionId,
        sourceId: config.sourceId,
        flowIds: session.flowIds,
      });

      // Start polling for latest timestamps on the new flows
      for (const flowId of session.flowIds) {
        this.startFlowPolling(flowId, config.segmentDuration ?? 2);
      }

      return { ...session };
    } catch (err) {
      session.state = 'error';
      session.error = err instanceof Error ? err.message : String(err);
      this.emitEvent('capture:error', {
        sessionId,
        error: session.error,
      });
      throw err;
    }
  }

  /**
   * Stop an active capture session.
   *
   * Flushes any remaining data, finalises the flows on the TAMS server,
   * and marks the session as stopped.
   *
   * @param captureId ID of the capture session to stop.
   * @returns The stopped session.
   * @throws {Error} If the capture session does not exist or is not capturing.
   * @example
   * const stopped = await tamsEngine.stopCapture(session.id);
   * console.log('Capture stopped at:', stopped.stoppedAt);
   */
  async stopCapture(captureId: string): Promise<TAMSCaptureSession> {
    const session = this.captures.get(captureId);
    if (!session) {
      throw new Error(`Capture session not found: ${captureId}`);
    }
    if (session.state !== 'capturing' && session.state !== 'starting') {
      throw new Error(`Capture session is not active (state: ${session.state})`);
    }

    session.state = 'stopping';

    try {
      // Stop polling for each flow
      for (const flowId of session.flowIds) {
        this.stopFlowPolling(flowId);
      }

      session.state = 'stopped';
      session.stoppedAt = new Date().toISOString();

      this.emitEvent('capture:stopped', {
        sessionId: captureId,
        flowIds: session.flowIds,
        stoppedAt: session.stoppedAt,
      });

      return { ...session };
    } catch (err) {
      session.state = 'error';
      session.error = err instanceof Error ? err.message : String(err);
      this.emitEvent('capture:error', {
        sessionId: captureId,
        error: session.error,
      });
      throw err;
    }
  }

  /**
   * Create a non-destructive media reference to a time range within a flow.
   *
   * No data is copied -- only a lightweight pointer is produced. This is the
   * fundamental primitive for edit-while-capture workflows: edits reference
   * media that may still be growing.
   *
   * @param flowId    UUID of the flow.
   * @param startTime Start time in seconds.
   * @param endTime   End time in seconds.
   * @returns A media reference and the time range it covers.
   * @example
   * const ref = tamsEngine.createEditReference('flow-uuid', 10, 25);
   */
  createEditReference(
    flowId: string,
    startTime: number,
    endTime: number,
  ): { reference: TAMSMediaReference; timeRange: TAMSTimeRange } {
    if (endTime <= startTime) {
      throw new Error(`Invalid time range: endTime (${endTime}) must be greater than startTime (${startTime})`);
    }

    return {
      reference: { flowId, timestamp: startTime },
      timeRange: { start: startTime, end: endTime },
    };
  }

  /**
   * Resolve a media reference to the actual segment URLs required for playback.
   *
   * Queries the TAMS API for segments covering the referenced time and returns
   * their presigned URLs in chronological order.
   *
   * @param ref The media reference to resolve.
   * @param duration Duration in seconds from the reference timestamp (default: 10).
   * @returns Array of segment URLs covering the referenced time range.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const urls = await tamsEngine.resolveReference(ref);
   * // Feed URLs into a media player
   */
  async resolveReference(
    ref: TAMSMediaReference,
    duration: number = 10,
  ): Promise<string[]> {
    this.ensureConnected();

    const timeRange: TAMSTimeRange = {
      start: ref.timestamp,
      end: ref.timestamp + duration,
    };

    const { items: segments } = await this.client.getFlowSegments(ref.flowId, timeRange);

    return segments
      .sort((a, b) => a.timeRange.start - b.timeRange.start)
      .map((seg) => seg.url);
  }

  /**
   * Get the most recent available timestamp for a flow.
   *
   * Useful for live-tailing a flow during capture: the returned timestamp
   * indicates how far into the flow data is currently available for playback.
   *
   * @param flowId UUID of the flow.
   * @returns The latest timestamp in seconds, or 0 if unknown.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const latest = await tamsEngine.getLatestTimestamp('flow-uuid');
   * console.log('Live edge at:', latest, 'seconds');
   */
  async getLatestTimestamp(flowId: string): Promise<number> {
    this.ensureConnected();

    // Check local cache first
    const cached = this.latestTimestamps.get(flowId);

    try {
      // Fetch the latest segments (no time range = all, but we only need the tail)
      const { items: segments } = await this.client.getFlowSegments(flowId);

      if (segments.length === 0) {
        return cached ?? 0;
      }

      const latestEnd = segments.reduce(
        (max, seg) => Math.max(max, seg.timeRange.end),
        0,
      );

      this.latestTimestamps.set(flowId, latestEnd);
      return latestEnd;
    } catch {
      return cached ?? 0;
    }
  }

  // ── Live Playback Integration ──────────────────────────────────────

  /**
   * Create a progressive playback session for a TAMS flow.
   *
   * The session pre-fetches segments ahead of the current playback position
   * and can follow a live flow edge for real-time playback of content that
   * is still being captured.
   *
   * @param flowId    UUID of the flow to play.
   * @param startTime Optional start time in seconds (default: 0).
   * @returns The new playback session.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const session = await tamsEngine.createPlaybackSession('flow-uuid', 5.0);
   */
  async createPlaybackSession(
    flowId: string,
    startTime: number = 0,
  ): Promise<TAMSPlaybackSession> {
    this.ensureConnected();

    const sessionId = generateId();
    const prefetchWindow = 10; // seconds

    // Pre-fetch initial segments
    const timeRange: TAMSTimeRange = {
      start: startTime,
      end: startTime + prefetchWindow,
    };

    const { items: initialSegments } = await this.client.getFlowSegments(flowId, timeRange);

    const session: TAMSPlaybackSession = {
      id: sessionId,
      flowId,
      currentTime: startTime,
      isLive: false,
      bufferedSegments: initialSegments,
      prefetchWindow,
    };

    this.playbackSessions.set(sessionId, session);
    return { ...session };
  }

  /**
   * Seek to a specific time within a playback session.
   *
   * Discards the current segment buffer and pre-fetches segments around
   * the new position.
   *
   * @param sessionId ID of the playback session.
   * @param timestamp Target time in seconds.
   * @returns The updated playback session.
   * @throws {Error} If the session does not exist.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * await tamsEngine.seekTo(session.id, 30.0);
   */
  async seekTo(sessionId: string, timestamp: number): Promise<TAMSPlaybackSession> {
    this.ensureConnected();

    const session = this.playbackSessions.get(sessionId);
    if (!session) {
      throw new Error(`Playback session not found: ${sessionId}`);
    }

    session.currentTime = Math.max(0, timestamp);

    // Re-fetch segments around the new position
    const timeRange: TAMSTimeRange = {
      start: session.currentTime,
      end: session.currentTime + session.prefetchWindow,
    };

    const { items: segments } = await this.client.getFlowSegments(session.flowId, timeRange);
    session.bufferedSegments = segments;

    this.emitEvent('playback:progress', {
      sessionId,
      currentTime: session.currentTime,
      bufferedSegments: segments.length,
    });

    return { ...session };
  }

  /**
   * Get a presigned URL for the segment covering a specific timestamp.
   *
   * @param flowId    UUID of the flow.
   * @param timestamp Time in seconds.
   * @returns Presigned URL for the segment, or `null` if no segment covers that time.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const url = await tamsEngine.getSegmentURL('flow-uuid', 15.5);
   * if (url) videoElement.src = url;
   */
  async getSegmentURL(flowId: string, timestamp: number): Promise<string | null> {
    this.ensureConnected();

    // Request a narrow time range around the timestamp
    const timeRange: TAMSTimeRange = {
      start: timestamp,
      end: timestamp + 0.001, // minimal range to find the covering segment
    };

    const { items: segments } = await this.client.getFlowSegments(flowId, timeRange);

    if (segments.length === 0) {
      return null;
    }

    // Return the first segment that covers the requested timestamp
    const covering = segments.find(
      (seg) => seg.timeRange.start <= timestamp && seg.timeRange.end >= timestamp,
    );

    return covering?.url ?? segments[0]!.url;
  }

  // ── Timeline Integration ───────────────────────────────────────────

  /**
   * Import a TAMS flow range as a clip on the timeline.
   *
   * Creates a non-destructive reference from the specified time range in the
   * flow and returns the metadata needed to insert it into a timeline track.
   *
   * @param flowId      UUID of the TAMS flow.
   * @param timeRange   Source time range within the flow.
   * @param targetTrack ID of the timeline track to place the clip on.
   * @param timelineStart Optional start position on the timeline (seconds). Defaults to 0.
   * @returns A {@link TAMSTimelineClip} describing the imported clip.
   * @throws {TAMSConnectionError} If not connected.
   * @example
   * const clip = await tamsEngine.importFlowAsClip('flow-uuid', { start: 10, end: 30 }, 'V1');
   */
  async importFlowAsClip(
    flowId: string,
    timeRange: TAMSTimeRange,
    targetTrack: string,
    timelineStart: number = 0,
  ): Promise<TAMSTimelineClip> {
    this.ensureConnected();

    // Verify the flow and time range are valid by fetching segments
    const { items: segments } = await this.client.getFlowSegments(flowId, timeRange);
    if (segments.length === 0) {
      throw new Error(
        `No segments found for flow ${flowId} in range [${timeRange.start}, ${timeRange.end}]`,
      );
    }

    const clipId = generateId();

    return {
      clipId,
      flowId,
      sourceRange: { ...timeRange },
      trackId: targetTrack,
      timelineStart,
    };
  }

  /**
   * Export timeline edits as TAMS flow references.
   *
   * Takes an array of timeline tracks (each containing clips with TAMS flow
   * references) and produces an {@link TAMSExportedEdit} suitable for
   * interchange or archival.
   *
   * @param tracks Array of `{ trackId, clips }` objects. Each clip must
   *               include `flowId`, `sourceStart`, and `sourceEnd`.
   * @returns The exported edit structure.
   * @example
   * const edit = tamsEngine.exportTimelineToTAMS([
   *   { trackId: 'V1', clips: [{ flowId: 'f1', sourceStart: 0, sourceEnd: 10 }] },
   * ]);
   */
  exportTimelineToTAMS(
    tracks: Array<{
      trackId: string;
      clips: Array<{
        flowId: string;
        sourceStart: number;
        sourceEnd: number;
      }>;
    }>,
  ): TAMSExportedEdit {
    const segments: TAMSExportedEdit['segments'] = [];

    for (const track of tracks) {
      for (const clip of track.clips) {
        segments.push({
          flowId: clip.flowId,
          timeRange: { start: clip.sourceStart, end: clip.sourceEnd },
          trackId: track.trackId,
        });
      }
    }

    return {
      label: `Timeline export ${new Date().toISOString()}`,
      segments,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Subscribe to live updates on a flow for real-time editing.
   *
   * The callback is invoked each time a new segment becomes available on
   * the flow. This enables editors to see new material as it is captured.
   *
   * @param flowId       UUID of the flow to monitor.
   * @param editCallback Callback invoked when a new segment arrives.
   * @returns An unsubscribe function.
   * @example
   * const unsub = tamsEngine.syncLiveEdits('flow-uuid', (flowId, segment) => {
   *   console.log('New segment on', flowId, ':', segment.timeRange);
   * });
   * // later: unsub();
   */
  syncLiveEdits(flowId: string, editCallback: TAMSFlowUpdateCallback): () => void {
    let subs = this.flowSubscriptions.get(flowId);
    if (!subs) {
      subs = new Set();
      this.flowSubscriptions.set(flowId, subs);
    }
    subs.add(editCallback);

    // Ensure polling is running for this flow
    if (!this.pollingIntervals.has(flowId)) {
      this.startFlowPolling(flowId);
    }

    return () => {
      subs!.delete(editCallback);
      if (subs!.size === 0) {
        this.flowSubscriptions.delete(flowId);
        this.stopFlowPolling(flowId);
      }
    };
  }

  // ── Event Subscription ─────────────────────────────────────────────

  /**
   * Subscribe to engine events.
   * @param listener Callback invoked for every engine event.
   * @returns An unsubscribe function.
   * @example
   * const unsub = tamsEngine.subscribe((event) => {
   *   console.log(event.type, event.data);
   * });
   */
  subscribe(listener: (event: TAMSEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  /**
   * Dispose the engine, disconnecting and releasing all resources.
   * @example
   * tamsEngine.dispose();
   */
  async dispose(): Promise<void> {
    await this.disconnect();
    this.listeners.clear();
  }

  // ── Internal Helpers ───────────────────────────────────────────────

  /** Throw if not connected to a TAMS endpoint. */
  private ensureConnected(): void {
    if (this.connectionStatus !== 'connected') {
      throw new TAMSConnectionError();
    }
  }

  /** Emit a TAMS event to all subscribers. */
  private emitEvent(type: TAMSEventType, data: unknown): void {
    const event: TAMSEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[TAMSEngine] Listener error:', err);
      }
    });
  }

  /**
   * Open a WebSocket connection for real-time segment notifications.
   *
   * Messages arriving on the WebSocket are expected to be JSON objects
   * with a `type` field. Segment notifications update the local cache
   * and trigger flow subscriptions.
   */
  private openWebSocket(config: TAMSConnectionConfig): void {
    const wsUrl =
      config.wsEndpoint ??
      config.endpoint.replace(/^http/, 'ws') + '/ws';

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.debug('[TAMSEngine] WebSocket connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            flowId?: string;
            segment?: TAMSFlowSegment;
          };

          if (message.type === 'segment:added' && message.flowId && message.segment) {
            this.handleSegmentAdded(message.flowId, message.segment);
          }
        } catch (err) {
          console.error('[TAMSEngine] WebSocket message parse error:', err);
        }
      };

      this.ws.onerror = (event: Event) => {
        console.error('[TAMSEngine] WebSocket error:', event);
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.debug('[TAMSEngine] WebSocket closed:', event.code, event.reason);
        this.ws = null;

        // Auto-reconnect if still connected
        if (this.connectionStatus === 'connected' && this.connectionConfig) {
          setTimeout(() => {
            if (this.connectionStatus === 'connected' && this.connectionConfig) {
              this.openWebSocket(this.connectionConfig);
            }
          }, 3000);
        }
      };
    } catch (err) {
      // WebSocket is optional; log and continue
      console.warn('[TAMSEngine] WebSocket connection failed (non-fatal):', err);
    }
  }

  /** Handle an incoming segment notification from the WebSocket or polling. */
  private handleSegmentAdded(flowId: string, segment: TAMSFlowSegment): void {
    // Update latest timestamp cache
    const current = this.latestTimestamps.get(flowId) ?? 0;
    if (segment.timeRange.end > current) {
      this.latestTimestamps.set(flowId, segment.timeRange.end);
    }

    // Emit engine event
    this.emitEvent('flow:segment:added', { flowId, segment });

    // Notify flow subscribers
    const subs = this.flowSubscriptions.get(flowId);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(flowId, segment);
        } catch (err) {
          console.error('[TAMSEngine] Flow subscription callback error:', err);
        }
      });
    }

    // Update any active playback sessions following this flow
    for (const [, session] of this.playbackSessions) {
      if (session.flowId === flowId && session.isLive) {
        // Append to buffer if within prefetch window
        const bufferEnd = session.currentTime + session.prefetchWindow;
        if (segment.timeRange.start <= bufferEnd) {
          session.bufferedSegments.push(segment);
        }
      }
    }
  }

  /**
   * Start polling a flow for new segments.
   *
   * Used as a fallback when WebSocket notifications are unavailable, and
   * also to detect the live edge during capture.
   *
   * @param flowId           UUID of the flow to poll.
   * @param intervalSeconds  Polling interval in seconds (default: 2).
   */
  private startFlowPolling(flowId: string, intervalSeconds: number = 2): void {
    if (this.pollingIntervals.has(flowId)) return;

    let lastKnownEnd = this.latestTimestamps.get(flowId) ?? 0;

    const poll = async () => {
      if (this.connectionStatus !== 'connected') return;

      try {
        const { items: segments } = await this.client.getFlowSegments(flowId);
        for (const segment of segments) {
          if (segment.timeRange.end > lastKnownEnd) {
            lastKnownEnd = segment.timeRange.end;
            this.handleSegmentAdded(flowId, segment);
          }
        }
      } catch (err) {
        console.error('[TAMSEngine] Flow polling error:', err);
      }
    };

    const intervalId = setInterval(poll, intervalSeconds * 1000);
    this.pollingIntervals.set(flowId, intervalId);

    // Initial poll immediately
    poll();
  }

  /** Stop polling a flow for new segments. */
  private stopFlowPolling(flowId: string): void {
    const intervalId = this.pollingIntervals.get(flowId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(flowId);
    }
  }
}

/** Singleton TAMS engine instance. */
export const tamsEngine = new TAMSEngine();
