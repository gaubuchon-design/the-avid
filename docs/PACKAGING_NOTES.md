# Desktop Packaging Notes

This repo has a repeatable desktop packaging flow for macOS, Windows, and Linux
through the Electron app in
[apps/desktop](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop).

## Commands

From the repo root:

```bash
npm run dist:desktop:refresh:mac
npm run dist:desktop:refresh:win
npm run dist:desktop:linux
npm run dist:desktop:mac
npm run dist:desktop:win
```

From the desktop workspace directly:

```bash
npm run dist:refresh -- --targets=mac
npm run dist:refresh -- --targets=win
npm run dist:linux
npm run dist:mac
npm run dist:win
```

The refresh commands are the preferred entry point because they delete stale
outputs before rebuilding fresh installers from the current code.

Canonical automation entry point:

- [rebuild-installers.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/rebuild-installers.js)
  - removes stale `apps/desktop/out` and `apps/desktop/dist`
  - rebuilds requested installer targets through the existing desktop packaging
    scripts

Detailed automation guide:

- [DESKTOP_INSTALLER_AUTOMATION.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/DESKTOP_INSTALLER_AUTOMATION.md)
- [DESKTOP_AUTO_UPDATES.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/DESKTOP_AUTO_UPDATES.md)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/VERCEL_DESKTOP_UPDATE_ENDPOINT.md)
- [CICD_RELEASE_PIPELINE.md](/Users/guillaumeaubuchon/GitHub/the-avid/docs/CICD_RELEASE_PIPELINE.md)

## What the packaging prep does

Before packaging, the desktop workspace now runs:

- [generate-icons.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/generate-icons.js)
  - generates `icon.icns`, `icon.ico`, `icon.png`, and Linux icon sizes
  - works with macOS native tools and does not require ImageMagick on macOS
- [render-dmg-background.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/render-dmg-background.js)
  - renders `dmg-background.png` from the SVG source
- [download-ffmpeg.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/download-ffmpeg.js)
  - downloads bundled `ffmpeg` and `ffprobe` into `resources/bin/<platform>`
- [prepare-packaging.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/prepare-packaging.js)
  - orchestrates the full prep step for the requested installer target

## Installer outputs

Artifacts are written to:

- [apps/desktop/out](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/out)

Current targets:

- macOS: DMG and ZIP
- Windows: NSIS installer and portable build
- Linux: AppImage and deb

## Important behavior

- AJA hardware support is now treated as optional at build/package time.
- DeckLink stays optional through `macadam`.
- Packaging no longer assumes AJA SDK bindings are installed on the build
  machine.
- FFmpeg is bundled into the app payload so ingest/transcode tooling is
  self-contained.
- Packaged desktop builds now emit generic-provider auto-update metadata for a
  CDN-backed update feed.

## CI packaging

There is now a dedicated GitHub Actions workflow for installers:

- [desktop-installers.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/desktop-installers.yml)

It builds:

- macOS installers on `macos-14`
- Windows installers on `windows-2022`

and uploads the packaged artifacts for testing.

The workflow now also supports:

- manual target selection through `workflow_dispatch`
- scheduled periodic rebuilds
- the same clean-and-rebuild entry point used locally
- a downstream aggregate publish step that can safely prune stale updater blobs
  without macOS/Windows jobs racing each other

When you manually rebuild only `mac` or only `win`, the workflow intentionally
skips updater publishing. Channel cleanup is only safe when the workflow has the
complete multi-platform artifact set.

## Platform notes

- macOS notarization still depends on `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  and `APPLE_TEAM_ID`.
- Without signing credentials, macOS builds still produce testable unsigned
  artifacts.
- Windows signing is not configured yet; NSIS artifacts are still generated for
  internal testing.
- The Electron installer is self-contained, but external AI/service processes
  are not yet embedded as bundled background services. Core editorial testing is
  covered; local AI features still expect the configured runtime/service path.
