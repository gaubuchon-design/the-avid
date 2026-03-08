# The Avid Production Readiness

## Supporting Audits

- [SPEC_CONFORMANCE_AUDIT.md](./SPEC_CONFORMANCE_AUDIT.md)
- [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md)
- [AVID_PARITY_MATRIX.md](./AVID_PARITY_MATRIX.md)
- [MEDIA_PIPELINE_ARCHITECTURE.md](./MEDIA_PIPELINE_ARCHITECTURE.md)

## Recommendation

The product should ship as:

- A browser application for review, lightweight editing, collaboration, and zero-install access.
- Dedicated macOS and Windows desktop applications for serious editorial work.
- A mobile companion focused on review, logging, approvals, rough cuts, and AI-assisted organization instead of full desktop parity.

## Why Dedicated Desktop Apps Still Matter

Desktop shells are justified here because the product vision depends on capabilities that browsers still handle poorly for a professional NLE:

- Native file system access for large local media volumes, project interchange, and offline workflows.
- Better codec, proxy, and GPU pipeline control for playback, ingest, rendering, and background jobs.
- Predictable windowing, keyboard capture, and device integration for editors working long sessions.
- Native installers, updates, crash logging, and entitlement management for enterprise deployments.

The shared React workspace should remain the primary UI layer, but macOS and Windows should be treated as first-class products, not just wrappers.

## Implemented In This Pass

- Added a shared project library in `@mcua/core` with seeded demo projects, import/export, summaries, and persistence.
- Added project schema versioning in the shared model so persisted project packages have a migration anchor as the application surface expands.
- Added local-first platform repositories:
  - browser via IndexedDB
  - desktop via filesystem-backed Electron project packages
  - mobile via Expo FileSystem cache
- Replaced the web app's hardcoded dashboard/editor data with real project loading and autosave.
- Wired AI job state and token accounting into project state instead of component-local mock state.
- Made bin assets insertable into the timeline so the editor flow is no longer static.
- Moved the desktop renderer onto the richer shared web UI instead of the old placeholder pages.
- Added desktop-native project package handling with a manifest, local media folder, and export history folder.
- Added desktop-native media ingest from the File menu and bin panel, with imported assets copied into each local project package.
- Added a desktop media pipeline foundation with managed originals, technical metadata capture, fingerprints, relink keys, waveform sidecars, and best-effort proxy generation.
- Added desktop watch folders, missing-media relink actions, interchange exports (`EDL`, `OTIO`, audio turnover manifest), and a best-effort screener render in export packages.
- Added desktop background ingest/export job tracking so desktop saves stay local while exports run asynchronously.
- Added desktop file import/export IPC and Electron build scaffolding (`electron.vite.config.ts`, desktop `tsconfig.json`).
- Wired the mobile app to the same shared project library so it reflects actual project data instead of empty mock lists.
- Removed stale duplicate web/desktop code paths that conflicted with the active implementation.

## Remaining Release Blockers

These still need to be finished before the product can honestly be called production-ready:

- Real media engine completion: the repo now has the indexing, watch-folder, relink, and interchange foundation, but it still needs a full timeline compositor, broader codec handling, pinned packaged media tools in release builds, and finishing-grade final render/export output.
- Backend integration: auth, project sync, collaboration, AI execution, permissions, billing.
- Persistence hardening on web/media side: OPFS and large-asset cache layers are still missing.
- Test and build verification: this environment did not have `node`, `npm`, or `pnpm` available, so builds and tests could not be executed.
- Packaging assets: desktop icons, entitlements, notarization/signing, update channels, crash reporting.
- Operational quality: CI, lint/type/test gates, observability, feature flags, migration/versioning strategy.

Versioning is now anchored in the project schema, but a formal forward migration framework is still missing.

## Recommended Next Steps

1. Decide on the source of truth for projects: local-first with background sync, or API-first with offline cache.
2. Stand up a real media pipeline for ingest, proxies, thumbnails, waveform extraction, and export.
3. Add automated typecheck/build/test pipelines and block merges on them.
4. Harden the platform-specific persistence adapters:
   - Browser: IndexedDB plus OPFS for media-adjacent artifacts
   - Desktop: project packages plus local cache/proxy databases
   - Mobile: file-backed project cache with lighter preference storage where needed
5. Define scope boundaries clearly:
   - Desktop: full editorial workstation
   - Browser: collaborative editor and review
   - Mobile: review, approvals, logging, social cutdowns
