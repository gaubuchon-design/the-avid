# Desktop Packaging Notes

This repo now has a repeatable desktop installer flow for macOS and Windows through the Electron app in [apps/desktop](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop).

## Commands

From the repo root:

```bash
npm run dist:desktop:mac
npm run dist:desktop:win
```

From the desktop workspace directly:

```bash
npm run dist:mac
npm run dist:win
```

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

## Important behavior

- AJA hardware support is now treated as optional at build/package time.
- DeckLink stays optional through `macadam`.
- Packaging no longer assumes AJA SDK bindings are installed on the build machine.
- FFmpeg is bundled into the app payload so ingest/transcode tooling is self-contained.

## CI packaging

There is now a dedicated GitHub Actions workflow for installers:

- [desktop-installers.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/desktop-installers.yml)

It builds:

- macOS installers on `macos-14`
- Windows installers on `windows-2022`

and uploads the packaged artifacts for testing.

## Platform notes

- macOS notarization still depends on `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- Without signing credentials, macOS builds still produce testable unsigned artifacts.
- Windows signing is not configured yet; NSIS artifacts are still generated for internal testing.
- The Electron installer is self-contained, but external AI/service processes are not yet embedded as bundled background services. Core editorial testing is covered; local AI features still expect the configured runtime/service path.
