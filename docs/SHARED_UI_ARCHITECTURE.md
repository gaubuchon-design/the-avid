# Shared UI Architecture

This document explains how The Avid delivers a **common editor experience** across
web, desktop, and mobile while keeping platform-specific native capabilities
separate.

## Design Principle

> One editor, many shells.

The editorial UI — components, pages, stores, engines, hooks, styles — lives in a
single shared package (`@mcua/editor`). Each platform provides a thin "shell" that:

1. Mounts the shared editor
2. Injects platform capabilities via `<PlatformProvider>`
3. Adds platform-specific chrome (update banners, native menus, deep links, etc.)

## Package Layout

```text
packages/
  editor/             ← @mcua/editor — THE shared editor package
    src/
      platform/       ← PlatformProvider, usePlatform(), capability types
      components/     ← All editor components (Timeline, Bins, Monitor, etc.)
      pages/          ← Route-level pages (Dashboard, Editor, Settings, etc.)
      store/          ← Zustand stores (editor, player, audio, color, etc.)
      engine/         ← Domain engines (Snap, Audio, Title, AAF, GPU, etc.)
      hooks/          ← Shared React hooks
      layouts/        ← Layout shells (MainLayout, AuthLayout)
      lib/            ← Utilities (timecode, runtime detection, etc.)
      styles/         ← CSS (globals, design system, editor)
      ai/             ← AI integration layer
      collab/         ← CRDT / collaboration
      gpu/            ← WebGPU pipeline
      workers/        ← Web Workers
      types/          ← Shared TypeScript types
      data/           ← Static data / fixtures
      index.ts        ← Barrel export

apps/
  web/                ← @mcua/web — browser shell
    src/
      main.tsx        ← Entry point (BrowserRouter, CSS imports)
      App.tsx         ← Web-specific shell (auth guards, PlatformProvider)
      pwa.ts          ← Progressive Web App registration

  desktop/            ← @mcua/desktop — Electron shell
    src/
      main/           ← Electron main process (media pipeline, native APIs)
      preload/        ← Electron preload bridge
      renderer/
        main.tsx      ← Entry point (MemoryRouter, CSS imports)
        App.tsx       ← Desktop shell (update banner, deep links, PlatformProvider)

  mobile/             ← @mcua/mobile — Expo / React Native shell
    ...               ← Companion experience
```

## Platform Abstraction

The `@mcua/editor/platform` module defines the contract between the shared editor
and each host shell.

### Capabilities Interface

```typescript
interface PlatformCapabilities {
  surface: 'browser' | 'desktop' | 'mobile';
  fs?: PlatformFileSystem;         // Desktop only
  media?: PlatformMedia;           // Desktop only (native pipeline)
  app?: PlatformApp;               // Desktop only (updates, version)
  hasNativePlayback: boolean;
  hasHardwareAccess: boolean;
}
```

### Usage in Components

```tsx
import { usePlatform, useIsDesktop } from '@mcua/editor';

function ExportButton() {
  const { media } = usePlatform();
  const isDesktop = useIsDesktop();

  if (isDesktop && media) {
    // Use native export pipeline
    return <button onClick={() => media.ingestFiles(paths)}>Export (Native)</button>;
  }
  // Fall back to server-side export
  return <button onClick={handleCloudExport}>Export</button>;
}
```

### Shell Setup

Each shell wraps its app in `<PlatformProvider>`:

**Web shell** (`apps/web/src/App.tsx`):
```tsx
const browserCapabilities: PlatformCapabilities = {
  surface: 'browser',
  hasNativePlayback: false,
  hasHardwareAccess: false,
};

<PlatformProvider capabilities={browserCapabilities}>
  <KeyboardProvider>
    <Routes>...</Routes>
  </KeyboardProvider>
</PlatformProvider>
```

**Desktop shell** (`apps/desktop/src/renderer/App.tsx`):
```tsx
const desktopCapabilities: PlatformCapabilities = {
  surface: 'desktop',
  hasNativePlayback: true,
  hasHardwareAccess: true,
  fs: { /* bridges to electronAPI */ },
  media: { /* bridges to electronAPI */ },
  app: { /* bridges to electronAPI */ },
};

<PlatformProvider capabilities={desktopCapabilities}>
  <ErrorBoundary>
    <Routes>...</Routes>
    <UpdateBanner />
  </ErrorBoundary>
</PlatformProvider>
```

## Import Conventions

From any app shell or from within `@mcua/editor` itself:

```typescript
// Barrel exports for commonly used items
import { EditorPage, useEditorStore, usePlatform } from '@mcua/editor';

// Deep imports for specific components (tree-shaking friendly)
import { AudioMixer } from '@mcua/editor/components/AudioMixer/AudioMixer';
import { SnapEngine } from '@mcua/editor/engine/SnapEngine';

// Styles (imported once in each shell's main.tsx)
import '@mcua/editor/styles/globals.css';
```

## What Lives Where

| Concern | Location | Why |
|---------|----------|-----|
| Editor components, stores, engines | `packages/editor/` | Shared across all platforms |
| Platform capability types | `packages/editor/src/platform/` | Contract for shell implementations |
| Design tokens, theme hooks | `packages/ui/` | Even lower-level than the editor |
| Editorial data model | `packages/core/` | Pure domain logic, no React |
| Agentic UI components | `libs/ui-components/` | Shared across agentic surfaces |
| Web entry point, routing shell | `apps/web/` | Browser-specific bootstrap |
| Desktop main process, preload | `apps/desktop/src/main/` | Native APIs, media pipeline |
| Desktop renderer shell | `apps/desktop/src/renderer/` | Electron-specific chrome |
| Wire types, Zod schemas | `libs/contracts/` | Service boundary types |
| External system adapters | `libs/adapters/` | MC, ProTools, Content Core |

## Adding a New Platform

To add a new shell (e.g., a tablet-optimized PWA):

1. Create `apps/tablet/` with its own `package.json` depending on `@mcua/editor`
2. Create `apps/tablet/src/App.tsx` that wraps the editor in `<PlatformProvider>`
3. Define the capabilities that the tablet surface supports
4. Import pages, components, and stores from `@mcua/editor`
5. Add any tablet-specific chrome or navigation patterns

## Performance Boundaries

Desktop-only heavy lifting stays in the Electron main process:

- **Media pipeline** (`apps/desktop/src/main/mediaPipeline.ts`) — ffprobe, waveforms,
  managed media copy, sidecar indexes
- **Background media service** — job queue processing
- **Hardware access** — Blackmagic deck control, serial ports, SRT streaming
- **Auto-updates** — electron-updater lifecycle
- **GPU playback** — native decoder integration

The shared editor in `@mcua/editor` talks to these through the `PlatformMedia` and
`PlatformApp` abstractions, never importing Electron APIs directly.
