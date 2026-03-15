# Production Readiness

This document is a reality check for the current repository state. It describes
what is already strong enough to build on and what still blocks a true
production release.

## Supporting References

- [SPEC_CONFORMANCE_AUDIT.md](SPEC_CONFORMANCE_AUDIT.md)
- [AVID_PARITY_MATRIX.md](AVID_PARITY_MATRIX.md)
- [MEDIA_PIPELINE_ARCHITECTURE.md](MEDIA_PIPELINE_ARCHITECTURE.md)
- [DESKTOP_AUTO_UPDATES.md](DESKTOP_AUTO_UPDATES.md)
- [CICD_RELEASE_PIPELINE.md](CICD_RELEASE_PIPELINE.md)

## What Is In Good Shape

- Shared schema-first project/media model across web, desktop, and mobile
- Filesystem-backed desktop project packages and local media management
- Desktop ingest with metadata probing, relink identity, waveform extraction,
  poster frames, and thumbnail generation
- Shared editor shell with timeline, bins, monitors, collaboration/version
  history, and workspace layout behavior
- Working monorepo build/type-check/test flows
- Desktop packaging and generic-provider auto-update plumbing
- CI pipeline with parallelized lint/type-check, coverage reporting, security
  audit, and build artifact size tracking
- Automated release pipeline with release tagging, post-deployment health
  checks, and a consolidated release summary
- Test coverage thresholds enforced across all workspaces (50% statements, 40%
  branches, 45% functions, 50% lines)

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

## QA and Pipeline Status

The CI/CD pipeline now includes:

- **Parallelized CI**: lint, type-check, and security audit run concurrently
- **Coverage enforcement**: all workspaces have vitest coverage thresholds
- **Security auditing**: `npm audit` reports high/critical vulnerabilities in CI
- **Coverage reporting**: per-package coverage summary posted to GitHub Actions
- **Build metrics**: artifact size tracking in CI summaries
- **Release tagging**: automatic `release/<sha>` tags on master deployments
- **Health checks**: post-deployment HTTP health checks for web and API
- **Release summary**: consolidated deployment status table per release

See [CICD_RELEASE_PIPELINE.md](CICD_RELEASE_PIPELINE.md) for full pipeline
documentation.

## Operational Notes

- The desktop app now has a real packaging/update path, but production rollout
  still depends on signing/notarization and operational monitoring.
- The API and service layer are broad, but not every surface should be read as
  production-hardened just because it exists in the monorepo.
- Several roadmap/parity documents in `docs/` remain planning material rather
  than ship criteria.

## Recommended Next Steps

1. Finish the media/compositor path that separates "editor prototype" from
   "facility-safe workstation."
2. Harden collaboration and backend sync semantics.
3. Reduce lint debt in the largest active packages.
4. Complete release operations: signing, notarization, updater verification,
   crash/health reporting.
5. Raise coverage thresholds incrementally as test coverage improves.
6. Keep live operational docs in sync with the shipping command surface and repo
   topology.
