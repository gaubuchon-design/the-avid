/**
 * @module registry-seed
 *
 * Seeds the {@link ModelRegistry} with placeholder model entries that
 * represent the models the local AI runtime is designed to support.  None
 * of these models are downloaded or loaded at startup — they serve as a
 * catalogue that the capability pipelines query when selecting the best
 * model for a given task.
 */

import { ModelRegistry, type ModelRegistryEntry } from './ModelRegistry';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** All known models the local runtime targets. */
const MODEL_CATALOGUE: readonly ModelRegistryEntry[] = [
  // ---- Text Generation / Semantic Analysis --------------------------------
  {
    id: 'gemma-3',
    name: 'Gemma 3 4B',
    capabilities: ['text-generation', 'semantic-analysis'],
    languages: ['*'],
    backend: 'llama.cpp',
    quantization: 'fp16',
    hardware: 'auto',
    sizeBytes: 8_000_000_000, // ~8 GB
    description: 'Google Gemma 3 4B — compact multilingual text generation and analysis.',
    version: '3.0.0',
    license: 'gemma',
  },
  {
    id: 'qwen2.5-vl',
    name: 'Qwen2.5-VL 7B',
    capabilities: ['vision', 'text-generation'],
    languages: ['*'],
    backend: 'llama.cpp',
    quantization: 'int8',
    hardware: 'auto',
    sizeBytes: 7_500_000_000, // ~7.5 GB
    description: 'Alibaba Qwen2.5-VL 7B — multimodal vision-language model.',
    version: '2.5.0',
    license: 'apache-2.0',
  },
  {
    id: 'phi-4-multimodal',
    name: 'Phi-4 Multimodal 14B',
    capabilities: ['vision', 'text-generation'],
    languages: ['*'],
    backend: 'onnxruntime',
    quantization: 'int4',
    hardware: 'auto',
    sizeBytes: 8_200_000_000, // ~8.2 GB quantised
    description: 'Microsoft Phi-4 Multimodal 14B — high-quality vision + text generation.',
    version: '4.0.0',
    license: 'mit',
  },
  {
    id: 'mistral-small-3.1',
    name: 'Mistral Small 3.1 24B',
    capabilities: ['text-generation', 'query-rewrite'],
    languages: ['*'],
    backend: 'llama.cpp',
    quantization: 'q4_k_m',
    hardware: 'auto',
    sizeBytes: 14_000_000_000, // ~14 GB quantised
    description: 'Mistral Small 3.1 24B — strong reasoning and query rewriting.',
    version: '3.1.0',
    license: 'apache-2.0',
  },

  // ---- Embedding ----------------------------------------------------------
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    capabilities: ['embedding'],
    languages: ['*'],
    backend: 'onnxruntime',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 1_100_000_000, // ~1.1 GB
    dimensions: 1024,
    description: 'BAAI BGE-M3 — multilingual, multi-granularity embedding model (568M params).',
    version: '1.0.0',
    license: 'mit',
  },
  {
    id: 'nvidia-embed-v2',
    name: 'NV-Embed v2',
    capabilities: ['embedding'],
    languages: ['en'],
    backend: 'onnxruntime',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 670_000_000, // ~670 MB
    dimensions: 768,
    description: 'NVIDIA NV-Embed v2 — English-optimised embedding model (335M params).',
    version: '2.0.0',
    license: 'cc-by-nc-4.0',
  },

  // ---- Speech-to-Text -----------------------------------------------------
  {
    id: 'parakeet-tdt-0.6b',
    name: 'Parakeet TDT 0.6B',
    capabilities: ['stt'],
    languages: ['en'],
    backend: 'onnxruntime',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 1_200_000_000, // ~1.2 GB
    description: 'NVIDIA Parakeet TDT 0.6B — fast English ASR.',
    version: '1.0.0',
    license: 'cc-by-4.0',
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    capabilities: ['stt'],
    languages: ['*'],
    backend: 'faster-whisper',
    quantization: 'fp16',
    hardware: 'auto',
    sizeBytes: 1_700_000_000, // ~1.7 GB
    description: 'OpenAI Whisper Turbo via faster-whisper — practical default for local multilingual STT.',
    version: '3.1.0',
    license: 'mit',
  },
  {
    id: 'whisper-large-v3',
    name: 'Whisper Large v3',
    capabilities: ['stt'],
    languages: ['*'],
    backend: 'faster-whisper',
    quantization: 'fp16',
    hardware: 'auto',
    sizeBytes: 3_100_000_000, // ~3.1 GB
    description: 'OpenAI Whisper Large v3 via faster-whisper — highest-quality multilingual speech recognition.',
    version: '3.0.0',
    license: 'mit',
  },
  {
    id: 'canary-1b',
    name: 'Canary 1B',
    capabilities: ['stt', 'translation'],
    languages: ['en', 'de', 'fr', 'es'],
    backend: 'onnxruntime',
    quantization: 'fp16',
    hardware: 'auto',
    sizeBytes: 2_000_000_000, // ~2 GB
    description: 'NVIDIA Canary 1B — ASR + translation for EN/DE/FR/ES.',
    version: '1.0.0',
    license: 'cc-by-4.0',
  },

  // ---- Translation --------------------------------------------------------
  {
    id: 'seamless-streaming',
    name: 'SeamlessStreaming',
    capabilities: ['translation'],
    languages: ['*'],
    backend: 'ctranslate2',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 2_600_000_000, // ~2.6 GB
    description: 'Meta SeamlessStreaming — real-time multilingual translation (1.3B params).',
    version: '1.0.0',
    license: 'cc-by-nc-4.0',
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Populate the given registry with the full model catalogue.
 *
 * @param registry - The {@link ModelRegistry} instance to seed.
 * @returns The number of models registered.
 */
export function seedRegistry(registry: ModelRegistry): number {
  let count = 0;
  for (const entry of MODEL_CATALOGUE) {
    try {
      registry.register(entry);
      count++;
    } catch {
      // Model already registered — skip silently (idempotent seed).
    }
  }
  return count;
}

/**
 * Return a fresh, pre-seeded {@link ModelRegistry}.
 */
export function createSeededRegistry(): ModelRegistry {
  const registry = new ModelRegistry();
  seedRegistry(registry);
  return registry;
}
