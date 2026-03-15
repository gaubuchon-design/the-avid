# ADR-013: Native Codec Architecture for Desktop

**Status:** Accepted
**Date:** 2026-03-15
**Authors:** Platform Architecture Team

---

## Context

The web application uses WebCodecs (browser-native) for decode/encode with
HTMLVideoElement fallback. This works for browser-supported codecs (H.264, VP9,
AV1, AAC, Opus) but cannot handle the full professional format landscape:

**Unsupported in browsers:**
- Camera RAW (ARRI ARRIRAW, RED R3D, Blackmagic BRAW, Canon CR3, Sony RAW)
- OpenEXR half-float HDR image sequences
- DPX 10-bit/16-bit log film scans
- ProRes decode on Windows/Linux (macOS only via VideoToolbox)
- DNxHD/DNxHR (no browser support at all)
- MXF container format (broadcast standard)
- MPEG-2 Long-GOP (legacy but widely used)
- TIFF image sequences (16-bit/32-bit)
- FLAC, AIFF, AC-3, E-AC-3 audio (limited browser support)
- HAP GPU-native video codec
- CinemaDNG image sequences

The desktop application (Electron) must support **all** professional formats
with GPU-accelerated decode/encode and real-time performance at 4K+ resolutions.

### Why Not Pure TypeScript / WASM?

- **FFmpeg WASM** exists but runs single-threaded, cannot access GPU HW accel,
  and is 5-10x slower than native FFmpeg for decode/encode operations.
- **Camera RAW debayering** is computationally intensive — CPU debayer of a 6K
  ARRIRAW frame takes ~200ms in optimized C vs 2000ms+ in WASM.
- **OpenEXR** half-float decompression (PIZ, ZIP, DWAA) requires SIMD
  intrinsics for real-time performance.
- **GPU encode/decode** (NVENC, NVDEC, VideoToolbox, VA-API, QSV) requires
  native API access — no browser/WASM path exists.

### Why Not a Separate Rust Service?

ADR-001 decided single-language TypeScript. However, it also explicitly noted:

> "Performance-critical paths may eventually require native modules or a move
> to Rust/C++ for hot paths. The adapter pattern makes this migration local."

Codec operations are precisely the "hot path" that ADR-001 anticipated. The
solution is **N-API native addons** — C code compiled to `.node` modules that
TypeScript calls directly, no IPC overhead, no separate process.

---

## Decision

### 1. Native codec layer via Node.js N-API addon (C)

A single native addon `@avid/native-codecs` wraps the following C libraries:

| Library | Purpose | License |
|---------|---------|---------|
| FFmpeg (libavcodec, libavformat, libavutil, libswscale, libswresample) | All video/audio decode, encode, mux, demux | LGPL-2.1 |
| LibRaw | Camera RAW debayering (600+ camera models) | LGPL-2.1 |
| OpenEXR + Imath | EXR half-float HDR image sequences | BSD-3-Clause |
| OpenImageIO | Unified image I/O (DPX, TIFF, PNG, HDR) | Apache-2.0 |
| ImageMagick | Image processing, format conversion | Apache-2.0 |

**Why C, not C++ or Rust:**
- FFmpeg, LibRaw, OpenEXR, OpenImageIO are all C/C++ libraries — C bindings
  are the most direct and stable ABI.
- N-API is a C API (node_api.h) — C addon code avoids C++ ABI issues across
  compiler versions and platforms.
- All target libraries provide C API headers — no C++ wrapper layer needed.
- Build system uses CMake which handles C compilation across all three
  platforms trivially.

### 2. Cross-platform GPU acceleration through FFmpeg

FFmpeg already integrates every GPU acceleration API:

| Platform | Decode HW Accel | Encode HW Accel | API |
|----------|----------------|-----------------|-----|
| macOS | VideoToolbox | VideoToolbox | AVFoundation |
| Windows | D3D11VA, DXVA2 | NVENC, AMF, QSV | Direct3D 11 |
| Linux | VA-API, VDPAU | NVENC, VA-API, QSV | libva, CUDA |

The native addon queries `avcodec_find_decoder_by_name()` with HW-accel
variants and falls back to software decode. No separate GPU integration code
is needed — FFmpeg handles it.

For camera RAW debayering, we use:
- **Metal compute shaders** (macOS) via a thin Objective-C bridge
- **CUDA kernels** (NVIDIA) via LibRaw's GPU debayer path
- **OpenCL** (cross-platform fallback) via LibRaw

### 3. TypeScript codec service abstraction (`packages/media`)

The `packages/media` package provides a `CodecService` interface with two
implementations:

```
CodecService (interface)
├── BrowserCodecService  — WebCodecs + HTMLVideoElement (web)
└── NativeCodecService   — N-API addon (desktop/Electron)
```

The application code never imports the native addon directly. It calls
`CodecService.decode()`, `CodecService.encode()`, etc. The correct
implementation is selected at startup based on the runtime environment.

### 4. Prebuild binaries for all platforms

Native addons are compiled per-platform via `prebuildify`:

| Platform | Architecture | Toolchain |
|----------|-------------|-----------|
| macOS | arm64, x86_64 | Xcode CLT, CMake |
| Windows | x64 | MSVC, CMake |
| Linux | x64, arm64 | GCC, CMake |

FFmpeg and other dependencies are statically linked into the `.node` addon
to avoid external dependency requirements on end-user machines.

### 5. Desktop IPC bridge for renderer → main process codec calls

Electron renderer process cannot load native addons directly (context
isolation). The codec service runs in the **main process** and exposes
operations via Electron IPC:

```
Renderer (React)                     Main Process (Node.js)
CodecService.decode(...)  ──IPC──►  NativeCodecService.decode(...)
                                      │
                                      ▼
                                    N-API addon
                                      │
                                      ▼
                                    FFmpeg / LibRaw / OpenEXR
```

Frame data is transferred via `SharedArrayBuffer` to avoid serialization
overhead for large frame buffers (4K RGBA = 33MB per frame).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  DecodePipeline │ MuxerPipeline │ MetadataExtractor          │
│  (existing engine services — unchanged API)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CodecService Interface                     │
│  decode() │ encode() │ probe() │ mux() │ demux()            │
│  decodeImageSequence() │ decodeRaw() │ transcode()           │
└────────┬──────────────────────────────────┬─────────────────┘
         │                                  │
    ┌────▼────┐                       ┌─────▼─────┐
    │ Browser │                       │  Native   │
    │ Codec   │                       │  Codec    │
    │ Service │                       │  Service  │
    │(WebCodecs│                       │(N-API)   │
    │ +Canvas) │                       │          │
    └─────────┘                       └─────┬─────┘
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                        ┌─────▼─────┐ ┌─────▼─────┐ ┌────▼──────┐
                        │  FFmpeg   │ │  LibRaw   │ │ OpenEXR/  │
                        │  Decode/  │ │  Camera   │ │ OIIO      │
                        │  Encode/  │ │  RAW      │ │ Image Seq │
                        │  Mux      │ │  Debayer  │ │ DPX/TIFF  │
                        │  +HW Accel│ │  +GPU     │ │           │
                        └───────────┘ └───────────┘ └───────────┘
```

### Format Support Matrix

| Category | Formats | Decode | Encode | HW Accel |
|----------|---------|--------|--------|----------|
| **Video** | H.264, H.265/HEVC, AV1, VP9, VP8, MPEG-2, MPEG-4, Theora | ✓ | ✓ | ✓ |
| **Pro Video** | ProRes (422/4444/XQ), DNxHD, DNxHR, CineForm, HAP | ✓ | ✓ | Partial |
| **Camera RAW** | ARRIRAW, RED R3D, BRAW, Canon CR3/CR2, Sony ARW, Nikon NEF, DNG, Phase One IIQ | ✓ | — | GPU debayer |
| **Image Seq** | OpenEXR, DPX, TIFF (8/16/32-bit), PNG, JPEG, BMP, TGA, SGI, Cineon | ✓ | ✓ | — |
| **HDR Image** | OpenEXR (half/float), HDR/RGBE, PFM | ✓ | ✓ | — |
| **Audio** | AAC, MP3, PCM/WAV, FLAC, AIFF, Opus, Vorbis, AC-3, E-AC-3, DTS, ALAC | ✓ | ✓ | — |
| **Container** | MP4, MOV, MXF, MKV, AVI, WebM, MPEG-TS, FLV, OGG | ✓ Demux | ✓ Mux | — |

---

## Consequences

### Positive

- **Complete format coverage** — every professional format is supported via
  FFmpeg + LibRaw + OpenEXR. No format gaps.
- **GPU acceleration** — hardware decode/encode on all platforms via FFmpeg's
  built-in HW accel layer. Camera RAW GPU debayer via LibRaw/Metal/CUDA.
- **Same TypeScript API** — engine services (DecodePipeline, MuxerPipeline)
  call the same `CodecService` interface regardless of backend. Web app
  continues to work with browser codecs.
- **Static linking** — no external dependencies on end-user machines. The
  `.node` addon is self-contained.
- **Cross-platform** — CMake + prebuildify produces binaries for macOS (arm64,
  x86_64), Windows (x64), and Linux (x64, arm64).

### Negative / Risks

- **Binary size** — statically linking FFmpeg + LibRaw + OpenEXR produces a
  ~60-80MB `.node` file per platform. Acceptable for desktop app, but not
  viable for web distribution.
- **Build complexity** — CMake cross-compilation requires CI runners for each
  target platform. GitHub Actions with matrix builds handles this.
- **LGPL compliance** — FFmpeg and LibRaw are LGPL. Dynamic linking satisfies
  LGPL, but static linking requires the application itself be LGPL or provide
  object files for relinking. We use dynamic linking for FFmpeg to stay
  LGPL-compliant and bundle the shared libraries alongside the addon.
- **N-API stability** — N-API is ABI-stable across Node.js versions, so the
  addon works across Electron upgrades without recompilation.

---

## References

- ADR-001: Architecture Overview (single-language TypeScript decision)
- ADR-012: Timeline Engine (SegmentGraph, DecodePipeline, FrameScheduler)
- FFmpeg HW acceleration: https://trac.ffmpeg.org/wiki/HWAccelIntro
- Node-API: https://nodejs.org/api/n-api.html
- LibRaw: https://www.libraw.org/
- OpenEXR: https://openexr.com/
- OpenImageIO: https://openimageio.readthedocs.io/
- prebuildify: https://github.com/prebuild/prebuildify
