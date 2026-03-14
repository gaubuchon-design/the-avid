import type { NLEPortContractId } from './NLEPortContracts';

export type NLEParityGapId =
  | 'decode-playback-pipeline'
  | 'gpu-compositing-engine'
  | 'aaf-omf-xml-interchange'
  | 'realtime-multi-stream-playback'
  | 'professional-audio-mixing'
  | 'motion-effects-titler'
  | 'media-management-workflows'
  | 'edl-change-list-workflows'
  | 'multi-cam-editing';

export type NLEParityWorkstream =
  | 'media-engine'
  | 'interchange'
  | 'audio'
  | 'effects'
  | 'editorial'
  | 'media-ops';

export type NLEImplementationStage =
  | 'placeholder'
  | 'scaffolded'
  | 'partial'
  | 'validated';

export interface NLECurrentSurface {
  surface: 'apps/web' | 'apps/desktop' | 'packages/core';
  entryPoint: string;
  stage: NLEImplementationStage;
  notes: string;
}

export interface NLEParityGapScaffold {
  id: NLEParityGapId;
  title: string;
  workstream: NLEParityWorkstream;
  currentConstraint: string;
  targetCapability: string;
  contractIds: NLEPortContractId[];
  currentSurfaces: NLECurrentSurface[];
  dependsOn: NLEParityGapId[];
  releaseBar: string[];
}

export interface NLEParityExecutionPhase {
  phase: string;
  objective: string;
  gapIds: readonly NLEParityGapId[];
}

const NLE_PARITY_GAP_SCAFFOLDS: readonly NLEParityGapScaffold[] = [
  {
    id: 'decode-playback-pipeline',
    title: 'Professional Media Decode / Playback Pipeline',
    workstream: 'media-engine',
    currentConstraint: 'Playback transport and frame access are still dominated by browser-side APIs and a RAF clock.',
    targetCapability: 'Desktop-owned decode sessions with deterministic preroll, sync, and shared playback/export snapshots.',
    contractIds: ['ProfessionalMediaDecodePort', 'RealtimePlaybackPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/PlaybackEngine.ts',
        stage: 'placeholder',
        notes: 'Transport loop only; no professional decode scheduler.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/FrameCompositor.ts',
        stage: 'partial',
        notes: 'Fetches frames from browser-managed sources and canvas composition.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/gpu/VideoDecoderPipeline.ts',
        stage: 'partial',
        notes: 'WebCodecs wrapper, not a facility-grade codec pipeline.',
      },
      {
        surface: 'apps/desktop',
        entryPoint: 'apps/desktop/src/main/mediaPipeline.ts',
        stage: 'partial',
        notes: 'Strong ingest/proxy foundation but not yet the playback runtime.',
      },
    ],
    dependsOn: [],
    releaseBar: [
      'Frame-accurate seek, preroll, and play on desktop.',
      'Shared snapshot contract between monitor, scopes, and export.',
      'Decode telemetry exposes underruns, latency, and dropped frames.',
    ],
  },
  {
    id: 'gpu-compositing-engine',
    title: 'GPU-Accelerated Video Compositing Engine',
    workstream: 'media-engine',
    currentConstraint: 'Current compositing paths are browser-canvas-first and effect coverage is fragmented.',
    targetCapability: 'A render graph that drives monitor, scopes, multicam, and export from the same GPU-aware frame evaluator.',
    contractIds: ['VideoCompositingPort', 'ProfessionalMediaDecodePort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/FrameCompositor.ts',
        stage: 'partial',
        notes: 'Canvas 2D compositor, useful for previews but not finishing-grade.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/gpu/WebGPUPipeline.ts',
        stage: 'partial',
        notes: 'GPU shader path exists, but not yet a unified compositor.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/EffectsEngine.ts',
        stage: 'partial',
        notes: 'Effect registry exists without a single render-graph owner.',
      },
    ],
    dependsOn: ['decode-playback-pipeline'],
    releaseBar: [
      'Render graph compilation is revision-aware.',
      'Paused frame matches exported frame for identical revision and timecode.',
      'Effects degrade by policy instead of transport stalls.',
    ],
  },
  {
    id: 'aaf-omf-xml-interchange',
    title: 'AAF / OMF / XML Interchange',
    workstream: 'interchange',
    currentConstraint: 'The repo has interchange-shaped code, but not validated facility round-tripping across native tools.',
    targetCapability: 'External-tool-safe import/export packages with validation, attachment handling, and relink fidelity.',
    contractIds: ['InterchangePort', 'MediaManagementPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/AAFEngine.ts',
        stage: 'partial',
        notes: 'Rich object model but browser-side and not packaged as validated interchange.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/media/AAFExporter.ts',
        stage: 'partial',
        notes: 'Core export path exists for AAF-like output, but OMF/XML parity is incomplete.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/protools/ProToolsAAFExporter.ts',
        stage: 'partial',
        notes: 'Audio handoff coverage exists, not full interchange breadth.',
      },
    ],
    dependsOn: ['media-management-workflows'],
    releaseBar: [
      'AAF, OMF, and XML exports validate before delivery.',
      'Round-trip smoke tests pass against external post tools.',
      'Package references carry enough metadata for relink and conform.',
    ],
  },
  {
    id: 'realtime-multi-stream-playback',
    title: 'Real-Time Multi-Stream Playback',
    workstream: 'media-engine',
    currentConstraint: 'Playback does not yet coordinate decode, composite, and audio across workstation-scale stream counts.',
    targetCapability: 'A transport that can preroll, sync, and monitor multiple video and audio streams at editorial frame rates.',
    contractIds: ['RealtimePlaybackPort', 'ProfessionalMediaDecodePort', 'VideoCompositingPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/PlaybackEngine.ts',
        stage: 'placeholder',
        notes: 'Single-loop transport without multi-stream scheduling.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/MulticamEngine.ts',
        stage: 'partial',
        notes: 'Editorial state exists, but it is not backed by synchronized multiview playback.',
      },
    ],
    dependsOn: ['decode-playback-pipeline', 'gpu-compositing-engine', 'professional-audio-mixing'],
    releaseBar: [
      'Reference benchmark sequences sustain real-time playback.',
      'Transport exposes dropped-frame, preroll, and latency metrics.',
      'Source, record, and multicam monitors stay in sync.',
    ],
  },
  {
    id: 'professional-audio-mixing',
    title: 'Professional Audio Mixing',
    workstream: 'audio',
    currentConstraint: 'Mixer state is richer than the actual monitored mix pipeline.',
    targetCapability: 'Compiled mix graphs with routing, automation, inserts, bussing, and loudness validation.',
    contractIds: ['ProfessionalAudioMixPort', 'ProfessionalMediaDecodePort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/AudioMixerEngine.ts',
        stage: 'partial',
        notes: 'Excellent data model coverage, but not a workstation-grade audio graph.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/AudioEngine.ts',
        stage: 'partial',
        notes: 'Monitoring path exists, but not full routing, automation, and QC depth.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/protools/ProToolsSessionBridge.ts',
        stage: 'partial',
        notes: 'Turnover bridge exists, but not an in-app professional mix engine.',
      },
    ],
    dependsOn: ['decode-playback-pipeline'],
    releaseBar: [
      'Mix graph supports buses, inserts, sends, and automation write modes.',
      'Preview mix matches export mix for the same revision.',
      'Loudness and true-peak analysis are first-class job outputs.',
    ],
  },
  {
    id: 'motion-effects-titler',
    title: 'Motion Effects, Titler, and Advanced Effects',
    workstream: 'effects',
    currentConstraint: 'Title and effects surfaces exist, but advanced motion design and finishing-level evaluation are not unified.',
    targetCapability: 'Template-backed motion graphics and advanced effect stacks rendered through the same compositor as editorial playback.',
    contractIds: ['MotionEffectsPort', 'VideoCompositingPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/TitleEngine.ts',
        stage: 'partial',
        notes: 'Strong title data model, but not yet backed by a motion render pipeline.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/EffectsEngine.ts',
        stage: 'partial',
        notes: 'Large effect catalog exists without guaranteed realtime/render parity.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/TitleRenderer.ts',
        stage: 'partial',
        notes: 'Renderer exists, but not yet a reusable motion template subsystem.',
      },
    ],
    dependsOn: ['gpu-compositing-engine'],
    releaseBar: [
      'Titles, motion graphics, and advanced effects share one render path.',
      'Template revisions are cacheable and export-safe.',
      'Unsupported realtime cases degrade predictably.',
    ],
  },
  {
    id: 'media-management-workflows',
    title: 'Media Management: Relink, Consolidate, Transcode',
    workstream: 'media-ops',
    currentConstraint: 'Ingest and metadata are ahead of the user-facing facility workflows and diagnostics.',
    targetCapability: 'Industrial media operations with candidate review, job orchestration, watch persistence, and conform-safe audit trails.',
    contractIds: ['MediaManagementPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/MediaManagementEngine.ts',
        stage: 'partial',
        notes: 'UI/data-model coverage exists, but jobs are not yet facility-grade.',
      },
      {
        surface: 'apps/desktop',
        entryPoint: 'apps/desktop/src/main/mediaPipeline.ts',
        stage: 'partial',
        notes: 'Best current foundation for managed media, proxies, relink metadata, and watch folders.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/media/RelinkEngine.ts',
        stage: 'partial',
        notes: 'Relink primitives exist without the full operator workflow.',
      },
    ],
    dependsOn: [],
    releaseBar: [
      'Relink presents ranked candidates and operator overrides.',
      'Consolidate and transcode are resumable jobs with audit history.',
      'Offline and missing-media diagnostics are visible in project state.',
    ],
  },
  {
    id: 'edl-change-list-workflows',
    title: 'EDL and Change List Workflows',
    workstream: 'interchange',
    currentConstraint: 'EDL export exists, but revision-to-revision change list workflows are not a first-class editorial system.',
    targetCapability: 'Deterministic sequence diffing with EDL, change lists, and operator-readable compare artifacts.',
    contractIds: ['ChangeListPort', 'InterchangePort'],
    currentSurfaces: [
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/media/EDLExporter.ts',
        stage: 'partial',
        notes: 'EDL generation exists without sequence diff and compare workflow depth.',
      },
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/OTIOEngine.ts',
        stage: 'partial',
        notes: 'Timeline interchange utility exists, but not editorial change-list tooling.',
      },
    ],
    dependsOn: ['media-management-workflows'],
    releaseBar: [
      'Sequence compare emits ordered editorial events.',
      'EDL and change list outputs tie back to concrete sequence revisions.',
      'Exports are verifiable before handoff.',
    ],
  },
  {
    id: 'multi-cam-editing',
    title: 'Multi-Cam Editing',
    workstream: 'editorial',
    currentConstraint: 'Multicam grouping and cut-state APIs exist, but not full synced angle playback and finishing-safe commit workflows.',
    targetCapability: 'Synced angle groups, multiview monitoring, record-time cuts, and post-cut angle refinement on top of the real transport.',
    contractIds: ['MulticamPort', 'RealtimePlaybackPort', 'MediaManagementPort'],
    currentSurfaces: [
      {
        surface: 'apps/web',
        entryPoint: 'apps/web/src/engine/MulticamEngine.ts',
        stage: 'partial',
        notes: 'Editorial API surface is broad, but it needs the real playback stack underneath it.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/editing/MultiCamEngine.ts',
        stage: 'partial',
        notes: 'Shared model exists for grouping and switching, not final runtime integration.',
      },
      {
        surface: 'packages/core',
        entryPoint: 'packages/core/src/editing/MultiCamSyncEngine.ts',
        stage: 'partial',
        notes: 'Sync primitives exist but are not yet connected to live multiview playback.',
      },
    ],
    dependsOn: ['realtime-multi-stream-playback', 'media-management-workflows', 'professional-audio-mixing'],
    releaseBar: [
      'Angles can be synced by timecode, waveform, or manual offsets.',
      'Multiview playback and audio-follow-video are stable.',
      'Committed cuts remain editable and traceable to source angles.',
    ],
  },
] as const;

export const NLE_PARITY_EXECUTION_PHASES: readonly NLEParityExecutionPhase[] = [
  {
    phase: 'Phase 1',
    objective: 'Establish the workstation runtime foundations that everything else depends on.',
    gapIds: [
      'decode-playback-pipeline',
      'media-management-workflows',
      'gpu-compositing-engine',
    ],
  },
  {
    phase: 'Phase 2',
    objective: 'Turn the runtime into a usable finishing/editorial system.',
    gapIds: [
      'professional-audio-mixing',
      'realtime-multi-stream-playback',
      'motion-effects-titler',
    ],
  },
  {
    phase: 'Phase 3',
    objective: 'Close the handoff and high-end editorial parity workflows.',
    gapIds: [
      'aaf-omf-xml-interchange',
      'edl-change-list-workflows',
      'multi-cam-editing',
    ],
  },
] as const;

function cloneCurrentSurface(surface: NLECurrentSurface): NLECurrentSurface {
  return { ...surface };
}

function cloneGap(gap: NLEParityGapScaffold): NLEParityGapScaffold {
  return {
    ...gap,
    contractIds: [...gap.contractIds],
    currentSurfaces: gap.currentSurfaces.map(cloneCurrentSurface),
    dependsOn: [...gap.dependsOn],
    releaseBar: [...gap.releaseBar],
  };
}

export function listNLEParityGapScaffolds(): NLEParityGapScaffold[] {
  return NLE_PARITY_GAP_SCAFFOLDS.map(cloneGap);
}

export function getNLEParityGapScaffold(id: NLEParityGapId): NLEParityGapScaffold | undefined {
  const match = NLE_PARITY_GAP_SCAFFOLDS.find((gap) => gap.id === id);
  return match ? cloneGap(match) : undefined;
}

export function listNLEParityGapIds(): NLEParityGapId[] {
  return NLE_PARITY_GAP_SCAFFOLDS.map((gap) => gap.id);
}

export function getNLEParityExecutionPhase(id: NLEParityGapId): NLEParityExecutionPhase | undefined {
  return NLE_PARITY_EXECUTION_PHASES.find((phase) => phase.gapIds.includes(id));
}
