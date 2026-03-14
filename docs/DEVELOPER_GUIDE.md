# Developer Guide

This guide covers the current local-development workflow for The Avid monorepo.

## Prerequisites

- Node.js `>=20`
- npm `>=10`
- Git
- Docker, if you want the local Postgres/Redis/MinIO/API stack

## First-Time Setup

```bash
git clone https://github.com/gaubuchon-design/the-avid.git
cd the-avid
npm install
```

For backend dependencies only:

```bash
docker compose up -d postgres redis minio minio-init
```

For the full containerized backend stack:

```bash
docker compose up -d
```

## Common Commands

From the repo root:

```bash
npm run dev
npm run dev:web
npm run dev:desktop
npm run dev:mobile
npm run dev:api
npm run dev:services

npm run build
npm run type-check
npm run test
npm run lint
```

Scoped examples:

```bash
npm run type-check --workspace=@mcua/web
npm run test --workspace=@mcua/desktop
npm run db:generate --workspace=@mcua/api
```

## Default Local Ports

| Surface               | Default                 |
| --------------------- | ----------------------- |
| Web app (`@mcua/web`) | `http://localhost:3001` |
| API (`@mcua/api`)     | `http://localhost:4000` |
| Agent orchestrator    | `http://localhost:4100` |
| Knowledge node        | `http://localhost:4200` |
| Local AI runtime      | `http://localhost:4300` |
| MinIO API             | `http://localhost:9000` |
| MinIO console         | `http://localhost:9001` |

The mobile app runs through Expo and may use a different local URL each session.

## Workspace Map

| Path                          | Workspace                  | Purpose                                |
| ----------------------------- | -------------------------- | -------------------------------------- |
| `apps/web`                    | `@mcua/web`                | Shared browser editor                  |
| `apps/desktop`                | `@mcua/desktop`            | Electron workstation shell             |
| `apps/mobile`                 | `@mcua/mobile`             | Expo companion app                     |
| `apps/api`                    | `@mcua/api`                | Express + Prisma backend               |
| `packages/core`               | `@mcua/core`               | Canonical project/media model          |
| `packages/media-backend`      | `@mcua/media-backend`      | Shared media schemas                   |
| `packages/render-agent`       | `@mcua/render-agent`       | Render-node agent                      |
| `packages/ui`                 | `@mcua/ui`                 | Shared UI primitives/tokens            |
| `libs/contracts`              | `@mcua/contracts`          | Shared contracts                       |
| `libs/adapters`               | `@mcua/adapters`           | Adapter interfaces and mocks           |
| `libs/ui-components`          | `@mcua/ui-components`      | Shared presentational components       |
| `services/agent-orchestrator` | `@mcua/agent-orchestrator` | Planning/approval/tool-routing service |
| `services/knowledge-node`     | `@mcua/knowledge-node`     | Search/knowledge service               |
| `services/local-ai-runtime`   | `@mcua/local-ai-runtime`   | Local AI runtime service               |
| `services/desktop-update-cdn` | `@mcua/desktop-update-cdn` | Vercel desktop update feed             |

## Current Development Model

### Web

- Vite serves the editor on port `3001`.
- `/api` and `/socket.io` are proxied to `http://localhost:4000` by default.
- The web app shares most editor UI, stores, and engine code with desktop.

### Desktop

- Electron uses the same shared React/editor shell as web.
- Main-process services handle project packages, media ingest, export jobs,
  playback transports, and auto-updates.
- Desktop ingest currently performs probe capture, waveform extraction,
  poster-frame generation, and thumbnail extraction.

### API

- Express mounts application routes under `/api/v1`.
- Prisma client generation is required after schema changes.
- `prebuild` and `pretype-check` now run `db:generate`, but after changing
  `apps/api/prisma/schema.prisma` you should still run:

```bash
npm run db:generate --workspace=@mcua/api
```

### AI / Service Layer

- The web app has a browser-side Gemini client plus MCP connectivity.
- The API has server-side OpenAI-configured AI helpers.
- The service layer contains the experimental orchestrator, knowledge-node, and
  local-runtime services used for broader agent/search/runtime work.

## Recommended Workflows

### Editor/UI Changes

```bash
npm run dev:web
npm run type-check --workspace=@mcua/web
npm run test --workspace=@mcua/web
```

### Desktop/Ingest Changes

```bash
npm run dev:desktop
npm run type-check --workspace=@mcua/desktop
npm run test --workspace=@mcua/desktop
```

### API/Schema Changes

```bash
docker compose up -d postgres redis minio minio-init
npm run db:generate --workspace=@mcua/api
npm run dev:api
npm run type-check --workspace=@mcua/api
npm run test --workspace=@mcua/api
```

## Packaging

Desktop packaging is driven from the root:

```bash
npm run dist:desktop:refresh:mac
npm run dist:desktop:refresh:win
npm run dist:desktop:linux
```

See:

- [PACKAGING_NOTES.md](PACKAGING_NOTES.md)
- [DESKTOP_AUTO_UPDATES.md](DESKTOP_AUTO_UPDATES.md)
- [VERCEL_DESKTOP_UPDATE_ENDPOINT.md](VERCEL_DESKTOP_UPDATE_ENDPOINT.md)

## Documentation Conventions

- Treat [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
  [API.md](API.md) as live references.
- Treat parity matrices, refactor plans, and modernization docs as
  roadmap/planning material.
- Treat ADRs as historical records.
