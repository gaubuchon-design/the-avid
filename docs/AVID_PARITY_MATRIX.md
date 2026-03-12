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
| Source / record editing model | Partial | Source asset selection and timeline insertion exist, but dual-monitor precision behavior, deck control, source browser depth, and edit-monitor parity are incomplete. |
| Core timeline editorial actions | Partial | Markers, trim, move, split, match frame, lift, extract, and in/out are implemented. Splice-in, overwrite, sync locks, segment modes, trim rollers, slip/slide behavior, and advanced keyboard-driven editing remain incomplete. |
| ScriptSync / PhraseFind style workflow | Partial | Script and transcript cues are first-class project data and drive navigation and rough-cut actions. Real phrase indexing, phonetic search, and transcript generation are not present. |
| Shared storage workflow | Partial | Desktop project packages and local-first persistence exist. True NEXIS-style shared storage, locking, and collaborative media access are not implemented. |
| Background services | Partial | Desktop ingest/export jobs are tracked and surfaced, ingest produces managed media metadata, waveforms, best-effort proxies, and watch-folder scans. Real distributed processing and a full render farm are still absent. |
| Review notes and approvals | Implemented | Timeline comments, approvals, and review surfaces exist in web and mobile. |
| Publish / delivery management | Partial | Preset-driven publish jobs exist, but they are metadata-driven queue objects rather than true finishing exports. |
| Title / subtitle workflow | Partial | Subtitle tracks exist structurally. Real caption authoring, styling, import/export, and burn-in workflows are missing. |
| Audio editorial basics | Partial | Audio tracks, mute/solo/volume, and waveform metadata support exist. Mixer depth, automation, EQ, bussing, loudness workflows, and Pro Tools turnover do not. |
| Color / finishing workspace | Gap | Workspace hooks exist, but no real color pipeline or Symphony-grade finishing toolset is present. |
| VFX / compositing workflow | Gap | There is no real effect graph, compositing engine, keying pipeline, or motion graphics system. |
| Multicam | Gap | Not implemented. |
| Interchange: AAF / OMF / EDL / XML | Partial | The desktop export package now writes EDL and OTIO plus relink and audio-turnover metadata. AAF, OMF, and richer XML interchange remain missing. |
| Media management: relink / transcode / consolidate | Partial | Desktop now imports to managed storage, captures fingerprints and relink keys, writes a media index, and can generate proxies when local tools are available. Full relink UI, watch folders, consolidation policy, and industrial transcode depth are still missing. |
| Enterprise administration and governance | Gap | Permissions, audit trails, policy, billing, and deployment controls are not implemented. |

## What Is Already Faithful To Avid’s DNA

- Stronger emphasis on projects, bins, and editorial verbs than a generic asset browser.
- Script and transcript workflows are treated as core editorial concepts rather than add-ons.
- Desktop is treated as the serious workstation while other surfaces support the broader workflow.
- Local project packages create a realistic path toward offline and facility-style usage.

## What Must Be Added For Honest Media Composer Parity

- A real professional media engine with proxies, background indexing, waveform generation, and export.
- True editorial depth in trimming, overwrite/splice behavior, sync management, and keyboard mapping.
- AAF-driven interchange and handoff to finishing and audio tools.
- Collaborative storage and locking semantics.
- Multicam, advanced subtitles, color finishing, and higher-end audio workflows.
- The contract-level execution scaffold for the remaining parity gaps now lives in `docs/NLE_PARITY_GAP_ARCHITECTURE.md` and `packages/core/src/parity/`.

## Recommendation

The right target is not literal one-to-one Media Composer duplication. The better target is Media Composer-grade editorial reliability plus a modernized control layer around transcript-first editing, AI orchestration, and cross-surface review. The current repo now reflects that direction, but not full parity.
