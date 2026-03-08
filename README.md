# The Avid

The Avid is a cross-platform editorial application intended to modernize the Avid Media Composer model across desktop, browser, and mobile, with AI-assisted and agentic workflows layered into the core edit experience.

## Current Status

This repository is now a production-directed foundation, not a full parity-complete NLE. It includes a shared project model, local-first persistence across platforms, a usable editorial workspace, script/review/publish surfaces, and native desktop media import and background jobs. It does not yet include a real media engine, enterprise collaboration backend, or finishing-grade interchange/export pipeline.

Dedicated macOS and Windows applications are part of the product strategy. The browser covers collaboration, lightweight editing, and zero-install access. Mobile is a companion for review, approvals, script-led rough cuts, and lightweight editorial tasks.

## Documentation

- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)
- [docs/STORAGE_ARCHITECTURE.md](docs/STORAGE_ARCHITECTURE.md)
- [docs/MEDIA_PIPELINE_ARCHITECTURE.md](docs/MEDIA_PIPELINE_ARCHITECTURE.md)
- [docs/SPEC_CONFORMANCE_AUDIT.md](docs/SPEC_CONFORMANCE_AUDIT.md)
- [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md)
- [docs/AVID_PARITY_MATRIX.md](docs/AVID_PARITY_MATRIX.md)

## Implemented In Repo

- Shared `@mcua/core` project library with seeded projects, project summaries, import/export, and schema-versioned project hydration.
- Browser repository backed by IndexedDB.
- Desktop repository backed by filesystem project packages with local `media/` and `exports/` directories.
- Desktop media pipeline foundation with managed originals, media fingerprints, relink identity, sidecar index manifests, waveform extraction, and best-effort proxy generation when local media tools are available.
- Desktop watch folders, missing-media relink workflows, interchange manifests, and a best-effort screener render path for export packages.
- Mobile repository backed by Expo FileSystem.
- Shared editor workspace with bins, source/record preview, timeline editing, markers, AI jobs, review comments, approvals, transcript/script cues, publish queues, and indexed source-media playback.
- Native desktop flows for media import, local project saving, and background ingest/export job tracking.

## Major Gaps Before Release

- Finishing-grade playback/render/media pipeline: transitions, multilayer compositing, accurate audio mixing, color pipeline, and broader codec support still need to go beyond the current screener-render foundation.
- Professional interchange: AAF, EDL, OMF, DNx workflows, Pro Tools handoff.
- Real-time collaboration, auth, permissions, sync, billing, and observability.
- Finishing-grade audio, VFX, multicam, trimming, and media-management depth.
- CI-backed validation: typecheck, tests, packaging, signing, notarization, update channels.

## Architecture

```text
apps/
  web/      Browser editor and collaboration surface
  desktop/  Electron shell for macOS and Windows
  mobile/   Expo mobile companion
packages/
  core/     Shared editorial types, project model, utilities
  ui/       Shared hooks and design tokens
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Or run individual apps:

```bash
npm run dev:web
npm run dev:desktop
npm run dev:mobile
```

### Build

```bash
npm run build
```

Desktop packaging:

```bash
cd apps/desktop
npm run build:mac
npm run build:win
```

Mobile packaging:

```bash
cd apps/mobile
npm run build:ios
npm run build:android
```

## Product Direction

- Desktop: full editorial workstation with local media access and offline reliability.
- Browser: collaboration, approvals, lightweight editing, and zero-install entry.
- Mobile: review, script/transcript workflows, approvals, and rough-cut support.

## License

MIT
