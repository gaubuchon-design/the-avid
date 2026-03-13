import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

interface FasterWhisperSegmentWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speakerId?: string;
}

interface FasterWhisperSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  speakerId?: string;
  speakerName?: string;
  translatedText?: string;
  words?: FasterWhisperSegmentWord[];
}

interface FasterWhisperSpeaker {
  id: string;
  name: string;
  confidence?: number;
  identified: boolean;
}

interface FasterWhisperRunnerResponse {
  segments: FasterWhisperSegment[];
  languageCode?: string;
  languageConfidence?: number;
  speakers?: FasterWhisperSpeaker[];
  warnings?: string[];
  hardware?: string;
  durationMs?: number;
  modelLoadTimeMs?: number;
}

interface FasterWhisperRunnerPayload {
  audioPath: string;
  language?: string;
  model: string;
  device: 'cpu' | 'cuda';
  computeType: string;
  diarize: boolean;
  task: 'transcribe' | 'translate';
  cacheDir?: string;
  hfToken?: string;
  beamSize: number;
  vadFilter: boolean;
}

type FasterWhisperExecutor = (
  pythonBin: string,
  scriptPath: string,
  payload: FasterWhisperRunnerPayload,
) => Promise<FasterWhisperRunnerResponse>;

export function normalizeTranscriptionAudioPath(audioPath: string): string {
  if (audioPath.startsWith('file://')) {
    return fileURLToPath(audioPath);
  }

  return audioPath;
}

function getRunnerScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, 'faster_whisper_runner.py');
}

async function runJsonProcess(
  pythonBin: string,
  scriptPath: string,
  payload: FasterWhisperRunnerPayload,
): Promise<FasterWhisperRunnerResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `faster-whisper runner exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as FasterWhisperRunnerResponse);
      } catch (error) {
        reject(new Error(`Failed to parse faster-whisper response: ${(error as Error).message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function probeModule(pythonBin: string, moduleName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, ['-c', `import ${moduleName}`], {
      stdio: 'ignore',
    });

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

function resolveModelVariant(modelId: string): string {
  switch (modelId) {
    case 'whisper-large-v3':
      return 'large-v3';
    case 'whisper-large-v3-turbo':
      return 'turbo';
    case 'distil-whisper-large-v3':
      return 'distil-large-v3';
    default:
      return modelId;
  }
}

function resolveDevice(): 'cpu' | 'cuda' {
  const configured = (process.env['LOCAL_STT_DEVICE'] ?? 'auto').toLowerCase();
  if (configured === 'cuda') {
    return 'cuda';
  }
  return 'cpu';
}

function resolveComputeType(device: 'cpu' | 'cuda'): string {
  const configured = process.env['LOCAL_STT_COMPUTE_TYPE'];
  if (configured) {
    return configured;
  }
  return device === 'cuda' ? 'float16' : 'int8';
}

export class FasterWhisperBackend implements IModelBackend {
  readonly name = 'faster-whisper';

  readonly supportedCapabilities: readonly ModelCapability[] = ['stt'];

  readonly supportedHardware: readonly HardwarePreference[] = ['cpu', 'cuda', 'auto'];

  private initialized = false;
  private availability: boolean | null = null;
  private readonly loadedModels = new Set<string>();
  private readonly pythonBin: string;
  private readonly scriptPath: string;
  private readonly executor: FasterWhisperExecutor;

  constructor(options?: {
    pythonBin?: string;
    scriptPath?: string;
    executor?: FasterWhisperExecutor;
  }) {
    this.pythonBin = options?.pythonBin ?? process.env['LOCAL_STT_PYTHON_BIN'] ?? 'python3';
    this.scriptPath = options?.scriptPath ?? getRunnerScriptPath();
    this.executor = options?.executor ?? runJsonProcess;
  }

  async isAvailable(): Promise<boolean> {
    if (this.availability != null) {
      return this.availability;
    }

    const available = await probeModule(this.pythonBin, 'faster_whisper');
    this.availability = available;
    return available;
  }

  async initialize(): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error(
        'faster-whisper is not installed. Install faster-whisper in the configured Python runtime to enable local STT.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.loadedModels.clear();
    this.initialized = false;
  }

  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (request.capability !== 'stt') {
      throw new Error(`FasterWhisperBackend only supports STT, received "${request.capability}".`);
    }

    if (!request.input.audioPath) {
      throw new Error('STT requests require an audioPath.');
    }

    const device = resolveDevice();
    const computeType = resolveComputeType(device);
    const payload: FasterWhisperRunnerPayload = {
      audioPath: normalizeTranscriptionAudioPath(request.input.audioPath),
      language: request.input.sourceLanguage,
      model: resolveModelVariant(request.modelId),
      device,
      computeType,
      diarize: request.input.diarize === true,
      task: request.input.task ?? 'transcribe',
      cacheDir: process.env['LOCAL_STT_MODEL_CACHE_DIR'],
      hfToken: process.env['PYANNOTE_AUTH_TOKEN'],
      beamSize: Number(process.env['LOCAL_STT_BEAM_SIZE'] ?? '5'),
      vadFilter: process.env['LOCAL_STT_VAD_FILTER'] !== 'false',
    };

    const startedAt = Date.now();
    const response = await this.executor(this.pythonBin, this.scriptPath, payload);
    this.loadedModels.add(request.modelId);

    return {
      modelId: request.modelId,
      capability: request.capability,
      output: {
        transcriptSegments: response.segments,
        transcriptLanguage: response.languageCode
          ? {
              code: response.languageCode,
              confidence: response.languageConfidence ?? 0,
            }
          : undefined,
        transcriptSpeakers: response.speakers ?? [],
        warnings: response.warnings ?? [],
      },
      metrics: {
        durationMs: response.durationMs ?? (Date.now() - startedAt),
        backend: this.name,
        hardware: response.hardware ?? device,
        modelLoadTimeMs: response.modelLoadTimeMs,
      },
    };
  }

  getLoadedModels(): string[] {
    return [...this.loadedModels];
  }
}
