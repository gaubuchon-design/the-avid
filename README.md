# Media Composer Unified Application

A professional media composition and editing application built as a unified codebase targeting **macOS**, **Windows**, **Browser**, and **Mobile (iOS + Android)**.

---

## Architecture

```
media-composer-unified-application/
├── apps/
│   ├── web/          → Browser app        (Vite + React + React Router)
│   ├── desktop/      → macOS & Windows    (Electron + Vite + React)
│   └── mobile/       → iOS & Android      (Expo + React Native + Expo Router)
├── packages/
│   ├── core/         → Shared types, API client, utilities, store interfaces
│   └── ui/           → Shared hooks (useTimeline, useMediaPlayer) & design tokens
├── turbo.json        → Turborepo pipeline
├── package.json      → Workspace root
└── tsconfig.base.json → Shared TypeScript config
```

## Tech Stack

| Layer         | Technology                               |
|---------------|------------------------------------------|
| Monorepo      | Turborepo + npm workspaces               |
| Language      | TypeScript 5.4                           |
| Web           | React 18 + Vite + React Router v6        |
| Desktop       | Electron 31 + electron-vite             |
| Mobile        | Expo 51 + React Native + Expo Router     |
| State         | Zustand + Immer                          |
| Data Fetching | TanStack Query                           |
| Styling       | CSS Custom Properties (web) / StyleSheet (mobile) |
| Builds        | electron-builder (desktop) + EAS Build (mobile) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10

### Install

```bash
npm install
```

### Development

```bash
# All apps simultaneously
npm run dev

# Individual apps
npm run dev:web       # → http://localhost:3000
npm run dev:desktop   # → Electron window
npm run dev:mobile    # → Expo dev server (scan QR for iOS/Android)
```

### Build

```bash
# All apps
npm run build

# Desktop
cd apps/desktop
npm run build:mac     # → macOS .dmg + .zip (x64 + arm64)
npm run build:win     # → Windows .exe installer + portable

# Mobile
cd apps/mobile
npm run build:ios     # → EAS Build (iOS .ipa)
npm run build:android # → EAS Build (Android .apk / .aab)
```

---

## Shared Packages

### `@mcua/core`
- **Types** — `Project`, `Timeline`, `Track`, `Clip`, `MediaAsset`, `User`, `Platform`, …
- **ApiClient** — typed HTTP client for the backend REST API
- **Utils** — `formatTimecode`, `formatFileSize`, `generateId`, `clamp`, `debounce`
- **Store** — base state shape & action interfaces (platform implementations in each app)

### `@mcua/ui`
- **`useTimeline`** — timeline state management (play, seek, add/remove tracks & clips)
- **`useMediaPlayer`** — HTML5 media player controls
- **Design Tokens** — colors, typography, spacing, shadows

---

## Platform Notes

### macOS & Windows (Electron)
- Native menu bar with File / Edit / View / Window / Help
- Native dialogs for open/save/export
- IPC bridge via `contextBridge` for secure renderer ↔ main communication
- Auto-updater via `electron-updater`
- Builds: `.dmg` / `.zip` (macOS), `.exe` NSIS installer + portable (Windows)

### Browser (Web)
- Served via Vite dev server or as a static bundle
- React Router v6 with URL-based navigation
- Code-split vendor chunks for fast initial load

### iOS & Android (Expo)
- Expo Router for file-based navigation
- Landscape orientation optimized for tablet / iPad
- Native media access via Expo AV, Media Library, Document Picker
- OTA updates via Expo + cloud builds via EAS Build

---

## Roadmap

- [ ] Backend API (REST + WebSocket)
- [ ] Real-time collaboration
- [ ] Video canvas with WebGL renderer
- [ ] Audio waveform visualization
- [ ] Effects system (color grading, audio EQ)
- [ ] Cloud project sync
- [ ] Plugin system

A unified application for media composition, editing, and management.

## Project Structure

```
media-composer-unified-application/
├── src/         # Source code
├── assets/      # Media assets
├── docs/        # Documentation
└── README.md
```

## Getting Started

_Documentation coming soon._

## License

MIT
