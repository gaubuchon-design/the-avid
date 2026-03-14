# CI/CD Release Pipeline

This repo now includes an automated post-CI release workflow:

- [release-train.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/release-train.yml)

It is designed to run after
[ci.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/ci.yml)
succeeds on `master`, or on manual dispatch.

## Release topology

After a successful merge to `master`, the workflow can automatically:

1. deploy the browser app to Vercel
2. deploy the private desktop update endpoint to Vercel
3. build and publish the API container image to GHCR
4. trigger the API server rollout through a deploy hook
5. build macOS and Windows desktop installers
6. publish the desktop auto-update feed to private Vercel Blob and remove stale
   blobs from that channel
7. publish a mobile OTA update through Expo EAS
8. optionally kick off native mobile builds

## Required GitHub secrets and variables

### Shared release inputs

- `DESKTOP_UPDATE_SHARED_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `DESKTOP_UPDATE_CHANNEL`
- `DESKTOP_UPDATE_BLOB_PREFIX`
- `DESKTOP_UPDATE_BASE_URL`

### Web deployment to Vercel

- secret: `VERCEL_TOKEN`
- variable: `VERCEL_ORG_ID`
- variable: `VERCEL_WEB_PROJECT_ID`

The Vercel web project should use:

- repo: this repository
- project directory:
  [apps/web](/Users/guillaumeaubuchon/GitHub/the-avid/apps/web)

Set the browser app environment variables directly in that Vercel project,
including:

- `VITE_API_BASE_URL`
- any transcription or AI runtime variables the web app needs

### Desktop updater endpoint deployment to Vercel

- secret: `VERCEL_TOKEN`
- variable: `VERCEL_ORG_ID`
- variable: `VERCEL_DESKTOP_UPDATES_PROJECT_ID`

The updater endpoint Vercel project should use:

- repo: this repository
- project directory:
  [services/desktop-update-cdn](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn)

### API server rollout

- optional secret: `API_DEPLOY_HOOK_URL`
- optional secret: `API_DEPLOY_HOOK_BEARER`

The workflow always builds and pushes `ghcr.io/<owner>/the-avid-api`. If
`API_DEPLOY_HOOK_URL` is configured, it also POSTs the new image reference and
commit SHA to that endpoint so your runtime platform can pull and roll forward
automatically.

This keeps the repo provider-agnostic for the API, which matters because the
current API is a websocket-capable Express server and is better suited to a
container host than to static/serverless hosting.

### Mobile OTA and native builds

- secret: `EXPO_TOKEN`
- variable: `EXPO_EAS_PROJECT_ID`
- variable: `EXPO_UPDATES_URL`
- optional variable: `EXPO_APP_VERSION`
- optional variable: `MOBILE_BUILD_ON_MASTER`

The mobile app configuration is now environment-driven through:

- [app.config.ts](/Users/guillaumeaubuchon/GitHub/the-avid/apps/mobile/app.config.ts)
- [eas.json](/Users/guillaumeaubuchon/GitHub/the-avid/apps/mobile/eas.json)

`MOBILE_BUILD_ON_MASTER=true` enables automatic native build kickoffs after each
successful OTA publish.

## Desktop storage cleanup

Desktop updater publishing is handled by:

- [publish-desktop-builds.js](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn/scripts/publish-desktop-builds.js)

It now:

- uploads the current channel metadata and payloads
- lists every blob already stored under that channel prefix
- deletes anything not part of the current release set

That keeps the updater channel lean so old installers do not accumulate in
Vercel Blob storage.

Important behavior:

- cleanup happens only after the new release artifacts upload successfully
- cleanup is channel-scoped, so `stable` and `beta` can still coexist
- desktop publishing now runs once per release after macOS and Windows artifacts
  are aggregated

## Versioning expectations

Desktop auto-updates require a strictly newer app version than the currently
published installer feed.

That means:

- web deployments can safely happen on every successful `master` merge
- mobile OTA updates can safely happen on every successful `master` merge
- desktop updater releases should still move the desktop version forward before
  merge if you want installed desktop clients to auto-upgrade

Use:

```bash
npm run version:desktop -- --set=0.2.0
```

before merging a desktop release when you want updater clients to receive it
automatically.

## Practical rollout order

Recommended production order:

1. configure the web Vercel project
2. configure the updater Vercel project
3. configure the API deploy hook for your container host
4. configure Expo EAS project values and `EXPO_TOKEN`
5. add the GitHub secrets and variables above
6. merge a versioned release PR to `master`

## Related docs

- [DESKTOP_AUTO_UPDATES.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/DESKTOP_AUTO_UPDATES.md)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/VERCEL_DESKTOP_UPDATE_ENDPOINT.md)
- [PACKAGING_NOTES.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/PACKAGING_NOTES.md)
