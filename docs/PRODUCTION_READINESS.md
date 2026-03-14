# Production Readiness

This document is a reality check for the current repository state. It describes
what is already strong enough to build on and what still blocks a true
production release.

## Supporting References

- [SPEC_CONFORMANCE_AUDIT.md](SPEC_CONFORMANCE_AUDIT.md)
- [AVID_PARITY_MATRIX.md](AVID_PARITY_MATRIX.md)
- [MEDIA_PIPELINE_ARCHITECTURE.md](MEDIA_PIPELINE_ARCHITECTURE.md)
- [DESKTOP_AUTO_UPDATES.md](DESKTOP_AUTO_UPDATES.md)

## What Is In Good Shape

- Shared schema-first project/media model across web, desktop, and mobile
- Filesystem-backed desktop project packages and local media management
- Desktop ingest with metadata probing, relink identity, waveform extraction,
  poster frames, and thumbnail generation
- Shared editor shell with timeline, bins, monitors, collaboration/version
  history, and workspace layout behavior
- Working monorepo build/type-check/test flows
- Desktop packaging and generic-provider auto-update plumbing

## Current Release Recommendation

If this codebase were shipped in the near term, the honest positioning would be:

- desktop as the primary serious editorial surface
- web as a companion editing/review/collaboration surface
- mobile as a companion review/workflow client

## Release Blockers

- Finishing-grade playback/compositing/export is still incomplete.
- Collaboration persistence exists in the shared model, but a hardened
  multi-user sync backend is not complete.
- Professional interchange/export depth still needs more real-world validation.
- Signing, notarization, installer trust, updater operations, and release
  observability are not fully finished.
- Lint debt remains high across legacy areas of the repo even though type-check
  and test flows are in much better shape.
- Browser-side storage/cache strategy for larger media-adjacent artifacts still
  needs more hardening.

## Operational Notes

- The desktop app now has a real packaging/update path, but production rollout
  still depends on signing/notarization and operational monitoring.
- The API and service layer are broad, but not every surface should be read as
  production-hardened just because it exists in the monorepo.
- Several roadmap/parity documents in `docs/` remain planning material rather
  than ship criteria.

## Recommended Next Steps

1. Finish the media/compositor path that separates “editor prototype” from
   “facility-safe workstation.”
2. Harden collaboration and backend sync semantics.
3. Reduce lint debt in the largest active packages.
4. Complete release operations: signing, notarization, updater verification,
   crash/health reporting.
5. Keep live operational docs in sync with the shipping command surface and repo
   topology.
