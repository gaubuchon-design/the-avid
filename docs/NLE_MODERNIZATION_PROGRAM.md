# NLE Modernization Program

This program turns The Avid from a broad product foundation into a credible professional NLE that modernizes the Media Composer model instead of loosely imitating it.

Related assessment:

- `docs/MEDIA_COMPOSER_UNIFICATION_ASSESSMENT.md` captures the current cross-surface architecture verdict, remaining Media Composer parity gaps, and production-oriented Codex prompts for closing them.
- `docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md` defines the repo plan for a real media middle layer that can run locally or as distributed services.
- `docs/UNIVERSAL_MEDIA_BACKEND_PROMPTS.md` turns that backend plan into implementation-ready Codex prompts.

## Starting Point

The current repository already has meaningful value:

- A shared project model across desktop, web, and mobile
- A real editorial shell with bins, monitors, timeline, transcript, review, and publish surfaces
- Desktop-native project packaging and a media ingest foundation
- Documentation that clearly identifies the remaining gaps

The same documentation is also explicit about what still blocks honest parity:

- No shipping-grade media engine
- Incomplete editorial depth for trim, sync, overwrite/splice, multicam, and keyboard-driven editing
- No serious finishing path across color, audio, VFX, captions, and delivery
- Incomplete interchange, collaboration, governance, and operational readiness

## North Star

Build a modernized Avid-style editing platform with:

- Media Composer-grade editorial reliability on desktop
- Local-first project and media workflows with facility-friendly handoff
- Browser and mobile surfaces that extend the workflow instead of pretending to be full desktop replacements
- Transcript-first and agentic workflows that are observable, reversible, and editorially safe

## Product Principles

- Desktop is the workstation. Web is collaboration and lightweight editorial. Mobile is review, logging, approvals, and cutdowns.
- Keyboard-first editing, monitor precision, timeline confidence, and predictable trim behavior matter more than feature volume.
- Transcript, script, and review context should accelerate editorial decisions, not replace editor control.
- Media management, interchange, and project portability are product features, not backend details.
- Every AI-assisted action must be inspectable, interruptible, and reversible.

## Release Standard

The product should not be called a fully fledged NLE until the following are true:

| Stream | Release bar |
| --- | --- |
| Editorial core | Source/record workflow, overwrite/splice, trim modes, sync locks, segment modes, slip/slide, matchback, markers, keyboard mapping, and timeline responsiveness are production-grade. |
| Media engine | Playback, compositing, audio monitoring, proxy/cache behavior, waveform generation, and render/export quality are reliable on workstation-scale media. |
| Finishing | Color correction, titles/subtitles, effects/transitions, audio mixing, and final exports are real workflows rather than placeholders. |
| Interchange | EDL, OTIO, AAF, OMF, XML, caption exchange, and Pro Tools turnover are implemented and verified against external tools. |
| Collaboration | Shared project state, locking/conflict rules, review, approvals, permissions, and audit history are real product capabilities. |
| Operations | CI, test gates, crash reporting, packaging/signing, telemetry, migration policy, entitlement management, and release channels are in place. |

## Program Workstreams

### 1. Editorial Core

- Finish overwrite, splice-in, replace edit, sync locks, track targeting, advanced trim, asymmetrical trim, segment modes, and robust keyboard parity.
- Harden timeline data structures and command semantics so every editorial operation is undoable and deterministic.
- Add monitor behaviors that match professional expectations: source/record parity, match frame, gang playback, loop playback, and reliable mark handling.

### 2. Media Engine

- Replace the current screener-grade render path with a real playback/compositing pipeline.
- Expand codec, proxy, thumbnail, waveform, cache, and background indexing support.
- Establish measurable performance targets for long timelines, multilayer edits, and mixed-format sequences.

### 3. Media Management and Facility Workflow

- Add serious relink UI, consolidate/transcode policy, watch-folder governance, shared storage semantics, and facility-safe project locking.
- Define the path from local project packages to NEXIS-like team workflows without breaking offline portability.

### 4. Finishing, Audio, and Effects

- Build practical color, audio, title, subtitle, transition, and effects tools that satisfy finishing needs for a first pro release.
- Prioritize editorially critical depth over exhaustive parity: color balance, scopes, loudness, routing, automation, caption authoring, and common transition/effect coverage.

### 5. Interchange and Delivery

- Deliver AAF/OMF/XML support, better EDL/OTIO fidelity, audio turnover, and validated round-tripping with Pro Tools and finishing systems.
- Upgrade exports from queue metadata to true deliverables with render profiles, burn-ins, captions, QC, and job history.

### 6. Collaboration, Security, and Enterprise Controls

- Build the real backend for sync, permissions, presence, approvals, billing, and governance.
- Add audit trails, policy enforcement, project history, role-based access, and deployment observability.

### 7. Workstation UI/UX

- Refactor the editor shell into a clearer workstation model with strong information hierarchy, persistent context, better docking behavior, and less prototype-style chrome.
- Standardize navigation, project context, panel states, status indicators, density rules, and keyboard discoverability.

### 8. Agentic Editorial Intelligence

- Connect AI panels to real orchestration, tool execution, and media-aware outputs.
- Focus on transcript alignment, search, rough-cut generation, review summarization, conform assists, and workflow automation with full auditability.

## Delivery Phases

### Phase 0: Program Reset

- Align product scope, definitions of done, and desktop/web/mobile boundaries.
- Refactor shell navigation and design system primitives.
- Establish benchmark scenes, parity test cases, and release scorecards.

### Phase 1: Editorial Alpha

- Complete core edit verbs and monitor behavior.
- Stabilize ingest, proxies, waveforms, playback basics, and large-project persistence.
- Ship the first usable assistant-editor workflow on desktop.

### Phase 2: Facility Beta

- Add serious media management, relink, background services, and early collaboration/locking.
- Validate interchange with assistant-editor and post-supervisor scenarios.

### Phase 3: Finishing Beta

- Reach practical color, audio, subtitle/title, and delivery depth.
- Add multicam and finishing-grade export expectations for desktop.

### Phase 4: Team Release Candidate

- Close shared project, governance, security, and operational gaps.
- Validate browser/mobile adjacencies for review, approvals, and lightweight cuts.

## Immediate Execution Plan

1. Consolidate the editor shell, navigation model, and project context so the UI can support a serious workstation workflow.
2. Define the media engine architecture and performance targets before more panel-level features are added.
3. Create parity acceptance tests for the top twenty editorial behaviors expected from Media Composer users.
4. Break interchange, audio, color, collaboration, and media-management work into independently shippable streams with owners and milestones.
5. Gate all new product claims against the release-standard table above.

## Operating Model

- Weekly triage on parity blockers, editor pain points, and regression risk
- Biweekly design and workflow review using real editorial scenarios
- Monthly milestone review against performance, parity, and reliability scorecards
- Every major stream needs product notes, design states, technical design, and acceptance tests before it is considered complete

## What This Pass Launches

- A formal roadmap for turning the repository into a real NLE instead of a broad prototype
- A workstation-shell refactor in the web editor that starts cleaning up navigation, context, and page/workspace state
- A clear sequence for closing the largest functional gaps instead of treating all parity work as one undifferentiated backlog
