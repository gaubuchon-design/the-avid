# Vercel Desktop Update Endpoint

This repo now includes a dedicated Vercel deploy target for private desktop
auto-updates:

- [services/desktop-update-cdn](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn)

It is designed to work with the desktop updater wiring already added in:

- [apps/desktop/src/main/DesktopAutoUpdateService.ts](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/src/main/DesktopAutoUpdateService.ts)
- [apps/desktop/electron-builder.config.cjs](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/electron-builder.config.cjs)

## Architecture

The release flow is:

1. Build desktop installers with Electron Builder.
2. Upload `latest*.yml`, installers, and blockmaps directly to Vercel Blob.
3. Serve update metadata and binaries through a Vercel Function endpoint that
   issues authenticated signed redirects to private Blob assets.
4. Have the packaged desktop app poll that endpoint on startup.

This uses the current official guidance from:

- [Electron autoUpdater API](https://www.electronjs.org/docs/latest/api/auto-updater)
- [Electron Builder auto update](https://www.electron.build/auto-update)
- [Vercel Blob server uploads](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Vercel Blob private access patterns](https://vercel.com/docs/vercel-blob/private)

## Important Constraint

Large installers should not be uploaded through a Vercel Function request body.
Vercel Functions currently impose a request payload limit, and Vercel’s own Blob
guidance is to upload large files directly to Blob instead of proxying them
through a function.

That is why this implementation splits responsibilities:

- upload path: direct Blob upload from local or CI
- download path: Vercel Function endpoint backed by private Blob reads

## Service Files

- [services/desktop-update-cdn/vercel.json](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn/vercel.json)
  - rewrites `/desktop-updates/*` to the function routes
- [services/desktop-update-cdn/api/desktop-updates/index.js](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn/api/desktop-updates/index.js)
  - health endpoint plus authenticated artifact dispatch
- [services/desktop-update-cdn/api/desktop-updates/handler.js](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn/api/desktop-updates/handler.js)
  - authenticated metadata and artifact delivery through signed Blob redirects
- [services/desktop-update-cdn/scripts/publish-desktop-builds.js](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn/scripts/publish-desktop-builds.js)
  - uploads built desktop artifacts into Blob paths that match the updater feed

## Environment Variables

For the Vercel project:

- `BLOB_READ_WRITE_TOKEN`
  - required for private Blob reads from the function
- `DESKTOP_UPDATE_SHARED_KEY`
  - optional but recommended; the desktop app sends this as
    `X-Desktop-Update-Key`
- `DESKTOP_UPDATE_BLOB_PREFIX`
  - optional; defaults to `desktop-updates`

For desktop packaging:

- `DESKTOP_UPDATE_BASE_URL`
  - example: `https://your-updater-project.vercel.app/desktop-updates`
- `DESKTOP_UPDATE_CHANNEL`
  - example: `stable` or `beta`
- `DESKTOP_UPDATE_SHARED_KEY`
  - if set, Electron Builder embeds the shared header into `app-update.yml`

For local or CI publishing:

- `BLOB_READ_WRITE_TOKEN`
  - required
- `DESKTOP_UPDATE_CHANNEL`
  - optional; defaults to `stable`
- `DESKTOP_UPDATE_BLOB_PREFIX`
  - optional; defaults to `desktop-updates`
- `DESKTOP_UPDATE_PUBLIC_BASE_URL`
  - optional; used only for publish-script output text

## Deploying The Endpoint

1. Create a dedicated Vercel project with its root set to:
   - [services/desktop-update-cdn](/Users/guillaumeaubuchon/GitHub/the-avid/services/desktop-update-cdn)
2. Attach a Vercel Blob store to that project.
3. Configure the environment variables above.
4. Deploy the project.

Your desktop feed base URL will then look like:

```text
https://your-updater-project.vercel.app/desktop-updates/stable
```

## Publishing New Desktop Builds

After running the desktop packaging build:

```bash
npm run dist:desktop:refresh -- --targets=mac,win --allow-cross
npm run publish:desktop:updates -- --channel=stable
```

The publish script uploads:

- `latest.yml`
- `latest-mac.yml`
- `stable-mac.yml` when present
- referenced installer payloads
- matching `.blockmap` files

It also prunes stale blobs from the same channel after the new release uploads
complete, so old installer payloads do not linger in Vercel Blob storage and
continue to accrue cost.

The script also resolves Electron Builder’s URL-safe artifact names to the
actual files on disk, which matters because the generated metadata can use names
like `The-Avid-0.1.0-win-x64.exe` while the local output file may still contain
spaces.

Because cleanup is channel-scoped, publishing should happen once from a combined
macOS + Windows artifact set. The GitHub Actions workflows now do that with an
aggregate publish job after both platform builds finish:

- [desktop-installers.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/desktop-installers.yml)
- [release-train.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/release-train.yml)

## Security Notes

This is private in the practical “gated endpoint” sense, not in the “perfectly
secret client” sense.

Because Electron’s generic updater must be able to fetch updates without an
interactive login, any static shared key embedded in the packaged app can
ultimately be extracted by a determined attacker. The shared key still provides
useful protection against casual scraping and accidental public access, but it
is not equivalent to user-bound authentication.

If you later want per-license or per-user authenticated updates, that requires a
more custom updater flow than Electron Builder’s generic provider.
