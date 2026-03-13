import { describe, expect, it, vi } from 'vitest';
import { FasterWhisperBackend, normalizeTranscriptionAudioPath } from '../backends/FasterWhisperBackend';
import type { ModelRequest } from '../ModelRunner';

class TestableFasterWhisperBackend extends FasterWhisperBackend {
  override async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('FasterWhisperBackend', () => {
  it('normalizes file URLs into local filesystem paths', () => {
    expect(normalizeTranscriptionAudioPath('file:///tmp/interview.wav')).toBe('/tmp/interview.wav');
    expect(normalizeTranscriptionAudioPath('/tmp/interview.wav')).toBe('/tmp/interview.wav');
  });

  it('maps a local STT request into transcript output with language and speakers', async () => {
    const executor = vi.fn().mockResolvedValue({
      segments: [
        {
          startTime: 0,
          endTime: 1.5,
          text: 'Hello from local STT.',
          confidence: 0.96,
          speakerId: 'speaker-1',
          speakerName: 'Speaker 1',
          words: [
            {
              text: 'Hello',
              startTime: 0,
              endTime: 0.4,
              confidence: 0.98,
            },
          ],
        },
      ],
      languageCode: 'en',
      languageConfidence: 0.99,
      speakers: [
        {
          id: 'speaker-1',
          name: 'Speaker 1',
          confidence: 0.93,
          identified: false,
        },
      ],
      warnings: ['pyannote disabled'],
      hardware: 'cpu',
      durationMs: 42,
      modelLoadTimeMs: 12,
    });

    const backend = new TestableFasterWhisperBackend({
      pythonBin: 'python3',
      scriptPath: '/tmp/faster_whisper_runner.py',
      executor,
    });

    const request: ModelRequest = {
      modelId: 'whisper-large-v3-turbo',
      capability: 'stt',
      input: {
        audioPath: '/tmp/audio.wav',
        sourceLanguage: 'en',
        diarize: true,
        task: 'transcribe',
      },
    };

    const result = await backend.execute(request);

    expect(executor).toHaveBeenCalledWith(
      'python3',
      '/tmp/faster_whisper_runner.py',
      expect.objectContaining({
        audioPath: '/tmp/audio.wav',
        language: 'en',
        diarize: true,
        task: 'transcribe',
        model: 'turbo',
      }),
    );
    expect(result.output.transcriptSegments?.[0]?.speakerName).toBe('Speaker 1');
    expect(result.output.transcriptLanguage?.code).toBe('en');
    expect(result.output.transcriptSpeakers?.[0]?.id).toBe('speaker-1');
    expect(result.output.warnings).toEqual(['pyannote disabled']);
    expect(result.metrics.backend).toBe('faster-whisper');
    expect(result.metrics.modelLoadTimeMs).toBe(12);
  });
});
