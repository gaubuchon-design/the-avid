# Product Design Review: Audio & VFX Page Parity

**Document:** PDR-AV-001
**Date:** 2026-03-15
**Status:** Draft
**Author:** Product Engineering
**Stakeholders:** Audio Engineering, VFX Engineering, Platform Architecture, Pro Tools Integration Team

---

## 1. Executive Summary

This PDR defines the requirements for elevating The Avid's **Audio page** and **VFX page** to feature parity with DaVinci Resolve's Fairlight and Fusion pages, respectively — while building entirely on The Avid's existing services, engines, and store infrastructure. The Audio page carries an additional mandate: **differentiated functionality** leveraging our native access to the Pro Tools engine (AAX DSP offload, EUCON, Elastic Audio, Hybrid Engine, and the `.ptx` session format).

### Strategic Positioning

| Dimension | DaVinci Resolve | The Avid (Target) |
|---|---|---|
| **Audio** | Fairlight — capable but limited VST2/AU plugin ecosystem, no hardware DSP offload | **Pro Tools-native engine** — AAX Native + DSP, EUCON control surface protocol, Hybrid Engine (2,048 voices), Elastic Audio, industry-standard `.ptx` interchange |
| **VFX** | Fusion — node-based compositor, 250+ tools, particles, 3D workspace | **Node compositor** built on existing EffectsEngine + OpenFXBridge + CompositingEngine + PlanarTracker, with tight editorial round-trip via timeline integration |
| **Advantage** | Integrated post pipeline at low cost | Pro Tools engine access is a **moat** — no other NLE can offer AAX DSP, EUCON, and `.ptx` natively. Combined with editorial heritage, this positions The Avid as the only tool where an editor, mixer, and compositor share one project file. |

---

## 2. Current State Audit

### 2.1 Audio Infrastructure — What Exists

| Layer | Asset | Capabilities | Gap vs. Fairlight |
|---|---|---|---|
| **Store** | `audio.store.ts` | Per-track gain/pan/mute/solo, 10-band EQ, compressor, LUFS metering | No bus routing, no send architecture, no automation modes, no ADR, no immersive formats |
| **Engine** | `AudioEngine.ts` (15 KB) | Intrinsic audio (volume dB, pan, channel layout, resample) | No plugin hosting, no real-time effects chain, no DSP offload |
| **Engine** | `AudioMixerEngine.ts` | Mixer logic | No FlexBus-equivalent routing |
| **Engine** | `AudioPunchInEngine.ts` | Punch-in recording | Exists — needs ADR overlay |
| **Core** | `packages/core/src/audio/` | Broadcast presets (5.1, 7.1), Audio Description tracks, channel layouts | No immersive (Atmos/ambisonics), no Fairlight Accelerator equivalent |
| **Core** | `packages/core/src/protools/` | AAF import/export, session bridge, marker sync, MediaCentral bridge | Bridge exists but is interchange-only — no native engine hosting |
| **Store** | `protools.store.ts` | Session bridge status, playhead sync, CRDT co-presence, AAF diff | Session bridge is active — foundation for deeper integration |
| **Plugin** | `PluginRegistry.ts` | Marketplace with `audioEffect` type, permission model | No AAX host, no VST3/AU scanning, no DSP routing |

### 2.2 VFX Infrastructure — What Exists

| Layer | Asset | Capabilities | Gap vs. Fusion |
|---|---|---|---|
| **Store** | `effects.store.ts` | Clip-level effect stacking, keyframes, search/favorites | No node graph, no 3D workspace, no particles |
| **Engine** | `EffectsEngine.ts` (66 KB) | 32+ built-in effects, keyframe interpolation, parameter binding | Layer-based only — no node topology |
| **Engine** | `CompositingEngine.ts` | Multi-layer composition | No node DAG, no merge operations |
| **Engine** | `OpenFXBridge.ts` (65 KB) | OFX 1.4 plugin adapter, parameter mapping, GPU accel | Exists and is strong — needs node-graph integration |
| **Engine** | `FrameCompositor.ts` | Frame-level compositing | Good foundation — needs node evaluation pipeline |
| **Store** | `tracking.store.ts` | Planar tracker, region management, corner pin/stabilize | Exists — needs Fusion-grade camera tracker |
| **Engine** | `TitleEngine.ts` / `TitleRenderer.ts` | 2D title/motion graphics | No 3D text extrusion, no Fusion-grade text tools |
| **Engine** | `SpeedEffectsEngine.ts` | Time effects | Exists — integrate into node graph |
| **Core** | `packages/core/src/` | No VFX-specific vertical module | Need `packages/core/src/vfx/` |

---

## 3. Audio Page — Full Specification

### 3.1 Fairlight Parity Features

These features bring The Avid's Audio page to functional equivalence with Fairlight.

#### 3.1.1 FlexBus Routing Architecture

**Requirement:** Hierarchical bus routing with arbitrary track-to-bus, bus-to-bus topology.

| Parameter | Fairlight | The Avid Target |
|---|---|---|
| Sends per track | 10 bus outputs + 10 sends | **20 send slots** (unified — each routable to any bus or output) |
| Bus nesting depth | 6 layers | **8 layers** (match or exceed) |
| Bus channel formats | Mono → 9.1.6 (up to 36 ch) | Mono → 9.1.6 (up to 36 ch) — leverage `channelLayout.ts` |
| Main/Submix routing | Per-strip Main/Sub buttons | Per-strip routing matrix with visual bus graph |

**Implementation plan:**
- New `AudioBusEngine.ts` — bus creation, routing graph, signal flow resolution
- Extend `audio.store.ts` with `busses: AudioBusState[]`, `sends: SendState[]`, `routingGraph: RoutingEdge[]`
- Bus graph UI component in AudioMixer panel with drag-to-route interaction
- Reuse `BroadcastTrackPresets.ts` for channel format definitions

#### 3.1.2 Channel Strip Effects Chain

**Requirement:** 6 insert slots per channel strip + 6 insert slots per bus, supporting AAX Native, VST3, AU, and built-in effects.

| Slot | Processing |
|---|---|
| Insert 1–6 | User-assignable plugin instances (AAX/VST3/AU/built-in) |
| Built-in EQ | 6-band parametric (upgrade from current 10-band — match Fairlight's focused 6-band with more control per band) |
| Built-in Dynamics | Expander/Gate + Compressor + Limiter (expand from compressor-only) |

**Implementation plan:**
- New `AudioPluginHostEngine.ts` — AAX/VST3/AU plugin scanning, instantiation, parameter binding, preset management
- Extend `AudioTrackState` with `inserts: PluginSlot[6]`, `gate: GateState`, `limiter: LimiterState`
- Reuse `PluginRegistry.ts` marketplace for discovery; add AAX scanning via Pro Tools engine bridge

#### 3.1.3 Automation System

**Requirement:** Per-track automation modes with spline editor.

| Mode | Behavior |
|---|---|
| Read | Play existing automation |
| Write | Overwrite continuously |
| Touch | Write while touching, return to existing on release |
| Latch | Write while touching, hold last value on release |
| Trim | Offset existing automation relatively |
| Preview | Audition changes without committing |
| Capture | Snapshot all enabled parameters at current position |

**Implementation plan:**
- New `AudioAutomationEngine.ts` — mode state machine, automation lane read/write, spline interpolation
- Extend `audio.store.ts` with `automationMode: Record<trackId, AutomationMode>`, `automationLanes: AutomationLane[]`
- Automation Follows Edit option — synchronize with `EditOperationsEngine.ts` clip moves
- Spline editor component reusable with VFX keyframe editor

#### 3.1.4 Loudness Metering & Monitoring

**Requirement:** Broadcast-standard loudness measurement and visualization.

| Standard | Support |
|---|---|
| EBU R128 | Integrated LUFS, Short-term, Momentary, True Peak, LRA |
| ATSC A/85 | Dialogue-gated measurement |
| BS.1770-4 | ITU loudness algorithm |

**Implementation plan:**
- Extend `AudioEngine.ts` with real-time loudness computation (leveraging existing `currentLUFS` field)
- Add loudness history graph component (inline with bus metering)
- Offline analysis via `media.service.ts` probe pipeline — batch loudness normalization
- Color-coded meters: blue (compliant), yellow (tolerance), red (exceeds)

#### 3.1.5 ADR / Voice-Over / Foley

**Requirement:** Integrated recording workflow for dialogue replacement, voice-over, and foley.

| Feature | Description |
|---|---|
| ADR Panel | Cue list with character, dialogue text, timecode in/out, take management |
| Visual Cues | Countdown, beeps, streamers, text prompts on Record Monitor |
| Voice-Over Tool | One-click record to timeline with auto track creation, on-screen prompter |
| Foley Sampler | MIDI/keyboard-triggered sample playback for foley performance |

**Implementation plan:**
- New `ADREngine.ts` — cue list management, take tracking, rating system
- Extend `AudioPunchInEngine.ts` with ADR overlay mode (countdown, streamer rendering)
- Voice-over panel component — integrate with `RecordMonitor` for prompter display
- Foley sampler leverages Web Audio API + sample library browser (reuse media bin navigation)

#### 3.1.6 Immersive Audio

**Requirement:** Object-based and channel-based immersive audio mixing.

| Format | Support |
|---|---|
| Dolby Atmos | 7.1.4 bed + object tracks, renderer integration |
| Ambisonics | Up to 5th order |
| MPEG-H | Object-based broadcast |
| Binaural | Real-time monitoring downmix for headphones |

**Implementation plan:**
- Extend `channelLayout.ts` with immersive channel definitions
- 3D panner component (hemisphere/sphere UI) in mixer strip
- Object track type in `AudioTrackState` — position (x/y/z), size, spread
- Atmos renderer bridge via Pro Tools engine (see 3.2.3)

---

### 3.2 Pro Tools Differentiation — Native Engine Access

These features are **exclusive to The Avid** and cannot be replicated by Fairlight or any competing NLE. They represent the core competitive moat.

#### 3.2.1 AAX Plugin Hosting (Native + DSP)

**Requirement:** Host AAX plugins natively within The Avid's audio page — both AAX Native (CPU) and AAX DSP (hardware-offloaded).

| Capability | Description |
|---|---|
| AAX Native | CPU-hosted AAX plugins — full Pro Tools plugin ecosystem access |
| AAX DSP | Hardware-offloaded plugins via HDX card — near-zero latency monitoring (0.7ms at 96kHz/64-sample) |
| Hybrid Engine | Unified CPU + DSP voice allocation — up to 2,048 simultaneous voices |
| Plugin Scanning | Automatic AAX/VST3/AU plugin discovery with compatibility matrix |
| Preset Management | Shared preset library between The Avid and Pro Tools sessions |

**Implementation plan:**
- New `AAXHostEngine.ts` — AAX plugin instantiation, parameter binding, DSP routing
- Extend `ProToolsSessionBridge.ts` to expose engine services (not just session interchange)
- `HybridVoiceAllocator` — dynamic CPU/DSP voice assignment based on HDX card availability
- `AudioPluginHostEngine.ts` unifies AAX + VST3 + AU under single interface
- Desktop-only: HDX card detection in `PlatformCapabilities.ts`; web falls back to AAX Native-only via WASM bridge

#### 3.2.2 EUCON Control Surface Protocol

**Requirement:** Native EUCON integration for hardware control surfaces (S1, S3, S4, S6, Artist Series).

| Capability | Description |
|---|---|
| Auto-mapping | Faders, knobs, and displays auto-map to focused panel (Audio mixer, timeline, color) |
| High-resolution | 10-bit fader resolution, 1024-step encoders (vs. 128-step MIDI) |
| Soft Keys | Surface soft keys map to The Avid commands via `KeyboardEngine.ts` |
| Multi-surface | Support multiple EUCON surfaces simultaneously |
| Cross-app | Surface follows focus between The Avid and Pro Tools sessions |

**Implementation plan:**
- New `EUCONBridge.ts` in `packages/core/src/protools/` — Ethernet discovery, surface registration, parameter mapping
- Integration with `KeyboardEngine.ts` (40 KB) for command dispatch from surface buttons
- Fader/knob events feed directly into `audio.store.ts` actions (setGain, setPan, etc.)
- Panel focus tracking via `WorkspaceEngine.ts` — surface layout follows active panel

#### 3.2.3 Elastic Audio / Time Stretching

**Requirement:** Warp-marker time stretching using Pro Tools' Elastic Audio engine.

| Algorithm | Use Case |
|---|---|
| Polyphonic | Music, complex harmonic content |
| Rhythmic | Drums, percussive content |
| Monophonic | Voice, solo instruments |
| elastique Pro V3 | High-quality general-purpose (zplane) |
| X-Form | Offline highest-quality rendering |

**Implementation plan:**
- New `ElasticAudioEngine.ts` — warp marker placement, algorithm selection, real-time preview
- Bridge to Pro Tools engine for actual DSP computation
- Warp markers visualized in timeline waveform display (`TimelineDisplayEngine.ts`)
- Tempo map integration — conform audio to sequence tempo changes
- Non-destructive: original media preserved, warp data stored in project

#### 3.2.4 Pro Tools Session Bridge (Deep Integration)

**Requirement:** Go beyond AAF interchange — provide live session co-editing between The Avid and Pro Tools.

| Capability | Current State | Target |
|---|---|---|
| AAF Import/Export | `ProToolsAAFImporter.ts`, `ProToolsAAFExporter.ts` | Maintain — add real-time diff |
| Session Bridge | `ProToolsSessionBridge.ts` — status, playhead sync | **Live bidirectional sync** — edits in PT appear in The Avid and vice versa |
| Marker Sync | `MarkerSync.ts` — sync with conflict resolution | Maintain and extend |
| Co-presence | CRDT-based via `protools.store.ts` | Extend with per-track lock/unlock |
| Plugin State | Not synced | **Mirror plugin chains** — same AAX instances accessible from both apps |
| `.ptx` Native Open | Not supported | **Open and save `.ptx` sessions directly** — no AAF round-trip needed |

**Implementation plan:**
- Extend `ProToolsSessionBridge.ts` with bidirectional edit propagation (leverage existing CRDT infrastructure)
- New `PTXSessionEngine.ts` — native `.ptx` parser and writer
- Plugin state serialization in bridge protocol — mirror insert chains
- MediaCentral bridge (`MediaCentralBridge.ts`) for cloud-hosted session sharing

#### 3.2.5 Advanced Automation (Pro Tools Parity)

Beyond Fairlight's basic automation modes, leverage Pro Tools' full automation system:

| Feature | Description |
|---|---|
| Write to All Enabled | Simultaneously write automation for all enabled parameters |
| Latch Prime in Stop | Pre-arm automation values before playback |
| Capture Punch / Preview Punch | Audition and selectively commit automation |
| Automation Follows Edit | Automation data moves with clip operations |
| Fader-to-Clip Conversion | Convert fader automation to clip gain for interchange |
| 10-bit Resolution | Hardware fader resolution preserved in automation data |

**Implementation plan:**
- Extend `AudioAutomationEngine.ts` with Pro Tools-specific modes
- Automation data structure supports 10-bit resolution natively
- Automation-follows-edit hooks into `EditOperationsEngine.ts` transaction system

#### 3.2.6 SoundFlow Macro Integration

**Requirement:** Support SoundFlow's 1,700+ pre-built macros for automating repetitive audio tasks.

**Implementation plan:**
- New `SoundFlowBridge.ts` — SoundFlow script runner, macro library browser
- Map SoundFlow actions to The Avid's `commands.ts` / `commands.extended.ts` command system
- Surface macro triggers via EUCON soft keys

---

## 4. VFX Page — Full Specification

### 4.1 Fusion Parity Features

#### 4.1.1 Node-Based Compositing Graph

**Requirement:** Replace layer-based effects stacking with a node DAG (directed acyclic graph) compositor.

| Capability | Fusion | The Avid Target |
|---|---|---|
| Node types | 250+ built-in tools | **Phase 1:** 80 essential nodes (merge, transform, color, blur, key, mask, 3D, particle, text) built on existing `EffectsEngine.ts` 32 effects + `OpenFXBridge.ts` OFX plugins |
| Graph topology | Arbitrary DAG with branches/merges | Full DAG — multi-input merge nodes, split/combine, feedback loops (with cycle detection) |
| Evaluation | Left-to-right depth-first | Topological sort with GPU-parallel evaluation where branches are independent |

**Implementation plan:**
- New `NodeGraphEngine.ts` — node creation, connection, evaluation pipeline, caching
- New `vfx.store.ts` — node graph state, selected node, connection state, viewport transform
- New `NodeGraphPanel.tsx` — interactive node canvas with drag-connect UX
- Adapter layer wraps existing `EffectsEngine.ts` effects as nodes — preserves all 32+ built-in effects
- `OpenFXBridge.ts` plugins surface as nodes automatically
- `FrameCompositor.ts` becomes the render backend for node evaluation

#### 4.1.2 Merge & Compositing Nodes

| Node | Inputs | Description |
|---|---|---|
| Merge | FG + BG + Mask | Over, Under, In, Out, Atop, XOR, Screen, Multiply, Add, Subtract |
| ChannelBooleans | A + B | Per-channel copy/combine between inputs |
| MatteControl | Input + Garbage/Holdout | Matte refinement, shrink, blur, gamma |
| TimeStretcher | Input | Time remap (integrate `SpeedEffectsEngine.ts`) |
| Dissolve | A + B | Crossfade between inputs |

#### 4.1.3 Keying & Rotoscoping

| Tool | Current State | Enhancement |
|---|---|---|
| Chroma Key | `chroma-key` effect in EffectsEngine | Upgrade to Delta Keyer-grade: spill suppression, edge color, matte refinement |
| Luma Key | `luma-key` effect exists | Maintain — wrap as node |
| Ultra Key | Not implemented | Add — multi-sample keyer with advanced garbage matte |
| Rotoscope | Not implemented | New — Bezier/B-spline mask tool with per-point feathering, integrated with PlanarTracker for auto-animation |

**Implementation plan:**
- New `KeyerNode.ts` — unified keyer with multiple algorithms (chroma, luma, difference, ultra)
- Reuse `keyers.ts` (9 KB) from effects directory as foundation
- New `RotoscopeEngine.ts` — spline mask creation, point manipulation, feathering
- Integration with `tracking.store.ts` PlanarTracker for tracked roto masks

#### 4.1.4 Tracking & Stabilization

| Feature | Current State | Enhancement |
|---|---|---|
| Planar Tracker | `PlanarTracker` engine + `tracking.store.ts` | Maintain — expose as node |
| Point Tracker | Not implemented | Add — 1-4 point tracking for pin, stabilize, match-move |
| Camera Tracker | Not implemented | Add — 3D camera solve from 2D footage (output camera + point cloud) |
| Object Tracker | Not implemented | Add — AI-powered subject tracking (leverage `ai.service.ts`) |

**Implementation plan:**
- Wrap existing `PlanarTracker` as `PlanarTrackerNode`
- New `PointTrackerNode.ts` — classic pattern-match tracker
- New `CameraTrackerNode.ts` — structure-from-motion solve, outputs 3D camera node
- AI tracker leverages transcription/analysis pipeline in `ai.service.ts` for subject segmentation

#### 4.1.5 3D Workspace

| Feature | Description |
|---|---|
| 3D Scene | 3D coordinate system with camera, lights, and geometry |
| Camera Node | Virtual camera with lens properties (focal length, aperture, DOF) |
| Light Nodes | Point, spot, directional, ambient lights with shadows |
| Shape Nodes | Primitives (cube, sphere, plane, cylinder) + imported meshes |
| 3D Text | Extruded text with reflections, bump maps, shadows |
| 3D Merge | Combine 3D elements into scene |
| Renderer | GPU-accelerated 3D → 2D render with antialiasing |

**Implementation plan:**
- New `Scene3DEngine.ts` — scene graph, camera, lights, mesh loading
- Leverage `HardwareAccelerator.ts` for WebGPU/WebGL 3D rendering
- Extend `TitleEngine.ts` for 3D text extrusion
- glTF/FBX/OBJ mesh import via desktop media pipeline
- 3D viewport component with orbit/pan/zoom controls

#### 4.1.6 Particle System

| Node | Description |
|---|---|
| pEmitter | Generate particles — count, velocity, spread, lifetime, color |
| pImageEmitter | Emit particles from image luminance/alpha data |
| pRender | Render particles to 2D image or into 3D scene |
| pGravity | Apply gravity/wind forces |
| pBounce | Collision with geometry |
| pFlocking | Swarm/flock behavior |
| pCustomForce | Expression-driven custom forces |

**Implementation plan:**
- New `ParticleEngine.ts` — GPU-accelerated particle simulation via compute shaders
- Particle nodes in VFX node graph — emitter → behavior → render pipeline
- Integrate with 3D scene for volumetric particle effects

#### 4.1.7 Expression System

**Requirement:** Property-level expressions for procedural animation and dynamic parameter linking.

| Capability | Description |
|---|---|
| Syntax | JavaScript-based expressions (familiar to web developers) |
| Variables | Access to time, frame, clip duration, parameter values of any node |
| Functions | Math, noise, random, smooth, wiggle, ease, color conversion |
| Linking | Expression on any parameter can reference any other parameter |

**Implementation plan:**
- New `ExpressionEngine.ts` — sandboxed expression evaluator (no `eval` — use safe parser)
- Expression editor component with syntax highlighting and autocomplete
- Integrate with keyframe system — expressions override or modify keyframed values

#### 4.1.8 Template / Macro System

**Requirement:** Bundle complex node setups into reusable, distributable macros.

| Feature | Description |
|---|---|
| Macro Creation | Select nodes → Create Macro → choose exposed parameters |
| Macro Library | Searchable library (reuse effects panel favorites system) |
| Fusion Templates | Macros that appear in effects library on Edit page — drag onto timeline clips |
| Sharing | Export/import macros via project interchange or marketplace |

**Implementation plan:**
- Macro serialization format — JSON node graph subset with exposed parameter definitions
- Macro browser component — reuse `EffectsPanel.tsx` search/category/favorites patterns
- Integration with `PluginRegistry.ts` marketplace for community macro sharing

#### 4.1.9 Paint / Vector Paint

| Feature | Description |
|---|---|
| Brush Types | Clone, reveal, paint, erase, wire removal |
| Strokes | Editable spline-based strokes, adjustable after painting |
| Animation | Per-frame or duration-based strokes |
| Tablet Support | Pressure-sensitive input for opacity/size |

**Implementation plan:**
- New `PaintEngine.ts` — canvas-based painting with stroke serialization
- Integrate with timeline for per-frame paint animation
- Pressure sensitivity via Pointer Events API (supported in modern browsers)

---

## 5. Shared Infrastructure

### 5.1 Unified Keyframe / Spline Editor

Both Audio automation and VFX keyframes require a spline editor.

**Shared component:** `SplineEditor.tsx`
- Bezier, linear, hold, smooth interpolation
- Tangent handles with break/unify
- Value snapping and grid
- Zoom/pan timeline integration
- Used by: Audio automation lanes, VFX node parameters, color correction keyframes

### 5.2 GPU Compute Pipeline

Both Audio (metering, FFT) and VFX (compositing, particles, 3D) benefit from GPU acceleration.

**Implementation plan:**
- Extend `HardwareAccelerator.ts` with compute shader dispatch
- WebGPU for desktop (via Electron), WebGL 2.0 fallback for web
- Shared GPU buffer management for audio FFT visualization and VFX render
- Render farm integration via `RenderFarmEngine.ts` for offline VFX renders

### 5.3 Undo/Redo Integration

Both new pages must integrate with the existing undo system.

- Audio: bus creation, routing changes, automation writes, plugin chain edits → all wrapped in `EditOperationsEngine.ts` transactions
- VFX: node creation, connection, parameter changes, paint strokes → all wrapped in transactions
- Cross-page undo: editing on the Edit page, switching to Audio, undoing → correctly scoped

### 5.4 Workspace Integration

Both pages are full-workspace layouts (not just panels).

**Workspace presets to add:**

| Preset | Layout |
|---|---|
| `audio` | Mixer + Bus graph + Automation lanes + Meters + Timeline + Record Monitor |
| `vfx` | Node Graph + Viewer (source/composite) + Spline Editor + Inspector + Timeline |

Extend `WorkspaceEngine.ts` and `editorLayout.ts` with new preset definitions.

---

## 6. Architecture Mapping

### 6.1 New Engines Required

| Engine | Page | Size Estimate | Dependencies |
|---|---|---|---|
| `AudioBusEngine.ts` | Audio | ~25 KB | `AudioEngine.ts`, `channelLayout.ts` |
| `AudioPluginHostEngine.ts` | Audio | ~40 KB | `PluginRegistry.ts`, `AAXHostEngine.ts` |
| `AAXHostEngine.ts` | Audio | ~35 KB | Pro Tools engine (desktop only) |
| `AudioAutomationEngine.ts` | Audio | ~30 KB | `audio.store.ts`, `EditOperationsEngine.ts` |
| `ADREngine.ts` | Audio | ~15 KB | `AudioPunchInEngine.ts`, `PlaybackEngine.ts` |
| `ElasticAudioEngine.ts` | Audio | ~20 KB | Pro Tools engine bridge |
| `EUCONBridge.ts` | Audio/Global | ~25 KB | `KeyboardEngine.ts`, `WorkspaceEngine.ts` |
| `NodeGraphEngine.ts` | VFX | ~50 KB | `EffectsEngine.ts`, `FrameCompositor.ts` |
| `Scene3DEngine.ts` | VFX | ~45 KB | `HardwareAccelerator.ts` |
| `ParticleEngine.ts` | VFX | ~30 KB | `HardwareAccelerator.ts`, `Scene3DEngine.ts` |
| `RotoscopeEngine.ts` | VFX | ~20 KB | `tracking.store.ts` |
| `ExpressionEngine.ts` | VFX | ~15 KB | Sandboxed evaluator |
| `PaintEngine.ts` | VFX | ~20 KB | Canvas API |
| `PTXSessionEngine.ts` | Audio | ~30 KB | `ProToolsSessionBridge.ts` |
| `CameraTrackerNode.ts` | VFX | ~25 KB | `HardwareAccelerator.ts` |

### 6.2 New Stores Required

| Store | Fields |
|---|---|
| `audioBus.store.ts` | busses, sends, routing graph, solo/mute state, bus metering |
| `audioAutomation.store.ts` | lanes, modes per track, preview buffer, write state |
| `adr.store.ts` | cue list, active cue, takes, ratings, recording state |
| `vfx.store.ts` | node graph, connections, selected node, viewport transform, macro library |
| `scene3d.store.ts` | scene tree, camera, lights, selected object, render settings |
| `particles.store.ts` | emitter configs, simulation state, playback cache |

### 6.3 New UI Components

| Component | Page | Description |
|---|---|---|
| `BusRouter.tsx` | Audio | Visual bus routing matrix |
| `ChannelStrip.tsx` | Audio | Full channel strip (fader + inserts + EQ + dynamics + sends + pan) |
| `ImmersivePanner.tsx` | Audio | 3D hemisphere/sphere panner for object tracks |
| `AutomationLane.tsx` | Audio/VFX | Spline automation lane (shared) |
| `ADRPanel.tsx` | Audio | Cue list + recording controls |
| `VoiceOverPanel.tsx` | Audio | Prompter + one-click record |
| `FoleySampler.tsx` | Audio | MIDI-triggered sample pad grid |
| `LoudnessGraph.tsx` | Audio | Real-time loudness history |
| `NodeCanvas.tsx` | VFX | Interactive node graph editor |
| `NodeInspector.tsx` | VFX | Parameter editor for selected node |
| `Viewer3D.tsx` | VFX | 3D scene viewport with orbit controls |
| `ParticleControls.tsx` | VFX | Particle emitter/behavior configuration |
| `RotoscopeOverlay.tsx` | VFX | Spline mask drawing on viewer |
| `PaintCanvas.tsx` | VFX | Paint tool overlay on viewer |
| `ExpressionEditor.tsx` | VFX | Code editor for parameter expressions |
| `MacroBrowser.tsx` | VFX | Macro library with search/favorites |

---

## 7. Parity Matrix

### 7.1 Audio Page vs. Fairlight

| Feature | Fairlight | The Avid Target | Pro Tools Differentiation |
|---|---|---|---|
| Mixer | Channel strips with faders/pan/mute/solo | **Parity** | AAX DSP insert slots, EUCON fader mapping |
| EQ | 6-band parametric per channel | **Parity** (upgrade from 10-band to focused 6-band) | — |
| Dynamics | Expander/Gate + Compressor + Limiter | **Parity** (add gate + limiter) | AAX DSP dynamics offload |
| Plugin Support | VST2, AU, Fairlight FX | **Exceeds** — AAX Native, AAX DSP, VST3, AU | AAX DSP = hardware offload at 0.7ms latency |
| Bus Routing | FlexBus (10+10 sends, 6 layers) | **Parity** (20 sends, 8 layers) | — |
| Automation | Latch/Touch/Trim/Read (per-track in v20) | **Exceeds** — all PT modes + Preview + Capture | Write to All, Latch Prime, Capture Punch |
| ADR | Built-in with visual cues, takes, ratings | **Parity** | — |
| Voice-Over | Timeline recording with prompter | **Parity** | — |
| Foley | Foley Sampler plugin (Studio only) | **Parity** | — |
| Loudness | EBU R128, BS.1770, ATSC A/85 | **Parity** | — |
| Immersive | Atmos 9.1.6, 5th-order ambisonics | **Parity** | Atmos via PT renderer |
| AI Audio | Dialogue Separator, Voice Isolation, IntelliTrack | **Parity** via `ai.service.ts` | — |
| Hardware Accel | Fairlight Accelerator (2,000 tracks, 256 busses) | **Exceeds** — HDX card (2,048 voices, FPGA routing) | HDX DSP + Hybrid Engine |
| Time Stretch | Basic | **Exceeds** — Elastic Audio with 5 algorithms | elastique Pro V3, X-Form |
| Control Surfaces | Basic EUCON/MIDI | **Exceeds** — native EUCON + S6 deep integration | EUCON is Avid's own protocol |
| Session Format | `.drp` (proprietary) | **Exceeds** — `.ptx` native + AAF + EDL | Industry-standard `.ptx` interchange |
| Plugin Ecosystem | Limited VST2/AU | **Exceeds** — full AAX ecosystem (largest pro audio plugin market) | AAX DSP offload for zero-latency monitoring |
| Macro Automation | None | **Exceeds** — SoundFlow integration (1,700+ macros) | SoundFlow is PT-native |

### 7.2 VFX Page vs. Fusion

| Feature | Fusion | The Avid Target | Notes |
|---|---|---|---|
| Node Graph | 250+ tools, full DAG | **Phase 1:** 80 nodes, full DAG | Expand via OFX plugins + marketplace |
| 2D Compositing | Merge, transform, color, blur, key | **Parity** — all via existing EffectsEngine | 32+ effects already built |
| Keying | Delta Keyer | **Parity** — upgraded chroma key + ultra key | Existing keyers.ts as foundation |
| Rotoscoping | Bezier/B-spline with tracked masks | **Parity** — new RotoscopeEngine + PlanarTracker | Tracker already exists |
| Planar Tracking | Built-in | **Parity** — existing PlanarTracker | Already implemented |
| Point Tracking | Built-in | **Parity** — new PointTrackerNode | New development |
| Camera Tracking | Built-in | **Parity** — new CameraTrackerNode | New development |
| 3D Workspace | Camera, lights, geometry, merge | **Parity** — new Scene3DEngine | Significant new development |
| Particles | pEmitter, behaviors, physics | **Parity** — new ParticleEngine (GPU compute) | New development |
| 3D Text | Extruded with reflections, shadows | **Parity** — extend TitleEngine | TitleEngine exists |
| Paint | Vector paint, clone, reveal | **Parity** — new PaintEngine | New development |
| Expressions | Lua-based | **Parity** — JS-based (more accessible) | Advantage: larger developer pool |
| Macros/Templates | Macro system, Effects Library integration | **Parity** — macro system + marketplace | PluginRegistry marketplace exists |
| OpenFX Plugins | Supported, 27 Resolve FX on Fusion page | **Parity** — OpenFXBridge already at 65 KB | Already strong |
| GPU Acceleration | Multi-GPU compositing and 3D render | **Parity** — HardwareAccelerator + WebGPU | Desktop parity; web via WebGPU |
| Editorial Integration | Context-sensitive from Edit/Cut pages | **Exceeds** — shared project file, no round-trip | Same bins, same timeline |

---

## 8. Phasing

### Phase 1 — Foundation (Q2 2026)

**Audio:**
- FlexBus routing architecture (AudioBusEngine)
- Channel strip effects chain with VST3/AU hosting
- Automation system (Read/Write/Touch/Latch/Trim)
- Loudness metering upgrade (EBU R128 full spec)
- Workspace preset

**VFX:**
- Node graph engine and UI (NodeGraphEngine + NodeCanvas)
- Wrap existing 32+ effects as nodes
- OpenFX plugins as nodes (via existing bridge)
- Merge/composite nodes
- Enhanced keying (Delta Keyer-grade)
- Workspace preset

### Phase 2 — Pro Tools Engine Integration (Q3 2026)

**Audio:**
- AAX Native plugin hosting
- AAX DSP hosting (desktop + HDX card)
- EUCON control surface bridge
- Elastic Audio engine
- ADR panel and voice-over tool
- Pro Tools automation modes (Preview, Capture, Write to All)

**VFX:**
- Rotoscope engine with tracked masks
- Point tracker and camera tracker
- Particle system (GPU compute)
- Expression engine
- Paint engine

### Phase 3 — Advanced & Immersive (Q4 2026)

**Audio:**
- Immersive audio (Atmos, ambisonics)
- 3D object panner
- `.ptx` native session open/save
- SoundFlow macro integration
- Foley sampler
- Live bidirectional Pro Tools session sync

**VFX:**
- 3D workspace (Scene3DEngine, camera, lights, geometry)
- 3D text extrusion
- Macro/template system with marketplace
- AI-powered object tracking
- Advanced particle behaviors (flocking, custom forces)

---

## 9. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| AAX SDK licensing and NDA constraints | Could block or delay AAX hosting | Early legal engagement with Avid's own licensing team — we own Pro Tools, so internal SDK access should be unblocked |
| WebGPU browser support for VFX on web platform | Limited 3D/particle performance on web | Desktop-first for Phase 2/3 VFX; web gets 2D node graph in Phase 1 |
| Node graph performance at 100+ nodes | Frame drops during evaluation | Implement evaluation caching, dirty-flag propagation, GPU-parallel branch evaluation |
| EUCON protocol complexity | Integration timeline risk | Phase over Q2–Q3; start with fader/transport, add soft keys and displays later |
| Immersive audio monitoring requires hardware | Limited testing environments | Binaural monitoring downmix for headphone validation; hardware testing in controlled lab |
| Expression engine security (arbitrary code execution) | XSS/injection risk | Sandboxed evaluator with allowlisted functions — no `eval`, no DOM access, no network |

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Audio feature parity score vs. Fairlight | ≥ 95% (measured against Fairlight feature matrix) |
| VFX feature parity score vs. Fusion | ≥ 85% Phase 1, ≥ 95% Phase 3 |
| Audio page unique features (PT differentiation) | ≥ 10 features with no Fairlight equivalent |
| AAX plugin compatibility rate | ≥ 98% of top 200 AAX plugins load and run correctly |
| Node graph evaluation: 50-node comp at 4K | < 16ms per frame (60fps target) |
| EUCON surface latency | < 5ms control-to-response |
| Audio automation write resolution | 10-bit (1024 steps) matching HDX fader resolution |

---

## 11. Dependencies

| Dependency | Owner | Status |
|---|---|---|
| AAX SDK access | Pro Tools Platform Team | Internal — needs formal request |
| EUCON Application SDK | Pro Tools Hardware Team | Available at developer.avid.com — internal access |
| HDX driver API | Pro Tools DSP Team | Internal — desktop-only integration |
| Elastic Audio engine API | Pro Tools Audio Team | Internal — needs API surface definition |
| WebGPU compute shaders | Platform / Browser vendors | Chrome stable, Firefox nightly, Safari TP |
| `.ptx` file format spec | Pro Tools Core Team | Internal — needs documentation access |
| SoundFlow integration API | SoundFlow (external) | Public API available |

---

## 12. Open Questions

1. **AAX DSP on web platform:** Is WASM-based AAX Native hosting feasible for the web app, or should AAX be desktop-exclusive?
2. **Fusion page naming:** Should The Avid's VFX page be called "VFX", "Compositor", or "Effects"? The current `EffectsPanel` handles clip-level effects — the new node graph is a different workflow.
3. **3D format support:** Which mesh formats to support at launch? glTF is web-friendly; FBX/OBJ are industry standard but larger to implement.
4. **Immersive renderer:** Build our own Atmos renderer or license Dolby's renderer and bridge via Pro Tools engine?
5. **Expression language:** JavaScript (accessible, large community) vs. a DSL (safer, more constrained)? Fusion uses Lua.
6. **Plugin ecosystem strategy:** Should The Avid's VFX marketplace accept Fusion macros/templates as imports to bootstrap the ecosystem?

---

*This document should be reviewed by Audio Engineering, VFX Engineering, Platform Architecture, and the Pro Tools Integration Team before moving to implementation planning.*
