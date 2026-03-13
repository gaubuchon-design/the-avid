import { describe, expect, it } from 'vitest';
import { createSeededRegistry } from '../registry-seed';
import { transcribe } from '../capabilities/stt';
import type { IModelBackend, ModelCapability, HardwarePreference, ModelRequest, ModelResult } from '../ModelRunner';

class BackendStub implements IModelBackend {
  readonly name: string;
  readonly supportedCapabilities: readonly ModelCapability[] = ['stt'];
  readonly supportedHardware: readonly HardwarePreference[] = ['cpu', 'auto'];
  readonly calls: ModelRequest[] = [];

  constructor(name: string) {
    this.name = name;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async execute(request: ModelRequest): Promise<ModelResult> {
    this.calls.push(request);
    return {
      modelId: request.modelId,
      capability: request.capability,
      output: {
        transcriptSegments: [],
      },
      metrics: {
        durationMs: 1,
        backend: this.name,
        hardware: 'cpu',
      },
    };
  }

  getLoadedModels(): string[] {
    return [];
  }
}

describe('stt capability', () => {
  it('prefers a backend-compatible STT model over unrelated registry entries', async () => {
    const registry = createSeededRegistry();
    const backend = new BackendStub('faster-whisper');

    await transcribe('/tmp/interview.wav', registry, backend, {
      language: 'en',
    });

    expect(backend.calls[0]?.modelId).toBe('whisper-large-v3-turbo');
  });
});
