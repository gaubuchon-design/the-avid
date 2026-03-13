# The Avid

A cross-platform non-linear editing (NLE) application that modernizes the Avid Media Composer model across desktop, browser, and mobile -- with AI-assisted and agentic workflows layered into the core editorial experience.

| Platform | Technology | Purpose |
|----------|-----------|---------|
| Desktop  | Electron (macOS / Windows / Linux) | Full editorial workstation with local media access |
| Web      | React 18 + Vite | Collaboration, approvals, lightweight editing |
| Mobile   | Expo / React Native | Review, script workflows, approvals, rough cuts |

## Status

This repository is a **production-directed foundation**. It includes a shared project model, local-first persistence across all three platforms, a usable editorial workspace, script/review/publish surfaces, and native desktop media import with background jobs.

It does **not** yet include a shipping media engine, enterprise collaboration backend, or finishing-grade interchange/export pipeline. See [Known Gaps](#known-gaps) for details.

## Quick Start

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | >= 20.0 |
| npm         | >= 10.0 |
| Docker & Docker Compose | Latest (for API / backend services) |

### Installation

```bash
# Clone the repository
git clone https://github.com/gaubuchon-design/the-avid.git
cd the-avid

# Install all dependencies (workspaces resolved automatically)
npm install
```

### Development

```bash
# Start all apps in parallel
npm run dev

# Start individual apps
npm run dev:web        # Web editor at http://localhost:3000
npm run dev:desktop    # Electron desktop app
npm run dev:mobile     # Expo mobile companion
npm run dev:api        # API server at http://localhost:4000

# Start backend infrastructure (Postgres, Redis, MinIO)
docker compose up -d
```

### Build

```bash
# Build all packages and apps
npm run build

# Build individual targets
npm run build:web
npm run build:desktop
npm run build:api
```

### Desktop Packaging

```bash
cd apps/desktop
npm run dist:mac       # macOS (DMG + ZIP, x64 + arm64)
npm run dist:win       # Windows (NSIS + portable, x64)
npm run dist:linux     # Linux (AppImage + deb, x64)
```

### Mobile Packaging

```bash
cd apps/mobile
npm run build:ios      # iOS via EAS Build
npm run build:android  # Android via EAS Build
```

### Quality Checks

```bash
npm run type-check     # TypeScript type checking across all packages
npm run lint           # ESLint across all packages
npm run test           # Run all test suites
npm run clean          # Remove all build artifacts and node_modules
```

## Architecture

```
the-avid/
  apps/
    web/                 React 18 + Vite browser editor
    desktop/             Electron shell (macOS, Windows, Linux)
    mobile/              Expo / React Native companion app
    api/                 Express + Prisma API server
  packages/
    core/                Shared editorial types, project model, utilities
    ui/                  Shared React hooks and design tokens
    render-agent/        Render pipeline agent (WebSocket-based)
  libs/
    contracts/           Shared TypeScript interfaces and API contracts
    adapters/            Platform adapters (storage, media, auth)
    ui-components/       Shared presentational React components
  services/
    agent-orchestrator/  AI agent coordination service
    knowledge-node/      Knowledge graph and search (SQLite-backed)
    local-ai-runtime/    Local AI model execution runtime
  docs/                  Architecture docs, specs, ADRs
  docker-compose.yml     Postgres, Redis, MinIO, API server
  turbo.json             Turborepo build orchestration
```

### Dependency Graph

```
contracts  -->  adapters  -->  agent-orchestrator
    |                              |
    v                              v
  core  -->  ui  -->  web      knowledge-node
    |         |                    |
    v         v                    v
  desktop   mobile           local-ai-runtime
    |
    v
   api  (Express + Prisma + Redis + S3)
```

### Key Design Decisions

- **Local-first persistence**: Each platform stores projects in its native medium (IndexedDB on web, filesystem on desktop, Expo FileSystem on mobile) with a shared schema.
- **Turborepo**: All builds, linting, type-checking, and testing are orchestrated through Turborepo with intelligent caching.
- **Monorepo workspaces**: npm workspaces across `apps/`, `packages/`, `libs/`, and `services/`.
- **AI-assisted editing**: Agent orchestrator coordinates between local AI runtimes and a knowledge graph to power editorial suggestions, script analysis, and automated workflows.

## Infrastructure

### Docker Compose Services

| Service    | Image              | Port(s)      | Purpose |
|------------|--------------------|-------------|---------|
| PostgreSQL | postgres:16-alpine | 5432        | Primary database |
| Redis      | redis:7-alpine     | 6379        | Caching, job queues, real-time pub/sub |
| MinIO      | minio/minio        | 9000, 9001  | S3-compatible media object storage |
| API        | Custom Dockerfile  | 4000        | Express API server |

```bash
# Start all infrastructure services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Reset all data volumes
docker compose down -v
```

### Environment Variables

Copy the example environment file and adjust for your setup:

```bash
cp .env.example .env.local
```

Key variables (see `docker-compose.yml` for defaults):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://avid:avid_dev_password@localhost:5432/avid_db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | Must be set in production |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000,http://localhost:5173` |

## What Is Implemented

- Shared `@mcua/core` project library with seeded projects, project summaries, import/export, and schema-versioned project hydration
- Browser repository backed by IndexedDB
- Desktop repository backed by filesystem project packages with local `media/` and `exports/` directories
- Desktop media pipeline foundation with managed originals, media fingerprints, relink identity, sidecar index manifests, waveform extraction, and best-effort proxy generation
- Desktop watch folders, missing-media relink workflows, interchange manifests, and screener render path for export packages
- Mobile repository backed by Expo FileSystem
- Shared editor workspace with bins, source/record preview, timeline editing, markers, AI jobs, review comments, approvals, transcript/script cues, publish queues, and indexed source-media playback
- Native desktop flows for media import, local project saving, and background ingest/export job tracking
- Multi-user authentication system with comprehensive settings and keyboard customization
- VFX and compositing system with Boris FX parity, planar tracker, and AI compositing

## Known Gaps

Before this application can ship as a production NLE:

- **Media engine**: Transitions, multilayer compositing, accurate audio mixing, color pipeline, and broader codec support beyond the current screener-render foundation
- **Professional interchange**: AAF, EDL, OMF, DNxHD/HR workflows, Pro Tools handoff
- **Collaboration backend**: Real-time collaboration, permissions, sync, billing, observability
- **Finishing tools**: Audio finishing, advanced VFX, multicam, trimming, media-management depth
- **CI/CD**: Typecheck, tests, packaging, signing, notarization, and update channels

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture and design |
| [Architecture Diagram](docs/ARCHITECTURE_DIAGRAM.md) | Visual architecture reference |
| [API Reference](docs/API.md) | REST and GraphQL API documentation |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Development setup and conventions |
| [Production Readiness](docs/PRODUCTION_READINESS.md) | Production deployment checklist |
| [Storage Architecture](docs/STORAGE_ARCHITECTURE.md) | Storage layer design |
| [Media Pipeline](docs/MEDIA_PIPELINE_ARCHITECTURE.md) | Media ingest/render pipeline |
| [Spec Conformance](docs/SPEC_CONFORMANCE_AUDIT.md) | Standards conformance audit |
| [Competitive Analysis](docs/COMPETITIVE_ANALYSIS.md) | Market positioning analysis |
| [Avid Parity Matrix](docs/AVID_PARITY_MATRIX.md) | Feature parity tracking vs. Avid Media Composer |
| [NLE Modernization Program](docs/NLE_MODERNIZATION_PROGRAM.md) | Product and engineering program to reach full NLE depth |
| [UI/UX Refactor Plan](docs/UI_UX_REFACTOR_PLAN.md) | Editorial shell and workstation UX modernization plan |
| [Phase Execution Status](docs/PHASE_EXECUTION_STATUS.md) | Current execution status for active modernization phases |
| [Keyboard Shortcuts](docs/KEYBOARD_SHORTCUTS.md) | Keyboard shortcut reference |
| [Release Notes](docs/RELEASE_NOTES.md) | Version history and changelog |
| [Packaging Notes](docs/PACKAGING_NOTES.md) | Desktop build and distribution |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and pull request process.

## License

MIT
