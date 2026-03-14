# Release Notes

This file is a rolling repository milestone summary, not a statement that the
product has shipped as a polished GA release.

## Current Milestone Snapshot

Version line: `0.1.0`

The codebase currently represents a shared editorial-platform prototype with
meaningful desktop/media-runtime work, not just a service architecture scaffold.

## Notable Recent Additions

### Shared Editor / UI

- Shared web/desktop editor shell continues to be the main workstation surface.
- Inspector behavior now adapts more cleanly to selection context and responsive
  layout pressure.
- Timeline clips can consume stored waveform data and video thumbnail tiles from
  ingested assets.
- Smaller screen/window layouts have better stacked/clamped behavior in the
  editor shell.

### Desktop Media Runtime

- Desktop ingest records probe metadata, relink identity, waveform data, and
  sidecar indexes.
- Video ingest now generates poster frames plus thumbnail frames every 10
  seconds for bins and timeline previewing.
- Desktop background jobs cover ingest/export flows and feed progress back into
  the shared editor shell.
- Desktop playback/runtime and export-path groundwork continues to deepen around
  parity-oriented artifacts and manifests.

### Desktop Packaging / Updates

- Electron Builder packaging is wired for macOS, Windows, and Linux artifact
  generation.
- Generic-provider desktop auto-updates are backed by the Vercel update-feed
  service in `services/desktop-update-cdn`.
- Runtime update handling now restores packaged updater request headers
  correctly and surfaces shorter renderer-friendly errors.

### API / Services

- `@mcua/api` exposes auth, projects, media, AI jobs, export/import, and several
  workflow/vertical route groups under `/api/v1`.
- Prisma generation is now tied into API build/type-check flows to reduce
  stale-client failures.
- Agent, knowledge, and local-runtime services remain in-repo and testable, but
  should still be read as supporting/platform work rather than the only
  “product” in the repository.

## What This Is Not Yet

- A fully finished professional NLE release
- A fully unified production AI stack
- A complete finishing/export/interchange system
- A fully productionized collaboration backend

## Related Docs

- [README.md](../README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [PHASE_EXECUTION_STATUS.md](PHASE_EXECUTION_STATUS.md)
- [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
