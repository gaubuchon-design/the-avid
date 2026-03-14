# Desktop Auto Updates

This desktop app now uses the Electron Builder and `electron-updater`
auto-update path against a generic CDN endpoint instead of GitHub Releases.

Primary references:

- [Electron autoUpdater API](https://www.electronjs.org/docs/latest/api/auto-updater)
- [Electron application distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Electron Builder auto update](https://www.electron.build/auto-update)
- [Electron Builder publish providers](https://www.electron.build/publish.html)

## Recommended Methodology

For this repo, the most stable updater architecture is:

1. Build installers and update metadata with Electron Builder.
2. Publish the generated `latest*.yml` files and versioned binaries to a static
   CDN path.
3. Let the packaged app read the generated `app-update.yml` and check that CDN
   on startup.
4. Auto-download updates in the background.
5. Auto-restart only when the app is clean and idle. Otherwise install on quit
   or when the user explicitly chooses restart.

This avoids a custom updater protocol while still supporting a CDN-backed feed.

## Versioning

The desktop version is now synchronized with the repo root version through:

- [sync-version.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/sync-version.js)

Usage:

```bash
npm run version:desktop
npm run version:desktop -- --set=0.2.0
npm run version:desktop:auto -- --feed-base-url=https://the-avid-desktop-updates.vercel.app/desktop-updates --channel=stable
```

That script keeps:

- the repo root
  [package.json](/Users/guillaumeaubuchon/GitHub/the-avid/package.json)
- the desktop
  [package.json](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/package.json)

on the same semantic version so:

- the app reports the same version at runtime
- installers use the same version in their filenames
- Electron Builder emits matching update metadata

Automatic mode now compares the repo version to the currently published updater
feed version and chooses the next valid semantic version automatically:

- if the repo version is already newer than the published feed, it keeps the
  repo version
- if the feed version is equal to or newer than the repo version, it increments
  the published feed version before packaging

That logic is what the desktop release workflows now use, so desktop auto-update
publishes no longer depend on a manual version bump before every `master` merge.

## CDN Configuration

Electron Builder now resolves publish configuration through:

- [electron-builder.config.cjs](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/electron-builder.config.cjs)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/VERCEL_DESKTOP_UPDATE_ENDPOINT.md)

Supported environment variables:

- `DESKTOP_UPDATE_BASE_URL`
  - default: `https://the-avid-desktop-updates.vercel.app/desktop-updates`
- `DESKTOP_UPDATE_CHANNEL`
  - default: derived from the semver prerelease tag, otherwise `stable`
- `DESKTOP_UPDATE_SHARED_KEY`
  - optional shared header sent as `X-Desktop-Update-Key`

Examples:

```bash
DESKTOP_UPDATE_BASE_URL=https://cdn.example.com/the-avid/desktop npm run dist:desktop:mac
DESKTOP_UPDATE_BASE_URL=https://cdn.example.com/the-avid/desktop DESKTOP_UPDATE_CHANNEL=beta npm run dist:desktop:win
```

Recommended CDN layout:

```text
desktop/
  stable/
    latest.yml
    latest-mac.yml
    The Avid-0.2.0-win-x64.exe
    The Avid-0.2.0-mac-arm64.zip
    The Avid-0.2.0-mac-arm64.dmg
  beta/
    latest.yml
    latest-mac.yml
    ...
```

Notes:

- Windows auto-update uses the NSIS installer and `latest.yml`.
- macOS auto-update uses the ZIP artifact and `latest-mac.yml`.
- The DMG remains useful for first-time installs, but ZIP is the updater payload
  for macOS.
- The publish step now also generates public latest-download routes at
  `/desktop-downloads/<channel>/mac` and `/desktop-downloads/<channel>/win` so
  the current macOS and Windows installers have stable shareable URLs.
- The publish script now deletes superseded blobs inside the same update channel
  after a successful publish, so Vercel Blob usage stays bounded.

## Runtime Behavior

The main-process updater service is:

- [DesktopAutoUpdateService.ts](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/src/main/DesktopAutoUpdateService.ts)
- [DesktopUpdateSupport.ts](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/src/main/DesktopUpdateSupport.ts)

Current behavior:

- startup check begins after the app finishes booting
- available updates download automatically
- updater request headers are rehydrated from packaged updater config so
  authenticated feeds keep working in packaged builds
- renderer receives live status through IPC
- renderer-facing errors are normalized into shorter user-readable update
  messages instead of dumping raw transport metadata
- downloaded updates restart automatically only if there are no dirty projects
  and no active background jobs
- otherwise the app installs on quit or when the user chooses restart

That safety gate is intentional. Automatic restart during dirty editorial work
would be a data-loss risk.

## Packaging Commands

The desktop packaging scripts now use the CDN-aware Electron Builder config:

- `npm run dist:desktop:mac`
- `npm run dist:desktop:win`
- `npm run dist:desktop:refresh -- --targets=mac`
- `npm run dist:desktop:refresh -- --targets=win`

All packaging entry points also sync versions before generating artifacts. The
GitHub release workflows now resolve and apply the next desktop version
automatically before building macOS and Windows installers.

## CI/CD

Automated release orchestration is now handled by:

- [release-train.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/release-train.yml)
- [CICD_RELEASE_PIPELINE.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/CICD_RELEASE_PIPELINE.md)

That workflow can deploy the browser app, deploy the updater endpoint, build the
desktop installers, publish the updater feed, and trigger mobile OTA/native
release work after `master` CI succeeds.

## Publishing Checklist

Before relying on production auto-updates:

- macOS builds must be signed and notarized
- Windows installers should be code signed
- the CDN must serve `latest*.yml` and binaries over HTTPS
- `latest*.yml` should be served with low cache TTLs or explicit cache
  invalidation
- versioned binaries should be immutable
- if you are publishing manually, the desktop app version must still move
  forward, either through `npm run version:desktop -- --set=...` or
  `npm run version:desktop:auto ...`

Without signing, the update flow may still work for internal testing, but
production upgrade UX will be unreliable.
