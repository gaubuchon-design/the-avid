# Desktop Installer Automation

This document describes the supported process for removing stale macOS/Windows desktop installers and rebuilding fresh ones from the current code.

The canonical entry point is now:

- [rebuild-installers.js](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/scripts/rebuild-installers.js)

It performs two actions in one place:

1. Deletes stale packaging outputs from `apps/desktop/out` and `apps/desktop/dist`
2. Rebuilds the requested installer targets with the current desktop code

## Local Usage

From the repo root:

```bash
npm run dist:desktop:refresh:mac
npm run dist:desktop:refresh:win
```

Or use the generic target selector:

```bash
npm run dist:desktop:refresh -- --targets=mac
npm run dist:desktop:refresh -- --targets=win
```

From the desktop workspace directly:

```bash
npm run dist:refresh -- --targets=mac
npm run dist:refresh -- --targets=win
```

## Host Expectations

- macOS builds should run on macOS hosts for normal local usage.
- Windows builds should run on Windows hosts for normal local usage.
- If you intentionally want to try a cross-platform build locally, pass `--allow-cross`, but CI is the preferred path for that.

Examples:

```bash
node apps/desktop/scripts/rebuild-installers.js --targets=mac
node apps/desktop/scripts/rebuild-installers.js --targets=win
node apps/desktop/scripts/rebuild-installers.js --targets=mac,win --allow-cross
```

## Outputs

Fresh installer artifacts are written to:

- [apps/desktop/out](/Users/guillaumeaubuchon/GitHub/the-avid/apps/desktop/out)

Expected artifacts:

- macOS: `.dmg` and `.zip`
- Windows: NSIS `.exe` installer and portable/unpacked payloads

## Periodic / On-Demand CI Rebuilds

Installer automation is wired through:

- [.github/workflows/desktop-installers.yml](/Users/guillaumeaubuchon/GitHub/the-avid/.github/workflows/desktop-installers.yml)

That workflow now supports:

- `push` rebuilds when desktop/web/packages packaging inputs change
- `workflow_dispatch` manual runs with a `targets` selector (`all`, `mac`, `win`)
- scheduled rebuilds every Monday at `06:00 UTC`

Each workflow job calls the same local rebuild entry point so manual and CI packaging stay aligned.

## Recommended Release Rhythm

- Use the scheduled workflow to keep smoke-test installers fresh on a steady cadence.
- Use the manual workflow before release candidates or when packaging resources change.
- Use local `dist:desktop:refresh:*` commands when validating packaging changes on the matching OS.

## Packaging Checklist

Before expecting signed distributables:

- macOS signing/notarization secrets must be configured: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows code-signing, if required, should be added to the build environment separately
- `resources/bin/<platform>` should be present or downloadable through packaging prep

Unsigned internal test installers can still be generated without those release credentials.
