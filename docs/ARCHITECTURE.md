# Architecture

This document describes the current runtime architecture of The Avid monorepo as
it exists today.

## Overview

The repo is organized around one shared editorial model and several delivery
surfaces:

- `apps/web` for browser editing/review
- `apps/desktop` for the Electron workstation
- `apps/mobile` for the Expo companion experience
- `apps/api` for authenticated/backend workflows
- supporting services for orchestration, search, local AI runtime, and desktop
  updates

The key architectural choice is that the editorial/project/media model lives in
shared packages, while platform-specific shells add persistence, device access,
transport, or deployment-specific behavior.

## Monorepo Structure

```text
apps/
  api/                  # Express API server
  desktop/              # Electron workstation (thin shell)
  mobile/               # Expo companion (thin shell)
  web/                  # Browser editor (thin shell)
libs/
  adapters/             # External system adapters (MC, ProTools, etc.)
  contracts/            # Shared wire types & Zod schemas
  ui-components/        # Agentic UI components
packages/
  core/                 # Canonical editorial data model
  editor/               # Shared editor UI (components, stores, engines, pages)
  media-backend/        # Media schema helpers
  render-agent/         # Render node agent
  ui/                   # Design tokens, theme, shared hooks
services/
  agent-orchestrator/   # Gemini planning engine
  desktop-update-cdn/   # Vercel updater feed
  knowledge-node/       # SQLite+ANN search service
  local-ai-runtime/     # Model runner abstraction
```

## Runtime Surfaces

| Surface | Stack                       | Current Role                                                         |
| ------- | --------------------------- | -------------------------------------------------------------------- |
| Web     | React 18, Vite, Zustand     | Shared browser editor and collaboration/review surface               |
| Desktop | Electron, React             | Shared editor plus native project/media/update/playback integrations |
| Mobile  | Expo / React Native         | Review, approvals, companion workflows                               |
| API     | Express, Prisma, PostgreSQL | Auth, projects, media, AI jobs, vertical workflow endpoints          |

## Shared Product Model

### `@mcua/core`

`@mcua/core` is the canonical application model. It carries:

- project schema and hydration
- bins, clips, tracks, titles, subtitles, collaboration snapshots
- media asset records, technical metadata, fingerprints, thumbnails, waveforms
- audio-layout helpers and export/parity helpers

Both web and desktop editor state ultimately serialize back into this shared
model.

### `@mcua/editor`

`@mcua/editor` is the shared editor UI package. It carries:

- all React components, pages, stores, engines, hooks, and styles
- a platform abstraction layer (`PlatformProvider`, `usePlatform()`)
- everything needed to render the full editorial experience

See [SHARED_UI_ARCHITECTURE.md](SHARED_UI_ARCHITECTURE.md) for the full
specification.

### `@mcua/media-backend`

`@mcua/media-backend` holds shared media-schema helpers used by the
project/media layer. It is part of the data-model foundation rather than a
standalone running service.

## Editor Architecture

The editor UI lives in a single shared package, `@mcua/editor`, imported by
every platform shell. This is documented in detail in
[SHARED_UI_ARCHITECTURE.md](SHARED_UI_ARCHITECTURE.md).

Key layers inside `@mcua/editor`:

- **Platform abstraction** (`src/platform/`) — `PlatformProvider` context that
  each shell uses to inject platform-specific capabilities (filesystem, media
  pipeline, app lifecycle). Components call `usePlatform()` to access these.
- **Components** — React components for workspace, bins, timeline, monitors,
  effects, audio, color, export, and more.
- **Stores** — Zustand stores for editor, player, audio, color, effects, media,
  collaboration, and settings state.
- **Engines** — Singleton domain engines (snap, audio, title, AAF, GPU, etc.)
  that encapsulate editing logic.

Each platform shell is thin:

- `apps/web/` — `BrowserRouter`, auth guards, `PlatformProvider` with browser
  capabilities, PWA registration.
- `apps/desktop/` — `MemoryRouter`, update banner, deep links,
  `PlatformProvider` bridging `electronAPI` into platform capabilities. The
  Electron main process owns native media pipeline, hardware access, and
  auto-updates.
- `apps/mobile/` — Companion review/approval experience.

## Media Pipeline

The desktop app owns the most complete media path today.

Current ingest behavior includes:

- asset fingerprinting and relink identity capture
- `ffprobe`-backed technical metadata when available
- managed-media copy/link workflows inside the desktop project package
- waveform extraction for timeline display
- poster-frame extraction and thumbnail frames every 10 seconds for video
- sidecar media indexes and export-oriented metadata

These behaviors are documented in
[MEDIA_PIPELINE_ARCHITECTURE.md](MEDIA_PIPELINE_ARCHITECTURE.md).

## AI Architecture

The repo currently has more than one AI integration surface:

| Layer    | Current Integration                                                        |
| -------- | -------------------------------------------------------------------------- |
| Web      | Browser-side Gemini client plus MCP WebSocket client                       |
| API      | Server-side OpenAI-configured helpers for transcription/assembly workflows |
| Services | Gemini/template-backed orchestrator, knowledge-node, and local runtime     |

This means “AI” is not one single deployed stack yet. Some paths are
product-facing in the editor, while others remain service-layer
experimentation/prototyping.

## Supporting Services

### `@mcua/api`

- Express application mounted under `/api/v1`
- Prisma + PostgreSQL data layer
- auth, projects, timelines, media, AI jobs, export/import, publish, and
  vertical workflow routes

### `@mcua/agent-orchestrator`

- plan generation
- approval policy evaluation
- tool-call routing
- analytics/token-wallet infrastructure

### `@mcua/knowledge-node`

- metadata/search-oriented service
- shard/mesh/search infrastructure

### `@mcua/local-ai-runtime`

- local model/runtime abstraction layer
- fallback-friendly runtime for capabilities such as transcription/embedding
  workflows

### `@mcua/desktop-update-cdn`

- Vercel-hosted generic-provider update feed for the Electron desktop app

## Desktop Updates

The desktop app uses Electron Builder’s generic updater provider against a
Vercel-backed feed. Runtime state is bridged into the renderer so users can see
checking/downloading/downloaded/error states, and update-auth headers can be
sourced from packaged updater config or environment overrides.

See:

- [DESKTOP_AUTO_UPDATES.md](DESKTOP_AUTO_UPDATES.md)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](VERCEL_DESKTOP_UPDATE_ENDPOINT.md)

## Current Boundaries

The repo already contains a meaningful editor/workstation prototype, but several
areas are intentionally not described here as “done”:

- finishing-grade compositor/render pipeline
- production-ready collaboration sync
- complete interchange/export coverage
- signed/notarized release operations
- consistent AI service unification across browser, API, and service surfaces
