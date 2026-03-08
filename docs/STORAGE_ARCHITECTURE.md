# Storage Architecture

## Current Model

Project metadata and editorial state are now persisted with a local-first repository per platform:

- Web: IndexedDB object store (`the-avid` / `projects`)
- Desktop: filesystem-backed project store under Electron `userData/projects`
- Mobile: file-backed JSON cache using Expo FileSystem

The shared model and project-shape helpers live in `@mcua/core`. Platform apps own persistence. Projects now carry a schema version in the shared model so storage can evolve without leaving migrations implicit.

## What Is Stored

The current repository persists:

- project schema version
- project metadata
- timeline tracks and clips
- markers
- bins and media metadata
- AI jobs and token balance
- collaborators and settings

It does not yet persist heavy media payloads, proxies, thumbnails, or waveform artifacts outside the lightweight metadata already attached to projects.

## Platform Notes

### Web

- Backing store: IndexedDB
- Reason: async local persistence without blocking the main thread
- Next step: add OPFS for large media-adjacent artifacts and offline cache files

### Desktop

- Backing store: one project package directory per project inside the app data directory
- Current layout:
  - `project.avid.json` manifest
  - `media/managed/` imported local source copies
  - `media/proxies/` optional editorial proxies
  - `media/waveforms/` extracted waveform sidecars
  - `media/indexes/media-index.json` relink-aware media index
  - `exports/` background export outputs
- Reason: durable local persistence, offline media access, backup friendliness, and a clean path toward richer local cache/proxy layouts
- Next step: add cache databases, thumbnails, more resilient watch-folder services, and pinned packaged media-tool binaries for consistent probing and transcoding

### Mobile

- Backing store: Expo FileSystem
- Reason: available dependency surface in this repo without adding another storage dependency
- Next step: move lightweight preference/state caching to AsyncStorage if needed and keep larger project snapshots file-backed

## Remaining Gaps

- No formal multi-step migration runner yet beyond the shared schema-version anchor
- No encryption or secure project package handling yet
- No media-asset blob store yet
- No background sync or conflict resolution yet
