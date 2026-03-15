# CI/CD and Release Pipeline

This document describes the full continuous integration, testing, and release
pipeline for The Avid monorepo.

## Workflow Files

| Workflow                                                                | Trigger                                           | Purpose                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| [`ci.yml`](../.github/workflows/ci.yml)                                 | PR to `master`, push to `master`                  | Lint, type-check, test, build, Docker smoke test |
| [`release-train.yml`](../.github/workflows/release-train.yml)           | After CI succeeds on `master`, or manual dispatch | Deploy all surfaces, tag release, health checks  |
| [`desktop-installers.yml`](../.github/workflows/desktop-installers.yml) | Manual dispatch, weekly schedule                  | Standalone desktop installer builds              |

## CI Pipeline (`ci.yml`)

The CI pipeline runs on every PR and push to `master`. Jobs are parallelized for
fast feedback.

### Job Graph

```text
lint ─────────────┐
                   ├──> build ──> docker (PR only)
type-check ───────┘
security-audit  (independent)
test            (independent, matrix: Node 20 + 22)
```

### Jobs

**Lint** — ESLint across all workspaces + Prettier format check.

**Type-check** — TypeScript strict-mode compilation across all workspaces.

**Security Audit** — `npm audit` for production dependencies. Reports
high/critical vulnerability counts in the GitHub Actions summary. Uses
`continue-on-error` so it does not block the pipeline, but surfaces findings.

**Test** — Runs `test:coverage` across all workspaces on Node 20 and 22.
Coverage artifacts are uploaded on Node 20 runs, and a per-package coverage
summary table is written to the GitHub Actions summary.

**Build** — Full monorepo build. Depends on lint and type-check passing first.
Reports build artifact sizes in the summary.

**Docker** — Smoke-test build of the API Docker image (PR only, no push).

### Caching

All jobs use the Turborepo local cache via `actions/cache`. Cache keys are
scoped by job type, OS, and commit SHA with fallback to OS-scoped restore keys.

Remote caching is available when `TURBO_TOKEN` and `TURBO_TEAM` are configured.

## Test Coverage

### Coverage Thresholds

All workspace vitest configs enforce minimum coverage thresholds:

| Metric     | Minimum |
| ---------- | ------- |
| Statements | 50%     |
| Branches   | 40%     |
| Functions  | 45%     |
| Lines      | 50%     |

These are starting-point thresholds. They should be raised as coverage improves.

### Coverage Reporting

- CI runs `test:coverage` which produces `coverage/` directories in each
  workspace
- Coverage summaries (`json-summary` format) are uploaded as artifacts
- A coverage summary table is posted to the GitHub Actions run summary
- Coverage artifacts are retained for 14 days

### Running Coverage Locally

```bash
npm run test:coverage                          # All workspaces
npx turbo run test:coverage --filter=@mcua/core  # Single workspace
```

## Release Pipeline (`release-train.yml`)

After CI succeeds on `master`, the release train runs automatically. It can also
be triggered manually.

### Release Steps

1. **Resolve release context** — Determines the release SHA and ref.
2. **Tag release** — Creates a `release/<short-sha>` git tag.
3. **Deploy web app** — Vercel production deployment with post-deploy health
   check (HTTP 200 within 5 attempts).
4. **Deploy desktop update endpoint** — Vercel deployment of the updater feed.
5. **Build and push API image** — Docker build + push to GHCR with `sha-<short>`
   and `latest` tags.
6. **Trigger API rollout** — POST to deploy hook with image ref. Includes
   post-deploy health check when `API_HEALTH_URL` is configured.
7. **Build desktop installers** — macOS (macos-14) and Windows (windows-2022) in
   parallel.
8. **Publish desktop update feed** — Uploads to Vercel Blob, cleans stale
   artifacts.
9. **Publish mobile OTA update** — Expo EAS update on production branch.
10. **Kick off mobile native builds** — Optional, gated on
    `MOBILE_BUILD_ON_MASTER=true`.
11. **Release summary** — Aggregated status table of all deployment components.

### Health Checks

Post-deployment health checks are built into the release pipeline:

- **Web app**: Polls the deployment URL for HTTP 200 (5 attempts, 10s apart)
- **API**: Polls `API_HEALTH_URL` for HTTP 200 (6 attempts, 15s apart)

Health check failures produce GitHub Actions warnings but do not fail the
workflow, since the deployment itself succeeded.

## Required GitHub Secrets and Variables

### Shared CI

| Name          | Type     | Required | Purpose                     |
| ------------- | -------- | -------- | --------------------------- |
| `TURBO_TOKEN` | Secret   | No       | Turborepo remote cache      |
| `TURBO_TEAM`  | Variable | No       | Turborepo remote cache team |

### Web Deployment

| Name                    | Type     | Required | Purpose                       |
| ----------------------- | -------- | -------- | ----------------------------- |
| `VERCEL_TOKEN`          | Secret   | Yes      | Vercel API access             |
| `VERCEL_ORG_ID`         | Variable | Yes      | Vercel organization           |
| `VERCEL_WEB_PROJECT_ID` | Variable | Yes      | Vercel project for `apps/web` |

### Desktop Update Endpoint

| Name                                | Type     | Required | Purpose                          |
| ----------------------------------- | -------- | -------- | -------------------------------- |
| `VERCEL_DESKTOP_UPDATES_PROJECT_ID` | Variable | Yes      | Vercel project for updater       |
| `DESKTOP_UPDATE_SHARED_KEY`         | Secret   | Yes      | Auth key for update feed         |
| `BLOB_READ_WRITE_TOKEN`             | Secret   | Yes      | Vercel Blob storage access       |
| `DESKTOP_UPDATE_CHANNEL`            | Variable | No       | Channel name (default: `stable`) |
| `DESKTOP_UPDATE_BLOB_PREFIX`        | Variable | No       | Blob key prefix                  |
| `DESKTOP_UPDATE_BASE_URL`           | Variable | No       | Public URL for update feed       |

### API Deployment

| Name                     | Type     | Required | Purpose                               |
| ------------------------ | -------- | -------- | ------------------------------------- |
| `API_DEPLOY_HOOK_URL`    | Secret   | No       | POST endpoint for rollout trigger     |
| `API_DEPLOY_HOOK_BEARER` | Secret   | No       | Bearer token for deploy hook          |
| `API_HEALTH_URL`         | Variable | No       | Health endpoint for post-deploy check |

### Mobile (Expo)

| Name                     | Type     | Required | Purpose                         |
| ------------------------ | -------- | -------- | ------------------------------- |
| `EXPO_TOKEN`             | Secret   | Yes      | Expo/EAS authentication         |
| `EXPO_EAS_PROJECT_ID`    | Variable | Yes      | EAS project identifier          |
| `EXPO_UPDATES_URL`       | Variable | Yes      | Expo Updates URL                |
| `EXPO_APP_VERSION`       | Variable | No       | App version override            |
| `MOBILE_BUILD_ON_MASTER` | Variable | No       | Set `true` to auto-build native |

### Desktop Code Signing

| Name                          | Type   | Required | Purpose                                      |
| ----------------------------- | ------ | -------- | -------------------------------------------- |
| `CSC_LINK`                    | Secret | No       | macOS code signing certificate (base64 .p12) |
| `CSC_KEY_PASSWORD`            | Secret | No       | macOS certificate password                   |
| `APPLE_ID`                    | Secret | No       | Apple notarization ID                        |
| `APPLE_TEAM_ID`               | Secret | No       | Apple team ID                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | Secret | No       | Apple app-specific password                  |
| `WIN_CSC_LINK`                | Secret | No       | Windows code signing certificate             |
| `WIN_CSC_KEY_PASSWORD`        | Secret | No       | Windows certificate password                 |

## Desktop Versioning

Desktop auto-updates require a strictly newer app version than the currently
published feed. The workflows handle this automatically by resolving against the
live feed.

Manual override:

```bash
npm run version:desktop -- --set=0.2.0
```

## Desktop Storage Cleanup

The publish script uploads current channel artifacts and deletes stale blobs
from the same channel prefix, keeping storage lean.

## Practical Rollout Order

1. Configure the web Vercel project
2. Configure the updater Vercel project
3. Configure the API deploy hook for your container host
4. Configure Expo EAS project values and `EXPO_TOKEN`
5. Add the GitHub secrets and variables listed above
6. Merge a release PR to `master`

## Related Docs

- [DESKTOP_AUTO_UPDATES.md](DESKTOP_AUTO_UPDATES.md)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](VERCEL_DESKTOP_UPDATE_ENDPOINT.md)
- [PACKAGING_NOTES.md](PACKAGING_NOTES.md)
- [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
