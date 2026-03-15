# PRD: The Avid — Gap Closure & Leapfrog Strategy

**Document ID:** PRD-2026-001
**Author:** @product-manager, with input from @competitive-analyst
**Status:** DRAFT — Awaiting Approval
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Reviewers:** @architect, @platform-engineer, @frontend-engineer, @ai-engineer, @ux-designer

---

## 1. Problem Statement

The professional NLE market is undergoing its most significant shift in a decade. Adobe is shipping agentic AI features (Quick Cut), Blackmagic has delivered AI-powered script-to-timeline assembly (IntelliScript), and a new wave of AI-native startups (CapCut Pro, Descript, Martini) are redefining what editors expect from their tools.

Avid Media Composer — still the broadcast and episodic standard — is falling behind on every axis except shared storage (NEXIS) and interchange (AAF). At $540–$1,300/yr with the fewest modern features of any major NLE, legacy MC's position is eroding. Customers are noticing.

The Avid is a ground-up, AI-native rebuild. We have a clean-sheet architecture advantage that no incumbent can replicate without rebuilding their products. But that advantage is perishable: every month we spend on parity before shipping differentiation, competitors close the gap from the other direction.

**This PRD defines what we build, in what order, and why — to close critical parity gaps while establishing category-defining differentiation in three areas no competitor owns.**

---

## 2. User Segments

| Segment | Description | Primary Need | Size |
|---|---|---|---|
| **Broadcast Editor** | Staff editor at a news network or episodic post house. Lives in MC 8+ hours/day. Uses NEXIS, bin locking, AAF turnovers. | Reliability, speed, collaboration, interchange | ~50K users |
| **Freelance Post Editor** | Works across facilities and shows. Switches between MC, Premiere, Resolve depending on the gig. | Flexibility, format support, keyboard familiarity | ~200K users |
| **AI-Curious Professional** | Mid-career editor who sees AI tools shipping in Premiere/Resolve and wants to stay competitive. Willing to try new paradigms if they save real time. | Transcript-first workflows, smart assembly, time savings | ~100K users (growing) |
| **Next-Gen Editor** | Learned on Premiere or Resolve. Has never used MC. Evaluates tools on modern UX, AI capability, and price. | Modern interface, AI-native, accessible pricing | ~500K users |
| **Facility Technical Lead** | Evaluates and deploys NLEs across a post facility. Cares about security, compliance, deployment, and total cost of ownership. | Enterprise features, NEXIS parity, audit trails, SSO | ~10K decision-makers |

---

## 3. Strategic Pillars

### Pillar 1: Professional Editorial Parity
Ship the core editing capabilities that broadcast and post professionals require. Without these, we do not get evaluated.

### Pillar 2: AI-Native Differentiation
Deliver AI capabilities that are architecturally impossible for incumbents to replicate without rebuilding — because our data model, timeline model, and agent interface were designed for AI from day one.

### Pillar 3: Multi-Surface Continuity
Enable workflows that span desktop, browser, and mobile against a single project state — something no competitor offers today.

---

## 4. Initiatives

### 4.1 — PARITY: Timeline Engine

**Priority:** P0
**Prompt:** 04
**Target Segment:** All
**Dependency:** None (current foundation supports this)

#### User Stories

- As a broadcast editor, I need splice-in, overwrite, lift, and extract so I can assemble sequences using the same mental model I've used for 20 years.
- As a freelance editor, I need asymmetric trim, slip, slide, and ripple so I can refine cuts at the frame level without workarounds.
- As any editor, I need a 500-step undo/redo stack so I can experiment freely and recover from mistakes.

#### Acceptance Criteria

- [ ] Multi-track timeline with video and audio tracks (minimum 24 tracks each)
- [ ] Edit modes: splice-in, overwrite, lift, extract, replace
- [ ] Trim modes: single-roller, dual-roller (ripple/roll), slip, slide
- [ ] Asymmetric trim (Avid's signature capability — both sides independently adjustable)
- [ ] Track patching: source-to-record track assignment with visual UI
- [ ] Sync locks: prevent unintentional audio/video drift across linked tracks
- [ ] Add edit / razor blade with snap-to-playhead
- [ ] Snap system: clip edges, markers, playhead, timecode values
- [ ] Marker system: 8 colors, with optional comments, navigable
- [ ] Track headers: lock, mute, solo, sync lock toggles per track
- [ ] JKL shuttle playback with variable speed (1x, 2x, 4x, 8x forward/reverse)
- [ ] Undo/redo stack of 500 operations minimum
- [ ] Timeline zoom/scroll: mouse wheel, keyboard, fit-to-window
- [ ] Clip drag-and-drop within timeline and from bin to timeline
- [ ] Keyboard-driven editing parity with legacy MC (all 40+ mapped shortcuts functional)
- [ ] Performance: 60fps UI with 100+ clips on timeline, no jank

#### Out of Scope

- Multicam editing (deferred to Phase 2)
- Nested sequences (deferred)
- Effect rendering on timeline (Prompt 08)

#### Success Metrics

- An experienced MC editor can perform a basic assembly edit using only keyboard shortcuts within 5 minutes of first launch
- Timeline renders at 60fps with 200 clips across 16 tracks on an M1 MacBook Air

#### Definition of Done

- All acceptance criteria pass
- Unit tests for EditEngine covering all edit modes and trim types
- Integration test: import a bin of clips → assemble a 2-minute sequence using splice/overwrite → trim → export EDL → verify frame accuracy

---

### 4.2 — PARITY: Playback & Media Pipeline

**Priority:** P0
**Prompt:** 05
**Dependency:** 4.1 (Timeline Engine)

#### User Stories

- As a broadcast editor, I need frame-accurate playback of MXF and DNxHD media from shared storage so I can work with facility media.
- As any editor, I need source and record monitors with in/out marking so I can review and select material before cutting.
- As an editor working with 4K+ media, I need automatic proxy fallback so playback stays real-time on my hardware.

#### Acceptance Criteria

- [ ] PlaybackEngine with decode pipeline: H.264, H.265, ProRes, DNxHD/HR, MXF OP1a/OPAtom
- [ ] Source monitor: load clip from bin, scrub, mark in/out, match frame
- [ ] Record monitor: display timeline at playhead, mark in/out on sequence
- [ ] Frame-accurate playback: 0 frame tolerance at all supported frame rates (23.976, 24, 25, 29.97, 30, 50, 59.94, 60)
- [ ] JKL shuttle in both monitors
- [ ] Proxy workflow: background transcode on ingest, automatic fallback to proxy when full-res can't sustain real-time
- [ ] Video scopes: waveform, vectorscope, histogram (at minimum)
- [ ] Audio scrubbing during shuttle
- [ ] Mark Clip (set in/out to clip boundaries) and Find Flash (locate flash frames)
- [ ] GPU-accelerated decode where available (Metal on macOS, WebCodecs in browser)
- [ ] Graceful degradation: if GPU decode unavailable, fall back to software decode with frame dropping

#### Out of Scope

- RED R3D and BRAW native decode (Phase 2 — plugin-based)
- HDR display pipeline (Phase 2)
- NEXIS streaming (requires platform layer work — deferred)

#### Success Metrics

- 4K ProRes playback at 24fps on M1 MacBook Pro with <16ms frame delivery
- Proxy fallback triggers within 500ms of detecting sustained frame drops
- Source/record workflow matches legacy MC interaction model (validated by UX review)

#### Definition of Done

- All acceptance criteria pass
- Benchmark suite: decode latency × codec × resolution matrix
- Frame-accuracy test: render 10,000 frames → verify each against reference

---

### 4.3 — LEAPFROG: Transcript-First AI Editorial

**Priority:** P0 (pulled forward from original Prompt 09 position)
**Prompt:** 09 (executed in parallel with Prompts 06–08)
**Target Segment:** AI-Curious Professional, Next-Gen Editor, Broadcast Editor
**Dependency:** 4.1 (Timeline Engine), 4.2 (Playback)

> **Strategic rationale:** This is our primary differentiator. No competitor treats the transcript as the primary editing surface. No competitor exposes observable, auditable AI. Shipping this before full parity signals to the market that The Avid is a new category, not a catch-up product.

#### User Stories

- As a documentary editor, I want to highlight passages in a transcript and have the timeline auto-assemble from those selections, so I can build a rough cut in minutes instead of hours.
- As a news editor, I want to search across all transcripts in my project for a phrase and jump directly to that moment in the timeline, so I can find the soundbite I need under deadline pressure.
- As any editor, I want to see exactly what the AI plans to do before it does it, approve or modify the plan, and undo any AI action, so I stay in creative control.
- As a facility technical lead, I want a full audit trail of every AI action taken in a project, so I can verify editorial decisions for compliance and legal review.

#### Acceptance Criteria

**Transcript as Primary Surface:**
- [ ] AI-powered speech-to-text transcription with word-level timestamps and speaker diarization
- [ ] Transcript panel as a first-class editing surface: select text → create timeline selection
- [ ] Highlight transcript passages → one-click "Assemble" creates a sequence from selected dialogue
- [ ] Edit transcript text → corresponding timeline clips adjust (delete sentence → lift/extract on timeline)
- [ ] Transcript search across all project media with results linked to timecode
- [ ] Script import (PDF, Final Draft, Fountain) with auto-alignment to transcribed dailies
- [ ] Script-to-cut: import a script, match to transcribed footage, propose an assembly

**Observable AI:**
- [ ] Agent Plan Preview: before any AI action, display a step-by-step plan with estimated cost/time
- [ ] Approval gates: user must approve the plan before execution begins
- [ ] Step-by-step progress: each agent step shows what it did, what changed, and is individually reversible
- [ ] AI Action History: full audit log of all AI actions per project — who triggered, what was planned, what was executed, what was approved/rejected
- [ ] AI actions integrate with the standard undo/redo stack
- [ ] "AI Off" mode: one toggle disables all AI features globally — the app works as a traditional NLE

**Agentic Capabilities:**
- [ ] Natural language editorial commands: "Find all close-ups of the interview subject and create a selects bin"
- [ ] Multi-turn agent interaction: give feedback on AI output, agent iterates
- [ ] Smart bin organization: auto-tag, auto-categorize ingested media
- [ ] Scene detection with semantic understanding (not just cut detection — topic/mood/shot-type classification)
- [ ] AI-suggested rough cut from selected material with pacing parameters (fast/medium/slow)
- [ ] Auto-caption generation (SRT, VTT) with manual correction UI

**Privacy & Control:**
- [ ] On-device inference for transcription (no cloud required for core STT)
- [ ] Cloud inference (AWS Bedrock) available for advanced features with explicit per-project opt-in
- [ ] Token budget tracking: per-user and per-project AI usage visible and configurable
- [ ] No AI training on user content — ever. Documented and enforceable.

#### Out of Scope

- AI color grading suggestions (deferred to Phase 2)
- AI audio mixing (deferred to Phase 2)
- Generative video/image creation (intentionally excluded — see Strategy section)
- Voice cloning or AI voiceover (intentionally excluded)

#### Success Metrics

- Transcript-to-rough-cut assembly: 10-minute interview → watchable rough cut in <2 minutes (vs. ~45 minutes manual)
- Transcript search returns results in <500ms across a 100-clip project
- AI plan approval rate: >80% of suggested plans are approved without modification (measures AI quality)
- Audit trail completeness: 100% of AI actions logged with reversibility metadata
- Editor trust score: >4/5 in user testing ("I feel in control of what the AI is doing")

#### Definition of Done

- All acceptance criteria pass
- User testing with 5 broadcast editors (legacy MC users): can complete transcript-to-rough-cut workflow without training
- Security review by @security-engineer: all AI data flows documented, no content leaves device without explicit consent
- Performance: transcription of 1 hour of footage completes in <10 minutes on M1 MacBook Pro (on-device)

---

### 4.4 — LEAPFROG: Real-Time Collaboration & Multi-Surface

**Priority:** P1
**Prompt:** 10
**Target Segment:** Broadcast Editor, Facility Technical Lead
**Dependency:** 4.1 (Timeline), 4.3 (AI — for collaborative AI review)

#### User Stories

- As a news producer, I want to review and comment on an editor's sequence from my browser while they work in the desktop app, so I can give feedback without walking to their bay.
- As a field producer, I want to log and tag footage on my iPad and have those selections appear in the editor's bin in real-time, so the assembly can start before I'm back at the facility.
- As a facility lead, I want bin locking and conflict resolution that matches NEXIS behavior, so my team can work concurrently without overwriting each other.

#### Acceptance Criteria

**Collaboration:**
- [ ] CRDT-based (Y.js) project state: edits from multiple clients merge without conflicts
- [ ] Presence indicators: see who is in the project, where their playhead is, what they're selecting
- [ ] Bin locking: explicit lock/unlock with visual indicators (matches legacy MC NEXIS behavior)
- [ ] Frame-accurate comments: pin a comment to a timecode range on the timeline with threaded replies
- [ ] Version snapshots: save named versions, diff between versions, restore any version
- [ ] Activity feed: chronological log of all project changes across all collaborators

**Multi-Surface:**
- [ ] Desktop app (Electron): full editing capabilities
- [ ] Browser app (PWA): review, comment, log, light editing (trim, rearrange, mark in/out)
- [ ] Mobile app (React Native): log footage, tag, comment, review — no timeline editing
- [ ] All surfaces operate against the same project state via CRDT sync
- [ ] Offline support: local-first project packages work without connectivity; sync on reconnect
- [ ] Conflict resolution UI: when concurrent edits conflict, present a clear merge interface

**Infrastructure:**
- [ ] WebSocket-based real-time sync (Colyseus or equivalent)
- [ ] Background sync: changes push/pull in background without blocking editing
- [ ] Bandwidth-adaptive: sync metadata first, media proxies on demand, full-res on request
- [ ] End-to-end encryption for project data in transit

#### Out of Scope

- Live simultaneous timeline editing by multiple editors (Phase 2 — start with sequential/bin-locked model)
- NEXIS direct integration (requires platform partnership work)
- Video call / screen share within app

#### Success Metrics

- Comment posted in browser appears in desktop app in <1 second
- Bin tag applied on mobile appears in desktop bin in <2 seconds
- Offline edit → reconnect → sync completes without data loss (tested with 50 offline edits)
- Bin locking prevents concurrent writes with 0 race conditions (stress test: 10 concurrent clients)

#### Definition of Done

- All acceptance criteria pass
- Load test: 10 concurrent clients, 500 clips, 5 sequences — no sync failures
- Security review: E2E encryption verified, no plaintext project data in transit
- UX review: collaboration interactions match legacy NEXIS mental model for broadcast editors

---

### 4.5 — PARITY: Color Grading

**Priority:** P1
**Prompt:** 06
**Dependency:** 4.2 (Playback — need real-time video pipeline)

#### User Stories

- As an editor finishing a project in-app, I need primary color correction (lift/gamma/gain, curves, white balance) so I can deliver without round-tripping to Resolve.
- As an editor receiving graded media, I need LUT support so I can apply show LUTs and camera LUTs during editorial.

#### Acceptance Criteria

- [ ] Color wheels: lift, gamma, gain with numeric precision
- [ ] RGB curves editor (master + individual channels)
- [ ] Hue vs. Saturation, Hue vs. Hue, Hue vs. Luminance curves
- [ ] LUT loading: .cube, .3dl — apply as input, timeline, or output LUT
- [ ] Node-based color pipeline (minimum: 3 serial nodes per clip)
- [ ] Color match: sample reference frame, apply match to target
- [ ] Gallery: save and recall color grades as stills
- [ ] Qualification / secondary correction: HSL keyer for targeted adjustments
- [ ] Real-time preview at minimum 1080p 24fps during grading
- [ ] WebGPU-accelerated processing with Canvas2D fallback

#### Out of Scope

- HDR grading / Dolby Vision metadata (Phase 2)
- Power windows / advanced masking (Phase 2)
- ACES color management (Phase 2)

#### Success Metrics

- A colorist can perform a basic primary grade + LUT application in <30 seconds per clip
- Color pipeline adds <4ms latency to the playback path at 1080p

#### Definition of Done

- All acceptance criteria pass
- Visual regression tests: 20 reference grades rendered and compared pixel-by-pixel
- Performance benchmark: color pipeline latency measured per node count (1, 3, 6 nodes)

---

### 4.6 — PARITY: Audio Editing & Mixing

**Priority:** P1
**Prompt:** 07
**Dependency:** 4.2 (Playback)

#### User Stories

- As a broadcast editor, I need per-track EQ and dynamics so I can deliver a clean mix without sending to a dedicated audio suite.
- As any editor, I need LUFS metering so I can verify my mix meets broadcast loudness standards.

#### Acceptance Criteria

- [ ] Audio mixer: channel strip per track with fader, pan, mute, solo
- [ ] Per-track 10-band parametric EQ with visual frequency display
- [ ] Per-track dynamics: compressor, limiter, gate
- [ ] Auxiliary sends and returns (minimum 4 buses)
- [ ] LUFS metering (ITU-R BS.1770-4): integrated, momentary, short-term, true peak
- [ ] VU meters per track and master
- [ ] Audio scrubbing at variable speeds (synced with JKL)
- [ ] Audio keyframes: volume, pan automation on timeline
- [ ] Waveform display on timeline tracks (already partially built)
- [ ] Web Audio API routing graph with <10ms latency

#### Out of Scope

- Surround sound mixing (Phase 2)
- VST/AU plugin hosting (Phase 2)
- ProTools session import/export (Phase 2)

#### Success Metrics

- Audio pipeline round-trip latency <10ms
- LUFS metering accuracy within ±0.1 LU of reference implementation

#### Definition of Done

- All acceptance criteria pass
- Metering validation: test signals measured against reference LUFS calculator
- Latency benchmark: Web Audio API pipeline measured end-to-end

---

### 4.7 — PARITY: Effects & Compositing

**Priority:** P1
**Prompt:** 08
**Dependency:** 4.1 (Timeline), 4.5 (Color — shares GPU pipeline)

#### User Stories

- As an editor, I need transitions (dissolve, wipe, dip-to-color) and basic motion effects (resize, reposition, crop) so I can complete standard editorial work without round-tripping.
- As an editor, I need keyframe animation so I can create picture-in-picture, lower thirds positioning, and basic motion graphics.

#### Acceptance Criteria

- [ ] Effect chain per clip: ordered list of effects with enable/disable toggle
- [ ] Built-in transitions: dissolve, dip-to-black, dip-to-white, wipe (8 directions), push
- [ ] Motion effect: position, scale, rotation, anchor point, opacity with keyframes
- [ ] Keyframe types: linear, bezier (with curve editor), hold
- [ ] Keyframe copy/paste across clips
- [ ] Speed effects: constant speed change, freeze frame, reverse
- [ ] Title tool: basic text insertion with font, size, color, position, drop shadow
- [ ] Effect browser: categorized, searchable, with thumbnail previews
- [ ] SmartRenderEngine: frame cache for rendered effects, invalidation on edit
- [ ] Real-time preview for ≤3 effects per clip at 1080p

#### Out of Scope

- OpenFX plugin support (Phase 2)
- 3D compositing (out of scope entirely — use After Effects/Fusion)
- Advanced title templates / motion graphics (Phase 2)

#### Success Metrics

- Dissolve transition renders in real-time at 1080p without frame drops
- Keyframe curve editor interaction at 60fps

#### Definition of Done

- All acceptance criteria pass
- Render accuracy tests: effects rendered against reference frames
- Cache invalidation tests: edit a clip with cached effects → verify re-render triggers correctly

---

### 4.8 — PARITY: Export & Delivery

**Priority:** P1
**Prompt:** 11
**Dependency:** 4.2 (Playback), 4.5 (Color), 4.7 (Effects)

#### User Stories

- As a broadcast editor, I need to export MXF OP1a with DNxHD for playout server delivery.
- As an editor delivering for streaming, I need H.264/H.265 export with configurable bitrate and resolution.
- As an editor handing off to audio/VFX, I need AAF and XML export with frame-accurate EDL.

#### Acceptance Criteria

- [ ] Export presets: Broadcast (MXF/DNxHD), Streaming (H.264/H.265), Archive (ProRes 4444), Social (H.264 optimized for platform)
- [ ] Custom export: codec, container, resolution, frame rate, bitrate, audio channels all configurable
- [ ] Supported output codecs: H.264, H.265, ProRes (422, 422 HQ, 4444), DNxHD, DNxHR, AV1
- [ ] Supported containers: MOV, MP4, MXF OP1a
- [ ] Interchange export: AAF, Final Cut Pro XML, EDL (CMX 3600)
- [ ] Caption/subtitle export: SRT, VTT, SCC, TTML (integrated with AI transcript)
- [ ] Background export: rendering continues while editing
- [ ] Export queue: batch multiple exports with different settings
- [ ] Progress indication with time remaining estimate
- [ ] GPU-accelerated encoding where available

#### Out of Scope

- Direct publish to YouTube/Instagram/TikTok (Phase 2)
- DCP/IMF mastering (Phase 2)
- Dolby Vision / HDR10+ metadata (Phase 2)

#### Success Metrics

- 10-minute 1080p H.264 export completes in <2 minutes on M1 MacBook Pro
- AAF export round-trips to Pro Tools with frame-accurate media references (verified by @qa-engineer)
- Background export does not degrade editing performance by >10%

#### Definition of Done

- All acceptance criteria pass
- Interchange validation: AAF → Pro Tools → verify sync, XML → Premiere → verify edits, EDL → Resolve → verify cuts
- Codec quality validation: exported files pass QC against broadcast specs

---

## 5. What We Are Intentionally NOT Building

| Feature | Rationale | Competitor That Owns It |
|---|---|---|
| Generative video/image creation | Editors don't want AI-generated footage in their cuts. It's a demo feature, not an editorial tool. | Adobe Firefly, Runway, Luma |
| Full-stack color/VFX suite | We cannot out-build Resolve's 20-year color pipeline. Build "good enough" primary grading + best-in-class interchange to Resolve. | Blackmagic (DaVinci Resolve) |
| Creator/social-first features | Different market, different product, different price point. Don't dilute. | CapCut, Descript |
| AI-generated music or voiceover | Trust and quality aren't there yet. Editors won't use synthetic audio in professional deliverables. | Nobody (market not ready) |
| Consumer-grade AI magic | One-click "make it look cinematic" effects. Our users are professionals — give them controls, not presets. | CapCut, consumer apps |

---

## 6. Build Sequence & Phasing

### Phase 1: Foundation (COMPLETE)
- ✅ Type system, state management, design system
- ✅ App shell, docking layout, command palette
- ✅ Media management: bins, ingest, metadata

### Phase 2: Core Editorial (Next)

```
┌─────────────────────────────────────────────┐
│ 4.1 Timeline Engine (P0)                    │
│   └─→ 4.2 Playback & Codecs (P0)           │
│         ├─→ 4.3 AI/Transcript (P0) ←── LEAPFROG
│         ├─→ 4.5 Color Grading (P1)         │
│         ├─→ 4.6 Audio Editing (P1)         │
│         └─→ 4.7 Effects (P1)              │
│              └─→ 4.8 Export (P1)           │
└─────────────────────────────────────────────┘
```

**Critical path:** Timeline → Playback → AI (differentiation) + Color/Audio/Effects (parity) → Export

**Key decision:** AI (4.3) runs in parallel with Color/Audio/Effects, not after. This is the strategic accelerator.

### Phase 3: Collaboration & Platform
- 4.4 Collaboration & Multi-Surface
- Browser PWA optimization
- Mobile app (React Native)

### Phase 4: Growth
- Plugin system & marketplace
- Admin & governance (RBAC, SSO, audit)
- Enterprise features (NEXIS integration, facility deployment)

---

## 7. Pricing Recommendation

Based on competitive analysis:

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Full editor, single-user, watermark on export, no AI features |
| **Pro** | $29/mo or $299/yr | Full editor, AI features (token budget included), no watermark, up to 3 devices |
| **Team** | $49/mo per seat or $499/yr per seat | Pro + real-time collaboration, bin locking, shared project server, priority support |
| **Enterprise** | Custom | Team + SSO/SAML, audit logging, NEXIS integration, on-prem deployment option, SLA, dedicated support |

**Rationale:**
- Free tier drives adoption among Next-Gen Editors (competes with Resolve free)
- $299/yr Pro undercuts Premiere ($276 single-app) while including AI features they charge extra for
- Team pricing targets facility adoption at less than half the cost of legacy MC
- Enterprise captures the broadcast/studio accounts that pay for reliability and compliance

---

## 8. Success Criteria (Product-Level)

| Metric | Target | Timeframe |
|---|---|---|
| An MC veteran can complete a standard assembly workflow | Without training or documentation | Phase 2 launch |
| Transcript-to-rough-cut time savings | 10x vs. manual assembly (measured) | Phase 2 launch |
| AI plan approval rate | >80% without modification | Phase 2 launch + 30 days |
| Editor trust score for AI features | >4/5 in user testing | Phase 2 launch |
| AAF round-trip to Pro Tools | Frame-accurate, 0 sync drift | Phase 2 launch |
| Real-time playback at 1080p/24fps | Sustained with ≤1 dropped frame per 10,000 | Phase 2 launch |
| Multi-surface sync latency | <2 seconds for metadata, <5 seconds for edits | Phase 3 launch |
| Free tier sign-ups | 10,000 in first 90 days | Public launch |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI differentiation window closes — Adobe/Resolve ship comparable features | High | High | Accelerate 4.3 (AI) to run parallel with parity work, not after it. Ship early, iterate. |
| On-device transcription quality doesn't match cloud-based competitors | Medium | High | Use Whisper large-v3 or equivalent as baseline; fallback to Bedrock for quality-critical use cases with user consent. |
| Timeline engine performance doesn't meet 60fps target on lower-end hardware | Medium | High | Invest in benchmark suite early (4.1); profile continuously; proxy pipeline (4.2) provides graceful degradation. |
| CRDT-based collaboration introduces merge conflicts that confuse editors | Medium | Medium | Design explicit conflict resolution UI; bin locking as default (matches NEXIS mental model); CRDT for metadata only initially. |
| Pricing undercuts revenue expectations | Low | Medium | Free tier is acquisition, not revenue. Monitor conversion to Pro/Team. Adjust AI token budgets to drive upgrade. |
| Broadcast customers reject browser/mobile editing surfaces as "not professional" | Medium | Low | Position browser/mobile as review + logging, not editing. Desktop remains the primary professional surface. |

---

## 10. Open Questions for Review

1. **@architect:** Is the CRDT (Y.js) approach for collaboration viable for timeline-level operations, or should we restrict CRDT to bins/metadata and use operational transform for timeline edits?
2. **@platform-engineer:** Can we achieve <10ms decode latency for 4K ProRes in the browser via WebCodecs, or do we need to scope browser playback to proxy-only?
3. **@ai-engineer:** What is the realistic on-device transcription speed for Whisper large-v3 on M1? The 10-minute/hour target is aggressive.
4. **@ux-designer:** The transcript-as-primary-surface paradigm needs interaction specs before we build. Can you produce wireframes for the transcript → timeline assembly flow?
5. **@security-engineer:** For the AI audit trail (4.3), what is the minimum logging schema that satisfies broadcast compliance requirements (NBC Universal, ITV/ITN)?
6. **@qa-engineer:** What is the minimum media compatibility matrix we need for Phase 2 launch? Can we ship with H.264 + ProRes + DNxHD and add codecs incrementally?

---

## Approval

| Role | Name | Status | Date |
|---|---|---|---|
| Product Owner | | ☐ PENDING | |
| Principal Architect | @architect | ☐ PENDING | |
| Engineering Lead | | ☐ PENDING | |
| UX Lead | @ux-designer | ☐ PENDING | |
| Security | @security-engineer | ☐ PENDING | |

---

*This document is the single source of truth for The Avid's gap closure and differentiation strategy. All sprint planning, backlog grooming, and feature scoping should reference this PRD. Updates require review by at least two approvers.*
