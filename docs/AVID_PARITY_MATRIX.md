# Avid Media Composer Parity Matrix

This matrix focuses on core Media Composer expectations rather than every adjacent Avid product. The goal is to make clear which foundational editorial behaviors are already represented in this repository and which still require major implementation work.

## Official Reference Points

- [Avid Editing Application README](https://resources.avid.com/SupportFiles/attach/README_Avid_Editor_v21.12.10.pdf)
- [Activation of Software options in Media Composer Ultimate](https://kb.avid.com/pkb/articles/en_US/faq/Activation-of-Software-options-in-Media-Composer-Ultimate)
- [Avid NEXIS](https://www.avid.com/products/avid-nexis)
- [Distributed Processing Admin Guide](https://resources.avid.com/SupportFiles/attach/MCDP_2022_10_0_Admin_Guide.pdf)
- [What is AAF format?](https://kb.avid.com/pkb/articles/en_US/compatibility/en336549)

## Parity Status

| Media Composer Capability | Status In The Avid | Notes |
| --- | --- | --- |
| Project and bin organization | Partial | Bins, nested bins, selected-bin state, and asset metadata are implemented. Real bin locking, script bins, search folders, and enterprise media databases are not. |
| Source / record editing model | Partial | Source asset selection, monitor focus routing, independent source/record transport, and track patching are implemented, and the composer now supports an Avid-style multicam source-bank on the source side while the record monitor stays on program. Deeper deck-control parity, source browser depth, and full edit-monitor muscle-memory matching are still incomplete. |
| Core timeline editorial actions | Partial | Markers, trim, move, split, match frame, lift, extract, and in/out are implemented. Splice-in, overwrite, sync locks, segment modes, trim rollers, slip/slide behavior, and advanced keyboard-driven editing remain incomplete. |
| ScriptSync / PhraseFind style workflow | Partial | Script and transcript cues are first-class project data and drive navigation and rough-cut actions. Real phrase indexing, phonetic search, and transcript generation are not present. |
| Shared storage workflow | Partial | Desktop project packages and local-first persistence exist. True NEXIS-style shared storage, locking, and collaborative media access are not implemented. |
| Background services | Partial | Desktop ingest, indexing, export, and transcode work now flow through a shared resource-aware background scheduler, the API now accepts raw `@mcua/render-agent` coordinator socket connections, and ingest records explicit per-surface editability (`native`, `proxy-only`, `mezzanine-required`, `adapter-required`, `unsupported`). Desktop-to-coordinator submission for every job family is still incomplete. |
| Review notes and approvals | Implemented | Timeline comments, approvals, and review surfaces exist in web and mobile. |
| Publish / delivery management | Partial | Preset-driven publish jobs exist, but they are metadata-driven queue objects rather than true finishing exports. |
| Title / subtitle workflow | Partial | Subtitle tracks and title clips exist structurally, and transcript-driven title subtitle generation now creates editable title overlays from transcript cues. Full caption authoring depth, styling parity, and finishing-grade burn-in workflows are still missing. |
| Audio editorial basics | Partial | Audio tracks, mute/solo/volume, and waveform metadata support exist. The desktop parity runtime now has native mix compilation, automation writes, preview handles, and loudness analysis, but full mixer UI depth, EQ/dynamics, bussing, and Pro Tools-grade turnover are still incomplete. |
| Color / finishing workspace | Gap | Workspace hooks exist, but no real color pipeline or Symphony-grade finishing toolset is present. |
| VFX / compositing workflow | Partial | The desktop parity runtime now owns a native render-graph, frame-composite, and motion-template path, and the editor supports clip-local effects plus adjustment-style effect clips on dedicated effect tracks with effect-stack revision invalidation for record-monitor previews. It is still a parity seam rather than a full finishing compositor with keying, scopes, or artist-facing effect tooling. |
| Multicam | Partial | Desktop parity runtime now owns multicam group creation, multiview preparation, cut recording, and program-track commit manifests, and the web composer now exposes an Avid-style source-bank multicam surface with F9-F12 angle routing, waveform/slate re-sync, live cut recording, parked-angle preview, post-cut segment refinement, and flatten/apply controls. Deeper audio-source policy and finishing-grade angle management are still incomplete. |
| Interchange: AAF / OMF / EDL / XML | Partial | Desktop parity runtime now emits disk-backed EDL, OTIO, XML, AAF, and OMF package artifacts, writes package-audit manifests, validates the exported artifacts themselves, and adds a Pro Tools turnover companion for AAF handoff. Real third-party round-trip testing and richer conform fidelity are still missing. |
| Media management: relink / transcode / consolidate | Partial | Desktop now imports to managed storage, captures fingerprints and relink keys, writes a media index, records stream/color/side-data/caption probe details, classifies each asset across desktop/web/mobile/worker surfaces, and can generate proxies when local tools are available. Full relink UI, consolidation policy, industrial transcode depth, and corpus-driven compatibility coverage are still missing. |
| Enterprise administration and governance | Gap | Permissions, audit trails, policy, billing, and deployment controls are not implemented. |

## What Is Already Faithful To Avid’s DNA

- Stronger emphasis on projects, bins, and editorial verbs than a generic asset browser.
- Script and transcript workflows are treated as core editorial concepts rather than add-ons.
- Desktop is treated as the serious workstation while other surfaces support the broader workflow.
- Local project packages create a realistic path toward offline and facility-style usage.

## Explicit Editability Matrix

The repo now classifies imported assets by surface instead of assuming one global “supported/unsupported” answer:

- `native`: the canonical source can be used directly on that surface.
- `proxy-only`: the source is preserved, but editorial playback should use a ready playback or render-safe derivative.
- `mezzanine-required`: a new normalized derivative must be generated before that surface can work reliably.
- `adapter-required`: the source needs a parser, vendor SDK, or graphics flatten/rasterize step.
- `unsupported`: no lawful or technically credible path is configured, and the UI should say so explicitly.

Current examples:

- Camera raw like `R3D` now lands as `normalized`, typically `proxy-only` on desktop/web/mobile and `mezzanine-required` on workers.
- HDR or VFR ProRes sources can be `native` on desktop while remaining `mezzanine-required` on web/mobile review surfaces.
- Multichannel WAV can be `native` on desktop/worker while still being marked `mezzanine-required` on browser/mobile surfaces.
- Protected or proprietary media such as `M4P` is recorded as `unsupported` instead of being hidden behind a generic ingest failure.

## What Must Be Added For Honest Media Composer Parity

- A real professional media engine with proxies, background indexing, waveform generation, and export.
- True editorial depth in trimming, overwrite/splice behavior, sync management, and keyboard mapping.
- AAF-driven interchange and handoff to finishing and audio tools.
- Collaborative storage and locking semantics.
- Multicam, advanced subtitles, color finishing, and higher-end audio workflows.
- The contract-level execution scaffold for the remaining parity gaps now lives in `docs/NLE_PARITY_GAP_ARCHITECTURE.md` and `packages/core/src/parity/`.

## Recommendation

The right target is not literal one-to-one Media Composer duplication. The better target is Media Composer-grade editorial reliability plus a modernized control layer around transcript-first editing, AI orchestration, and cross-surface review. The current repo now reflects that direction, but not full parity.
