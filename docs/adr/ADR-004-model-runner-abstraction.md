# ADR-004: Model Runner Abstraction

**Status:** Accepted
**Date:** 2026-03-08
**Deciders:** Architecture team
**Technical Story:** Phase 4 — Local AI Runtime

## Context and Problem Statement

The local AI runtime needs to support multiple inference backends (ONNX Runtime, TensorRT-LLM, llama.cpp, Apple MLX, CTranslate2) across diverse hardware (CPU, CUDA GPU, Apple Metal, TensorRT). Without an abstraction layer, every feature that uses local AI (transcription, embedding, translation, vision analysis) would need to know which backend to call, how to load models, and how to handle hardware differences. This couples application logic to specific runtimes and makes it impossible to test AI-dependent features in CI without GPU hardware.

## Decision Drivers

- **Portability** — the same application code must run on macOS (Metal), Linux (CUDA), and CPU-only CI environments.
- **Testability** — AI-dependent features must be testable without native dependencies or GPU hardware.
- **Extensibility** — new backends (e.g., future WASM-based runtimes) should be addable without modifying existing code.
- **Simplicity** — feature developers should call high-level capability functions, not manage models or backends.

## Decision

We introduce a three-layer architecture for local AI inference:

### Layer 1: IModelBackend Interface

A single `IModelBackend` interface that every inference backend implements:

```typescript
interface IModelBackend {
  readonly name: string;
  readonly supportedCapabilities: readonly ModelCapability[];
  readonly supportedHardware: readonly HardwarePreference[];

  isAvailable(): Promise<boolean>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  execute(request: ModelRequest): Promise<ModelResult>;
  getLoadedModels(): string[];
}
```

Each backend (ONNX Runtime, TensorRT-LLM, llama.cpp, MLX, CTranslate2) implements this interface. A `MockBackend` implements all capabilities with deterministic mock outputs for testing.

### Layer 2: ModelRegistry

A central registry of model metadata (`ModelRegistryEntry`) that maps model IDs to their capabilities, supported languages, backend affinity, quantization level, and hardware preference. The registry provides:

- `findByCapability(cap)` — filter models by what they can do.
- `findByLanguage(lang)` — filter by language support.
- `findBest(capability, options?)` — heuristic selection ranking by language match, hardware match, and quantization quality.

Models are seeded at startup from a catalogue (`registry-seed.ts`) and can be dynamically registered/unregistered at runtime.

### Layer 3: Capability Pipelines

High-level functions that feature developers call directly:

- `generateEmbeddings(texts)` — embed text into vectors.
- `transcribe(audioPath)` — speech-to-text with timestamps.
- `translate(text, src, tgt)` — text translation.
- `analyzeQuery(query)` — search query rewriting and intent extraction.
- `analyzeContent(text)` — summarisation, keyword extraction, sentiment.
- `extractMetadata(filePath)` — media file metadata.

Each pipeline internally uses the ModelRegistry to select the best model, resolves an available backend, and returns a structured result. Application code never interacts with backends directly.

## Backend Plugins

| Backend | Runtime | Hardware | Status |
|---------|---------|----------|--------|
| ONNXBackend | ONNX Runtime GenAI | CPU, CUDA, TensorRT | Stub |
| TensorRTBackend | TensorRT-LLM | CUDA, TensorRT | Stub |
| LlamaCppBackend | llama.cpp (node-llama-cpp) | CPU, CUDA, Metal | Stub with dynamic check |
| MLXBackend | Apple MLX | Metal | Stub (macOS only) |
| CTranslate2Backend | CTranslate2 | CPU, CUDA | Stub |
| MockBackend | In-process mock | CPU | Fully functional |

All stub backends follow the same pattern: `isAvailable()` checks for native dependencies (try/catch on `require.resolve`), `execute()` throws a descriptive error if the dependency is missing. This means the system gracefully degrades — if no real backend is installed, the `MockBackend` serves all requests.

## MockBackend for CI

The `MockBackend` is a full implementation that:

- Returns L2-normalised random 384-dimensional vectors for embeddings.
- Returns multi-segment transcriptions with word-level timestamps.
- Returns prefixed translations: `[TRANSLATED:{lang}] {text}`.
- Returns mock text generation, vision analysis, and semantic analysis.
- Tracks loaded models and reports realistic execution metrics.

This enables the entire application stack to be tested in CI without any native AI dependencies.

## Consequences

### Positive

- **Decoupled**: Application features never import backend-specific code.
- **Testable**: Full test coverage is possible with `MockBackend` alone.
- **Portable**: The same codebase runs on any platform; only backend availability changes.
- **Extensible**: Adding a new backend requires implementing one interface and registering models.
- **Progressive**: Backends can be installed incrementally as hardware becomes available.

### Negative

- **Indirection**: Three layers of abstraction add some complexity compared to calling a backend directly.
- **Mock fidelity**: `MockBackend` outputs are structurally correct but semantically meaningless; integration testing with real models is still needed.
- **Registry maintenance**: The model catalogue must be kept in sync with actually-downloadable models.

### Neutral

- The registry-seed catalogue is declarative and easy to update.
- Quantization-based ranking in `findBest` is a reasonable default but may need tuning for specific deployment scenarios.

## Related Decisions

- **ADR-001**: Overall architecture overview and service boundaries.
