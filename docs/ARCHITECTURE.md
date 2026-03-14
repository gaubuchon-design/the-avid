# The Avid -- Architecture

## 1. Project Overview

The Avid is a professional cross-platform video editing platform with AI-powered editing features. It is built as a monorepo managed by Turborepo with npm workspaces. The primary application target is the web (React 18 + Vite), with additional Electron desktop and Expo/React Native mobile shells sharing core logic through internal packages.

## 2. Monorepo Structure

```
the-avid/
├── apps/
│   ├── web/          -- React 18 + Vite web application (primary)
│   ├── desktop/      -- Electron desktop wrapper with native GPU access
│   ├── mobile/       -- Expo/React Native mobile companion app
│   └── api/          -- Express + Prisma backend API
├── packages/
│   ├── core/         -- Shared types, utilities, and domain logic
│   ├── ui/           -- Shared UI hooks and theme tokens
│   └── render-agent/ -- Distributed rendering node agent
└── docs/             -- Documentation
```

### App Responsibilities

| App | Stack | Role |
|-----|-------|------|
| `web` | React 18, Vite, Zustand, Immer | Primary editing UI, timeline, monitors, panels |
| `desktop` | Electron | Native GPU detection (NVIDIA/AMD/Intel/Apple), hardware encoding |
| `mobile` | Expo / React Native | Simplified companion editor for review and light edits |
| `api` | Express, Prisma, PostgreSQL | Authentication, project storage, AI job queue, collaboration |

### Package Responsibilities

| Package | Purpose |
|---------|---------|
| `core` | Shared TypeScript types, domain constants, utility functions, and the canonical media asset contract |
| `ui` | Shared React hooks, theme tokens, design-system primitives |
| `render-agent` | Distributed rendering node that connects via WebSocket for parallel encoding |

### Canonical Media Backbone

The shared project/media schema now centers on a canonical asset record in `@mcua/core` rather than treating imported media as one path plus a few loose metadata fields.

- `AssetRecord` is the shared contract that carries `assetClass`, `supportTier`, `references`, `streams`, `variants`, `capabilityReport`, rational `timebase`, `colorDescriptor`, and `graphicDescriptor`.
- Assets can now explicitly model `video`, `audio`, `subtitle`, `bitmap`, `vector`, and `layered-graphic` sources while preserving their canonical source documents.
- Desktop ingest populates stream-level metadata from `ffprobe`, including codec, reel, timecode, channel layout, frame cadence, and color metadata.
- Helper code resolves playback and primary paths through canonical `VariantRecord` and `MediaReference` data first, then falls back to legacy path fields.

This backbone is the first layer of the universal media backend: it gives web, desktop, API, and worker surfaces a shared vocabulary for source identity, editability, and variant selection before Prompt 2 introduces the dedicated `media-backend` workspace.

## 3. State Management

The frontend uses **Zustand + Immer** for state management. Every store follows the pattern:

```typescript
create<State & Actions>()(immer((set, get) => ({
  // state fields
  // action methods that call set() with Immer drafts
})))
```

### Store Inventory

| Store | File | Responsibility |
|-------|------|----------------|
| **Editor** | `editor.store.ts` | Tracks, clips, bins, playhead, selection, zoom, scroll, UI state |
| **AI** | `ai.store.ts` | Chat messages, agent plan, tool call results, token tracking |
| **Audio** | `audio.store.ts` | Per-track audio routing state, EQ, meters, solo/mute |
| **Collaboration** | `collab.store.ts` | Connected users, cursor positions, edit locks, chat |
| **Color** | `color.store.ts` | Color grading node graph, saved looks, scopes |
| **Effects** | `effects.store.ts` | Applied effects, keyframe state, effect browser |
| **Player** | `player.store.ts` | Playback transport state, in/out points, active monitor, scopes |
| **Auth** | `auth.store.ts` | Current user, JWT tokens, login state |

### Design Principles

- **Flat stores**: No deeply nested state trees. Each store is a flat object for optimal re-render performance via Zustand's shallow equality selectors.
- **Co-located actions**: Actions live alongside state in the same `create()` call.
- **Immer drafts**: All mutations use Immer's `set()` for safe immutable updates without spread boilerplate.

## 4. Engine Singleton Pattern

Each domain has a **singleton engine class** exported as a module-level instance. Engines encapsulate business logic that is independent of React rendering.

### Engine Inventory

| Engine | File | Singleton Export | Responsibility |
|--------|------|-----------------|----------------|
| EditEngine | `EditEngine.ts` | `editEngine` | Command-pattern undo/redo stack |
| SnapEngine | `SnapEngine.ts` | `snapEngine` | Magnetic snap-to-grid / snap-to-edge on the timeline |
| PlaybackEngine | `PlaybackEngine.ts` | `playbackEngine` | RAF-driven playback loop, JKL shuttle, timecode |
| ColorEngine | `ColorEngine.ts` | `colorEngine` | Node-graph colour grading pipeline, looks, stills |
| AudioEngine | `AudioEngine.ts` | `audioEngine` | Web Audio API multi-track routing, metering, EQ, compressor |
| EffectsEngine | `EffectsEngine.ts` | `effectsEngine` | Effect definitions, instances, keyframe interpolation |
| ExportEngine | `ExportEngine.ts` | `exportEngine` | Encoding presets, export jobs, caption generation |
| PluginRegistry | `PluginRegistry.ts` | `pluginRegistry` | Third-party effect/tool registration |
| AdminEngine | `AdminEngine.ts` | `adminEngine` | Usage analytics, user management |
| PlatformCapabilities | `PlatformCapabilities.ts` | `platform` | Runtime feature detection (WebGPU, WebCodecs, etc.) |

### Communication Pattern

Engines communicate with Zustand stores via a **subscribe/notify** pattern:

```
UI Component --> calls engine method
Engine        --> performs business logic
Engine        --> calls store.setState() or notifies subscribers
Store         --> triggers React re-render via selector
```

Engines expose a `subscribe(callback)` method that returns an unsubscribe function. UI components can subscribe to engine state changes without polling.

## 5. Command Pattern (Undo/Redo)

The `EditEngine` manages undo/redo through the Command pattern.

### Command Interface

```typescript
interface Command {
  readonly description: string;
  execute(): void;
  undo(): void;
}
```

### Built-in Commands (12)

| # | Command | Description |
|---|---------|-------------|
| 1 | `AddClipCommand` | Add a clip to a track |
| 2 | `RemoveClipCommand` | Remove a clip, capturing state for undo |
| 3 | `MoveClipCommand` | Move a clip to a new track and/or position |
| 4 | `TrimClipLeftCommand` | Trim the left (start) edge of a clip |
| 5 | `TrimClipRightCommand` | Trim the right (end) edge of a clip |
| 6 | `SplitClipCommand` | Split a clip at a given time, creating two clips |
| 7 | `AddTrackCommand` | Add a new track to the timeline |
| 8 | `RemoveTrackCommand` | Remove a track, preserving state for undo |
| 9 | `SlipClipCommand` | Slip a clip's media within its timeline position |
| 10 | `SlideClipCommand` | Slide a clip, adjusting its position and neighbours |
| 11 | `RippleDeleteCommand` | Delete a clip and shift subsequent clips to close the gap |
| 12 | `GroupClipsCommand` | Group multiple clips under a single group ID |

### Execution Flow

1. During drag operations, the UI mutates the store directly for live preview.
2. On `mouseup`, the UI creates a `Command` capturing the before/after state and calls `editEngine.execute(command)`.
3. The command is pushed onto the undo stack and the redo stack is cleared.
4. `Cmd+Z` / `Ctrl+Z` triggers `editEngine.undo()`.
5. `Cmd+Shift+Z` / `Ctrl+Y` triggers `editEngine.redo()`.
6. The undo stack is capped at 100 entries by default (oldest entries are dropped).

## 6. Worker Communication

The timeline renderer uses an **OffscreenCanvas** transferred to a Web Worker for high-performance rendering.

### Message Protocol

```typescript
// Main thread -> Worker
type MainToWorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'update'; state: TimelineRenderState }
  | { type: 'destroy' };

// Worker -> Main thread
type WorkerToMainMsg =
  | { type: 'ready' }
  | { type: 'frame'; timestamp: number };
```

### React Strict-Mode Handling

React 18 strict mode double-mounts components in development. The timeline canvas handles this by creating the `<canvas>` element programmatically (not via JSX) and transferring it to the worker on mount, ensuring only one worker holds the canvas at a time.

## 7. CSS Design System

The visual design is implemented entirely with **CSS custom properties** defined in `design-system.css`.

### Surface Hierarchy

The UI uses a layered surface system from darkest to lightest:

| Token | Role | Typical Use |
|-------|------|-------------|
| `--bg-void` | Deepest background | Behind all panels |
| `--bg-canvas` | Canvas background | Monitor/viewer areas |
| `--bg-base` | Base panel background | Panel bodies |
| `--bg-surface` | Elevated surface | Cards, dialogs |
| `--bg-raised` | Raised elements | Buttons, inputs |
| `--bg-elevated` | Higher elevation | Dropdowns, popovers |
| `--bg-overlay` | Overlay | Modals, toasts |

### Brand Colors

| Token | Value | Use |
|-------|-------|-----|
| `--brand` | `#6d4cfa` | Primary brand violet |
| `--brand-bright` | Lighter variant | Hover states, accents |
| `--brand-dim` | Darker variant | Active states |

### Track Colors

| Track Type | Color |
|------------|-------|
| Video | Blue (`#5b6af5`) |
| Audio | Green |
| Effect | Orange |
| Subtitle | Cyan |
| Graphic | Pink |

### Typography

| Token | Font | Use |
|-------|------|-----|
| `--font-sans` | DM Sans | UI text, labels, buttons |
| `--font-display` | Syne | Headings, branding |
| `--font-mono` | DM Mono | Timecode, technical values |

### Component Classes

| Class | Purpose |
|-------|---------|
| `.panel` | Container for a dockable panel |
| `.panel-header` | Panel title bar |
| `.panel-title` | Panel heading text |
| `.panel-tabs` | Tab bar within a panel |
| `.btn` | Generic button |
| `.input` | Text input field |
| `.toolbar-btn` | Toolbar icon button |
| `.transport-btn` | Playback transport button |
| `.monitor` | Source/Record monitor container |
| `.track-lane` | Timeline track row |

## 8. Panel Registry

`App.tsx` exports a **panel registry** mapping string identifiers to React components:

```typescript
export const panelRegistry: Record<string, React.ComponentType> = {
  timeline:    TimelinePanel,
  source:      SourceMonitor,
  record:      RecordMonitor,
  color:       ColorPanel,
  audio:       AudioMixer,
  effects:     EffectsPanel,
  ai:          AIAssistantPanel,
  script:      ScriptPanel,
  collab:      CollabPanel,
  export:      ExportPanel,
  marketplace: MarketplacePanel,
  admin:       AdminDashboard,
};
```

This enables the layout system to dynamically instantiate panels by name without importing every component at the layout level.

## 9. AI Integration

### GeminiClient (`ai/GeminiClient.ts`)

The primary AI client uses the **Google Generative AI REST API** (Gemini).

- Requires `VITE_GEMINI_API_KEY` environment variable.
- Supports two models: `gemini-2.5-pro-preview-05-06` (pro) and `gemini-2.0-flash` (flash).
- Provides `chat()`, `streamChat()`, `transcribe()`, and `generateCaptions()` methods.
- Falls back to an offline stub with canned responses when no API key is configured.
- Accepts both native `GeminiTool[]` and legacy `FunctionTool[]` shapes (auto-normalised).

### MCPClient (`ai/MCPClient.ts`)

Model Context Protocol client for external AI service integration. Enables the editor to connect to third-party AI tool servers using the MCP standard.

### AgentEngine

The agentic AI system defines **24 tool declarations** that Gemini can call:

- Timeline manipulation (add/remove/move/trim/split clips)
- Audio analysis (silence removal, loudness normalisation)
- Color grading (auto-match, LUT application)
- Caption generation and transcription
- Bin organisation and rough-cut assembly
- Export and delivery

The agent follows a **plan preview/approval workflow**: Gemini proposes a sequence of tool calls, the user reviews and approves, and only then are the tools executed.

### TranscriptEngine

Manages word-level transcription data with phrase search. Supports phonetic and semantic search across all project media assets.

## 10. Cross-Platform Architecture

| Platform | Runtime | GPU | Notes |
|----------|---------|-----|-------|
| **Web** | React 18 + Vite | WebGPU compute shaders (WGSL) | PWA support, WebCodecs for video decode |
| **Desktop** | Electron | Native GPU detection (NVIDIA/AMD/Intel/Apple Silicon) | NVENC/AMF/QSV hardware encoding via FFmpeg |
| **Mobile** | Expo / React Native | Platform GPU APIs | Simplified editor for review and light edits |

Shared core logic lives in `packages/core`, ensuring type safety and consistency across all platforms.

## 11. GPU Acceleration

### Browser (WebGPU)

- **Color grading**: WGSL compute shaders for real-time lift/gamma/gain, curves, and LUT application.
- **Video decode**: WebCodecs API for hardware-accelerated frame extraction.
- **Fallback**: Canvas 2D when WebGPU is unavailable.

### Desktop (Native)

- **Encoding**: FFmpeg with hardware encoder selection (NVENC for NVIDIA, AMF for AMD, QSV for Intel, VideoToolbox for Apple).
- **Effects**: CUDA (NVIDIA) or OpenCL (AMD/Intel) compute for GPU-accelerated effects.
- **GPU detection**: Native Node.js module probes available GPUs at startup.

### Distributed Rendering

- The `render-agent` package implements a rendering node that connects to the API server via WebSocket.
- Multiple agents can run on different machines for parallel encoding of timeline segments.
- The export engine splits the timeline into chunks, dispatches to available agents, and reassembles the final output.

## 12. Backend API Architecture

The API server (`apps/api`) is built with Express and Prisma ORM backed by PostgreSQL.

### Route Structure

All routes are mounted under `/api/v1`:

| Prefix | Router | Auth | Description |
|--------|--------|------|-------------|
| `/auth` | `authRoutes` | Public + Rate-limited | Registration, login, token refresh, profile |
| `/projects` | `projectRoutes` | Authenticated | CRUD for projects |
| `/projects/:id/timelines` | `timelineRouter` | Authenticated | Timeline and track management |
| `/projects/:id/*` | `collabRouter` | Authenticated | Comments, approvals, edit locks |
| `/projects/:id/publish` | `publishRouter` | Authenticated | Social media publishing |
| `/ai` | `aiRoutes` | Authenticated | AI job queue, transcription, phrase search |
| `/marketplace` | `marketplaceRoutes` | Authenticated | Plugin marketplace |
| `/media` | `mediaRoutes` | Authenticated | Media asset upload and management |

### Middleware Stack

1. **Helmet** -- HTTP security headers
2. **CORS** -- Configurable origin whitelist
3. **Compression** -- gzip response compression
4. **Rate limiting** -- 1000 req/15min general, 20 req/15min for auth
5. **Authentication** -- JWT Bearer token validation
6. **Error handler** -- Structured error responses with error codes

### WebSocket

Real-time collaboration uses WebSocket (via the `ws` library) for:

- Cursor position broadcasting
- Edit lock negotiation
- Live timeline sync between collaborators
- Chat messages
