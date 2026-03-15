# The Avid

The Avid is a monorepo for a cross-platform editorial product: a shared
React-based editing experience for web, desktop, and mobile, backed by a
local-first project model, desktop media-ingest tooling, and supporting API/AI
services.

## Current Status

This repository is an active product/workstation prototype, not a finished
production release.

What is working today:

- Shared project/domain model in `@mcua/core`
- Browser, desktop, and mobile shells built from the same editorial data model
- Filesystem-backed desktop projects with managed media, exports, and background
  jobs
- Desktop ingest with probe metadata, relink identity, waveform extraction,
  poster frames, and timeline/bin thumbnails
- Shared editor UI with bins, timeline, monitors, collaboration/version-history
  surfaces, script/review/publish views, and desktop-aware import/export flows
- Desktop auto-update wiring through Electron Builder plus a Vercel-backed
  update feed

What is still incomplete:

- Facility-grade finishing/render pipeline
- Production collaboration/sync backend
- Complete professional interchange coverage
- Release signing/notarization and broader operational hardening
- Large lint-warning backlog across older packages

## Prerequisites

| Requirement | Version                                        |
| ----------- | ---------------------------------------------- |
| Node.js     | `>=20`                                         |
| npm         | `>=10`                                         |
| Docker      | Recommended for local Postgres/Redis/MinIO/API |

## Quick Start

```bash
git clone https://github.com/gaubuchon-design/the-avid.git
cd the-avid
npm install
```

If you want the full local backend stack:

```bash
docker compose up -d
```

## Development

The repo supports both focused workspace development and a full monorepo dev
run.

```bash
# Full repo dev run (apps + services with dev scripts)
npm run dev

# Common focused targets
npm run dev:web        # Vite web app on http://localhost:3001
npm run dev:desktop    # Electron desktop shell
npm run dev:mobile     # Expo mobile app
npm run dev:api        # Express API on http://localhost:4000
npm run dev:services   # Agent/knowledge/local-AI services
```

If you are running the API locally instead of through Docker, start the backing
services first:

```bash
docker compose up -d postgres redis minio minio-init
```

## Build And Verification

```bash
npm run build
npm run type-check
npm run test
npm run lint
npm run test:coverage    # Tests with coverage thresholds
```

Useful scoped commands:

```bash
npm run type-check --workspace=@mcua/web
npm run test --workspace=@mcua/desktop
npm run test:coverage --workspace=@mcua/core
npm run db:generate --workspace=@mcua/api
```

## Desktop Packaging

From the repo root:

```bash
npm run dist:desktop:refresh:mac
npm run dist:desktop:refresh:win
npm run dist:desktop:linux
```

The desktop updater feed can be published with:

```bash
npm run publish:desktop:updates -- --channel=stable
```

See [docs/DESKTOP_AUTO_UPDATES.md](docs/DESKTOP_AUTO_UPDATES.md) and
[docs/VERCEL_DESKTOP_UPDATE_ENDPOINT.md](docs/VERCEL_DESKTOP_UPDATE_ENDPOINT.md).

## Mobile Packaging

From `apps/mobile`:

```bash
npm run build:ios
npm run build:android
npm run build:all
npm run update:production
```

## Repository Layout

```text
apps/
  api/                 Express + Prisma API
  desktop/             Electron desktop workstation
  mobile/              Expo mobile companion
  web/                 React + Vite editor
libs/
  adapters/            External-system adapter interfaces and mocks
  contracts/           Shared wire/contracts types
  ui-components/       Shared presentational UI pieces
packages/
  core/                Canonical editorial project/media model
  media-backend/       Shared media schema helpers
  render-agent/        Render-node agent
  ui/                  Shared UI tokens/hooks
services/
  agent-orchestrator/  Plan/approval/tool-routing service
  desktop-update-cdn/  Vercel updater feed service
  knowledge-node/      Search/knowledge service
  local-ai-runtime/    Local model/runtime service
docs/                  Architecture, ops, parity, roadmap, ADRs
```

## Documentation

Start with [docs/README.md](docs/README.md) for a map of which docs are live
references, roadmap material, or historical records.

Key operational docs:

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [docs/MEDIA_PIPELINE_ARCHITECTURE.md](docs/MEDIA_PIPELINE_ARCHITECTURE.md)
- [docs/DESKTOP_AUTO_UPDATES.md](docs/DESKTOP_AUTO_UPDATES.md)
- [docs/PACKAGING_NOTES.md](docs/PACKAGING_NOTES.md)
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)
- [docs/CICD_RELEASE_PIPELINE.md](docs/CICD_RELEASE_PIPELINE.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
