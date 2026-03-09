# Contributing to The Avid

Thank you for your interest in contributing to The Avid. This document covers the development workflow, coding standards, and pull request process.

## Table of Contents

- [Development Setup](#development-setup)
- [Repository Structure](#repository-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Development Setup

### Prerequisites

- Node.js >= 20.0
- npm >= 10.0
- Docker and Docker Compose (for backend services)
- Git

### First-Time Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/the-avid.git
cd the-avid

# 2. Add the upstream remote
git remote add upstream https://github.com/gaubuchon-design/the-avid.git

# 3. Install dependencies
npm install

# 4. Start infrastructure services
docker compose up -d

# 5. Verify everything works
npm run type-check
npm run test
npm run dev:web
```

## Repository Structure

This is a monorepo managed with npm workspaces and Turborepo.

| Directory | Scope | Description |
|-----------|-------|-------------|
| `apps/web` | `@mcua/web` | React 18 + Vite browser editor |
| `apps/desktop` | `@mcua/desktop` | Electron desktop application |
| `apps/mobile` | `@mcua/mobile` | Expo / React Native companion |
| `apps/api` | `@mcua/api` | Express + Prisma API server |
| `packages/core` | `@mcua/core` | Shared types, project model, utilities |
| `packages/ui` | `@mcua/ui` | Shared React hooks and design tokens |
| `packages/render-agent` | `@mcua/render-agent` | Render pipeline agent |
| `libs/contracts` | `@mcua/contracts` | TypeScript interfaces and API contracts |
| `libs/adapters` | `@mcua/adapters` | Platform adapters |
| `libs/ui-components` | `@mcua/ui-components` | Shared React components |
| `services/agent-orchestrator` | `@mcua/agent-orchestrator` | AI agent coordination |
| `services/knowledge-node` | `@mcua/knowledge-node` | Knowledge graph service |
| `services/local-ai-runtime` | `@mcua/local-ai-runtime` | Local AI model runtime |

### Dependency Rules

- `apps/*` may depend on `packages/*`, `libs/*`, and `services/*`
- `packages/*` may depend on other `packages/*` and `libs/*`
- `libs/*` may depend on other `libs/*` only
- `services/*` may depend on `libs/*` only
- Circular dependencies are not allowed

## Development Workflow

### Branch Naming

Use the following branch naming convention:

```
feat/<short-description>      # New features
fix/<short-description>       # Bug fixes
refactor/<short-description>  # Code refactoring
docs/<short-description>      # Documentation changes
chore/<short-description>     # Tooling, CI, dependencies
test/<short-description>      # Test additions or fixes
```

### Day-to-Day Development

```bash
# 1. Create a feature branch from master
git checkout master
git pull upstream master
git checkout -b feat/my-feature

# 2. Start the dev servers you need
npm run dev:web           # or dev:desktop, dev:mobile, dev:api

# 3. Make your changes, running checks as you go
npm run type-check        # TypeScript validation
npm run lint              # ESLint
npm run test              # Tests

# 4. Commit using conventional commits (see below)
git add <files>
git commit -m "feat(web): add timeline zoom controls"

# 5. Push and open a pull request
git push origin feat/my-feature
```

### Working With Specific Packages

Turborepo supports scoped commands using `--filter`:

```bash
# Run dev for web and its dependencies only
npx turbo run dev --filter=@mcua/web...

# Build only the core package
npx turbo run build --filter=@mcua/core

# Type-check a service and its dependencies
npx turbo run type-check --filter=@mcua/agent-orchestrator...

# Run tests for all packages matching a pattern
npx turbo run test --filter="@mcua/libs-*"
```

### Database Workflows (API)

```bash
cd apps/api

# Generate Prisma client after schema changes
npm run db:generate

# Create and apply a migration
npm run db:migrate

# Open Prisma Studio (visual database browser)
npm run db:studio

# Seed the database with test data
npm run db:seed
```

## Coding Standards

### TypeScript

- **Strict mode is mandatory.** The root `tsconfig.base.json` enforces `"strict": true`.
- Prefer explicit return types on exported functions.
- Use `unknown` over `any`. If `any` is truly required, add a `// eslint-disable-next-line` comment with a reason.
- Use discriminated unions over optional fields where the shape depends on a variant.
- Prefer `readonly` arrays and properties where mutation is not needed.
- Use `type` for data shapes and `interface` for contracts that may be extended.

### React

- Use functional components exclusively.
- Prefer named exports over default exports.
- Co-locate component tests with the component file (e.g., `Button.tsx` / `Button.test.tsx`).
- Use `React.memo` only when profiling shows a measurable benefit.
- Keep components focused: one responsibility per component.

### File Naming

| Kind | Convention | Example |
|------|-----------|---------|
| React component | PascalCase | `TimelineTrack.tsx` |
| Hook | camelCase with `use` prefix | `useProjectStore.ts` |
| Utility / helper | camelCase | `formatTimecode.ts` |
| Constant / config | camelCase or SCREAMING_SNAKE | `defaultSettings.ts` |
| Test file | Same name + `.test` suffix | `TimelineTrack.test.tsx` |
| Type definition | PascalCase | `ProjectTypes.ts` |

### Import Ordering

Imports should follow this order, separated by blank lines:

1. Node.js built-ins (`node:path`, `node:fs`)
2. External packages (`react`, `express`, `zustand`)
3. Internal packages (`@mcua/core`, `@mcua/ui`)
4. Relative imports (`./components`, `../utils`)
5. Type-only imports (`import type { ... }`)

### Formatting

This project uses Prettier for code formatting. The configuration is in `.prettierrc`:

- Semicolons: yes
- Single quotes: yes
- Tab width: 2 spaces
- Trailing commas: ES5
- Print width: 100
- Bracket spacing: yes
- Arrow function parentheses: always

Run the formatter before committing:

```bash
npx prettier --write "**/*.{ts,tsx,json,md}"
```

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, semicolons, etc. (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, tooling, CI changes |
| `revert` | Reverts a previous commit |

### Scopes

Use the package name without the `@mcua/` prefix as the scope:

```
feat(core): add timeline clip splitting
fix(web): correct playhead position on resize
chore(api): upgrade Prisma to v5.16
docs(desktop): update packaging instructions
```

## Pull Request Process

1. **Before opening a PR**, ensure:
   - `npm run type-check` passes with no errors
   - `npm run lint` passes with no errors
   - `npm run test` passes with no failures
   - Your branch is up to date with `master`

2. **Fill out the PR template** completely. Include:
   - A clear description of what changed and why
   - Screenshots or recordings for UI changes
   - Testing steps for reviewers
   - Any migration or breaking change notes

3. **PR requirements**:
   - At least one approving review before merge
   - All CI checks must pass
   - No unresolved review comments
   - Squash merge to keep a clean history on `master`

4. **Review guidelines for reviewers**:
   - Focus on correctness, clarity, and maintainability
   - Check that tests cover the change adequately
   - Verify that TypeScript types are precise (no unnecessary `any`)
   - Confirm that no new warnings are introduced

## Testing

### Running Tests

```bash
# All tests
npm run test

# Watch mode (web)
cd apps/web && npm run test:watch

# Coverage report (web)
cd apps/web && npm run test:coverage

# Specific package
npx turbo run test --filter=@mcua/core
```

### Testing Conventions

- Use **Vitest** as the test runner across all packages.
- Place test files adjacent to the code they test.
- Name test files with the `.test.ts` or `.test.tsx` suffix.
- Use `describe` / `it` blocks with clear, behavior-focused descriptions.
- Mock external services at the boundary (e.g., mock the HTTP client, not the business logic).

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';

describe('formatTimecode', () => {
  it('formats zero frames as 00:00:00:00', () => {
    expect(formatTimecode(0, 24)).toBe('00:00:00:00');
  });

  it('handles drop-frame timecode at 29.97fps', () => {
    expect(formatTimecode(1800, 29.97)).toBe('00:01:00;02');
  });
});
```

## Troubleshooting

### Common Issues

**`npm install` fails with workspace resolution errors**
```bash
# Clear all caches and reinstall
npm run clean
npm install
```

**Docker services won't start**
```bash
# Check for port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9000  # MinIO

# Reset Docker volumes
docker compose down -v
docker compose up -d
```

**TypeScript errors after pulling new changes**
```bash
# Rebuild all packages (dependencies resolve in order)
npm run build
```

**Electron app won't start**
```bash
cd apps/desktop
npm run postinstall   # Rebuild native modules
npm run dev
```

### Getting Help

- Check existing [issues](https://github.com/gaubuchon-design/the-avid/issues) before filing a new one.
- For questions, open a [discussion](https://github.com/gaubuchon-design/the-avid/discussions).
- For security vulnerabilities, email security@theavid.app (do not open a public issue).
