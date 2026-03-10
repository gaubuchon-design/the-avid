import { describe, it, expect } from 'vitest';
import {
  MediaTypeSchema,
  ApprovalStatusSchema,
  RightsInfoSchema,
  MediaRefSchema,
  KnowledgeAssetSchema,
  WordSchema,
  SpeakerSchema,
  LanguageSchema,
  TranscriptSegmentSchema,
  PlanStatusSchema,
  StepStatusSchema,
  ExecutionModeSchema,
  AgentStepSchema,
  AgentPlanSchema,
  PublishPlatformSchema,
  PublishStatusSchema,
  DeliverySpecSchema,
  TokenCategorySchema,
  TokenWalletSchema,
  MeteringRecordSchema,
  ModalitySchema,
  MeshEventTypeSchema,
  RenderJobStatusSchema,
  RenderJobTypeSchema,
  RenderJobSchema,
  RenderProgressSchema,
  ApiVersionSchema,
  PlatformEventSchema,
  EventEnvelopeSchema,
} from '../schemas';

// =============================================================================
//  Enum schemas
// =============================================================================

describe('MediaTypeSchema', () => {
  it.each(['audio', 'video', 'image', 'document'])('accepts valid value "%s"', (val) => {
    expect(MediaTypeSchema.parse(val)).toBe(val);
  });

  it('rejects invalid values', () => {
    expect(() => MediaTypeSchema.parse('music')).toThrow();
    expect(() => MediaTypeSchema.parse(42)).toThrow();
    expect(() => MediaTypeSchema.parse(null)).toThrow();
  });
});

describe('ApprovalStatusSchema', () => {
  it.each(['pending', 'approved', 'rejected', 'review'])('accepts "%s"', (val) => {
    expect(ApprovalStatusSchema.parse(val)).toBe(val);
  });

  it('rejects unknown statuses', () => {
    expect(() => ApprovalStatusSchema.parse('unknown')).toThrow();
  });
});

describe('PlanStatusSchema', () => {
  it.each(['planning', 'preview', 'approved', 'executing', 'completed', 'failed', 'cancelled'])(
    'accepts "%s"',
    (val) => {
      expect(PlanStatusSchema.parse(val)).toBe(val);
    },
  );
});

describe('StepStatusSchema', () => {
  it.each(['pending', 'approved', 'executing', 'completed', 'failed', 'cancelled', 'compensated'])(
    'accepts "%s"',
    (val) => {
      expect(StepStatusSchema.parse(val)).toBe(val);
    },
  );
});

describe('ExecutionModeSchema', () => {
  it.each(['sequential', 'parallel', 'conditional'])('accepts "%s"', (val) => {
    expect(ExecutionModeSchema.parse(val)).toBe(val);
  });
});

describe('PublishPlatformSchema', () => {
  it.each(['youtube', 'vimeo', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin', 'custom'])(
    'accepts "%s"',
    (val) => {
      expect(PublishPlatformSchema.parse(val)).toBe(val);
    },
  );
});

describe('PublishStatusSchema', () => {
  it.each(['draft', 'rendering', 'ready', 'published', 'failed', 'revoked'])(
    'accepts "%s"',
    (val) => {
      expect(PublishStatusSchema.parse(val)).toBe(val);
    },
  );
});

describe('TokenCategorySchema', () => {
  it.each([
    'archive-reasoning', 'premium-translation', 'reference-dubbing',
    'temp-music-gen', 'generative-motion', 'generative-effects',
    'premium-publish', 'cloud-stt', 'cloud-analysis',
  ])('accepts "%s"', (val) => {
    expect(TokenCategorySchema.parse(val)).toBe(val);
  });
});

describe('ModalitySchema', () => {
  it.each(['transcript', 'visual', 'marker', 'metadata', 'embedding'])('accepts "%s"', (val) => {
    expect(ModalitySchema.parse(val)).toBe(val);
  });
});

describe('MeshEventTypeSchema', () => {
  it.each([
    'peer-joined', 'peer-left', 'shard-created', 'shard-replicated',
    'lease-acquired', 'lease-released', 'lease-expired',
    'conflict-detected', 'search-request', 'search-response',
  ])('accepts "%s"', (val) => {
    expect(MeshEventTypeSchema.parse(val)).toBe(val);
  });
});

describe('RenderJobTypeSchema', () => {
  it.each(['encode', 'transcode', 'effects', 'composite'])('accepts "%s"', (val) => {
    expect(RenderJobTypeSchema.parse(val)).toBe(val);
  });
});

describe('RenderJobStatusSchema', () => {
  it.each(['queued', 'assigned', 'rendering', 'completed', 'failed', 'cancelled'])(
    'accepts "%s"',
    (val) => {
      expect(RenderJobStatusSchema.parse(val)).toBe(val);
    },
  );
});

// =============================================================================
//  Object schemas - valid inputs
// =============================================================================

const validTimestamp = '2024-06-15T12:30:00Z';

describe('WordSchema', () => {
  it('accepts valid word', () => {
    const word = { text: 'hello', startTime: 0.0, endTime: 0.5, confidence: 0.95 };
    expect(WordSchema.parse(word)).toEqual(word);
  });

  it('rejects confidence > 1', () => {
    const word = { text: 'hello', startTime: 0, endTime: 0.5, confidence: 1.5 };
    expect(() => WordSchema.parse(word)).toThrow();
  });

  it('rejects confidence < 0', () => {
    const word = { text: 'hello', startTime: 0, endTime: 0.5, confidence: -0.1 };
    expect(() => WordSchema.parse(word)).toThrow();
  });
});

describe('SpeakerSchema', () => {
  it('accepts valid speaker', () => {
    const speaker = { id: 's1', name: 'Speaker 1', confidence: 0.8 };
    expect(SpeakerSchema.parse(speaker)).toEqual(speaker);
  });

  it('rejects empty id', () => {
    expect(() => SpeakerSchema.parse({ id: '', name: 'S', confidence: 0.5 })).toThrow();
  });
});

describe('LanguageSchema', () => {
  it('accepts valid language', () => {
    const lang = { code: 'en', name: 'English', confidence: 0.99 };
    expect(LanguageSchema.parse(lang)).toEqual(lang);
  });

  it('rejects language code of wrong length', () => {
    expect(() => LanguageSchema.parse({ code: 'eng', name: 'English', confidence: 0.9 })).toThrow();
    expect(() => LanguageSchema.parse({ code: 'e', name: 'English', confidence: 0.9 })).toThrow();
  });
});

describe('RightsInfoSchema', () => {
  it('accepts valid rights info', () => {
    const rights = {
      license: 'CC-BY-4.0',
      expiresAt: null,
      restrictions: ['no-commercial'],
      owner: 'Studio A',
    };
    expect(RightsInfoSchema.parse(rights)).toEqual(rights);
  });
});

describe('ApiVersionSchema', () => {
  it('accepts valid version object', () => {
    const version = { major: 0, minor: 3, patch: 0 };
    expect(ApiVersionSchema.parse(version)).toEqual(version);
  });

  it('rejects negative version numbers', () => {
    expect(() => ApiVersionSchema.parse({ major: -1, minor: 0, patch: 0 })).toThrow();
  });

  it('rejects non-integer version numbers', () => {
    expect(() => ApiVersionSchema.parse({ major: 1.5, minor: 0, patch: 0 })).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => ApiVersionSchema.parse({ major: 1 })).toThrow();
  });
});

describe('EventEnvelopeSchema', () => {
  it('accepts valid envelope', () => {
    const envelope = {
      id: 'evt-1',
      timestamp: validTimestamp,
      correlationId: 'corr-1',
      source: 'test-service',
    };
    expect(EventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('rejects empty id', () => {
    expect(() =>
      EventEnvelopeSchema.parse({
        id: '',
        timestamp: validTimestamp,
        correlationId: 'c1',
        source: 'test',
      }),
    ).toThrow();
  });
});

// =============================================================================
//  Complex object schemas
// =============================================================================

describe('AgentStepSchema', () => {
  const validStep = {
    id: 'step-1',
    planId: 'plan-1',
    index: 0,
    description: 'Trim clip',
    toolName: 'trim-tool',
    toolArgs: { start: 0, end: 5 },
    status: 'pending' as const,
    result: null,
    error: null,
    compensation: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  };

  it('accepts valid step', () => {
    expect(AgentStepSchema.parse(validStep)).toEqual(validStep);
  });

  it('rejects negative index', () => {
    expect(() => AgentStepSchema.parse({ ...validStep, index: -1 })).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => AgentStepSchema.parse({ ...validStep, id: '' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => AgentStepSchema.parse({ ...validStep, status: 'running' })).toThrow();
  });
});

describe('AgentPlanSchema', () => {
  const validPlan = {
    id: 'plan-1',
    intent: 'Edit video',
    steps: [],
    status: 'planning' as const,
    tokensEstimated: 100,
    tokensUsed: 0,
    createdAt: validTimestamp,
    updatedAt: validTimestamp,
    approvalPolicy: {
      mode: 'manual' as const,
      allowedAutoTools: [],
      requireApprovalFor: [],
      maxAutoTokens: 0,
    },
  };

  it('accepts valid plan', () => {
    expect(AgentPlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it('rejects empty intent', () => {
    expect(() => AgentPlanSchema.parse({ ...validPlan, intent: '' })).toThrow();
  });

  it('rejects negative tokensEstimated', () => {
    expect(() => AgentPlanSchema.parse({ ...validPlan, tokensEstimated: -1 })).toThrow();
  });

  it('rejects negative tokensUsed', () => {
    expect(() => AgentPlanSchema.parse({ ...validPlan, tokensUsed: -1 })).toThrow();
  });
});

describe('DeliverySpecSchema', () => {
  const validSpec = {
    format: 'mp4',
    codec: 'h264',
    resolution: { width: 1920, height: 1080 },
    frameRate: 24,
    bitrate: '10Mbps',
    audioCodec: 'aac',
    audioBitrate: '320kbps',
    maxDuration: null,
    captionFormat: null,
    thumbnailRequired: true,
  };

  it('accepts valid delivery spec', () => {
    expect(DeliverySpecSchema.parse(validSpec)).toEqual(validSpec);
  });

  it('rejects non-positive resolution width', () => {
    expect(() => DeliverySpecSchema.parse({ ...validSpec, resolution: { width: 0, height: 1080 } })).toThrow();
  });

  it('rejects non-positive frame rate', () => {
    expect(() => DeliverySpecSchema.parse({ ...validSpec, frameRate: 0 })).toThrow();
  });
});

describe('TokenWalletSchema', () => {
  const validWallet = {
    id: 'w-1',
    userId: 'u-1',
    orgId: null,
    balance: 1000,
    currency: 'tokens' as const,
    tier: 'pro' as const,
    monthlyAllocation: 5000,
    usedThisMonth: 500,
    resetDate: '2024-07-01',
  };

  it('accepts valid wallet', () => {
    expect(TokenWalletSchema.parse(validWallet)).toEqual(validWallet);
  });

  it('rejects negative monthlyAllocation', () => {
    expect(() => TokenWalletSchema.parse({ ...validWallet, monthlyAllocation: -1 })).toThrow();
  });

  it('rejects invalid currency', () => {
    expect(() => TokenWalletSchema.parse({ ...validWallet, currency: 'credits' })).toThrow();
  });

  it('rejects invalid tier', () => {
    expect(() => TokenWalletSchema.parse({ ...validWallet, tier: 'ultimate' })).toThrow();
  });
});

describe('MeteringRecordSchema', () => {
  const validRecord = {
    id: 'mr-1',
    walletId: 'w-1',
    jobId: 'j-1',
    category: 'cloud-stt' as const,
    tokensConsumed: 50,
    quotedCost: 55,
    actualCost: 50,
    status: 'settled' as const,
    createdAt: validTimestamp,
    settledAt: validTimestamp,
  };

  it('accepts valid metering record', () => {
    expect(MeteringRecordSchema.parse(validRecord)).toEqual(validRecord);
  });

  it('rejects negative tokensConsumed', () => {
    expect(() => MeteringRecordSchema.parse({ ...validRecord, tokensConsumed: -1 })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => MeteringRecordSchema.parse({ ...validRecord, status: 'pending' })).toThrow();
  });
});

describe('RenderJobSchema', () => {
  const validJob = {
    id: 'rj-1',
    sequenceId: 'seq-1',
    type: 'encode' as const,
    priority: 50,
    status: 'queued' as const,
    deliverySpec: null,
    startFrame: 0,
    endFrame: 1000,
    assignedNodeId: null,
    progress: 0,
    createdAt: validTimestamp,
    startedAt: null,
    completedAt: null,
    outputUri: null,
    error: null,
    retryCount: 0,
    maxRetries: 3,
  };

  it('accepts valid render job', () => {
    expect(RenderJobSchema.parse(validJob)).toEqual(validJob);
  });

  it('rejects priority > 100', () => {
    expect(() => RenderJobSchema.parse({ ...validJob, priority: 101 })).toThrow();
  });

  it('rejects priority < 0', () => {
    expect(() => RenderJobSchema.parse({ ...validJob, priority: -1 })).toThrow();
  });

  it('rejects progress > 100', () => {
    expect(() => RenderJobSchema.parse({ ...validJob, progress: 101 })).toThrow();
  });

  it('rejects negative startFrame', () => {
    expect(() => RenderJobSchema.parse({ ...validJob, startFrame: -1 })).toThrow();
  });

  it('rejects negative retryCount', () => {
    expect(() => RenderJobSchema.parse({ ...validJob, retryCount: -1 })).toThrow();
  });
});

describe('RenderProgressSchema', () => {
  const validProgress = {
    jobId: 'rj-1',
    nodeId: 'node-1',
    progress: 45.5,
    currentFrame: 455,
    totalFrames: 1000,
    fps: 120.5,
    eta: '00:10:30',
    timestamp: validTimestamp,
  };

  it('accepts valid progress', () => {
    expect(RenderProgressSchema.parse(validProgress)).toEqual(validProgress);
  });

  it('rejects progress > 100', () => {
    expect(() => RenderProgressSchema.parse({ ...validProgress, progress: 150 })).toThrow();
  });

  it('rejects negative fps', () => {
    expect(() => RenderProgressSchema.parse({ ...validProgress, fps: -1 })).toThrow();
  });
});

// =============================================================================
//  PlatformEventSchema (discriminated union)
// =============================================================================

describe('PlatformEventSchema', () => {
  const baseEnvelope = {
    id: 'evt-1',
    timestamp: validTimestamp,
    correlationId: 'corr-1',
    source: 'test',
  };

  it('accepts agent.plan.created event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'agent.plan.created' as const,
      payload: {
        planId: 'p1',
        intent: 'Edit',
        stepCount: 3,
        tokensEstimated: 100,
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('accepts render.job.progress event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'render.job.progress' as const,
      payload: {
        jobId: 'j1',
        progress: 50,
        currentFrame: 500,
        totalFrames: 1000,
        fps: 60,
        eta: '00:05:00',
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('accepts tokens.consumed event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'tokens.consumed' as const,
      payload: {
        walletId: 'w1',
        jobId: 'j1',
        category: 'cloud-stt',
        amount: 50,
        remainingBalance: 950,
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('accepts tokens.insufficient event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'tokens.insufficient' as const,
      payload: {
        walletId: 'w1',
        requiredAmount: 200,
        currentBalance: 50,
        category: 'cloud-stt',
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('accepts mesh.peer.left event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'mesh.peer.left' as const,
      payload: {
        nodeId: 'n1',
        reason: 'graceful' as const,
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('accepts publish.started event', () => {
    const event = {
      ...baseEnvelope,
      kind: 'publish.started' as const,
      payload: {
        jobId: 'j1',
        platform: 'youtube',
        sequenceId: 'seq-1',
      },
    };
    expect(PlatformEventSchema.parse(event)).toEqual(event);
  });

  it('rejects event with invalid kind', () => {
    const event = {
      ...baseEnvelope,
      kind: 'invalid.kind',
      payload: {},
    };
    expect(() => PlatformEventSchema.parse(event)).toThrow();
  });

  it('rejects event with missing payload fields', () => {
    const event = {
      ...baseEnvelope,
      kind: 'agent.plan.created' as const,
      payload: {
        planId: 'p1',
        // missing intent, stepCount, tokensEstimated
      },
    };
    expect(() => PlatformEventSchema.parse(event)).toThrow();
  });

  it('rejects event with missing envelope fields', () => {
    const event = {
      kind: 'agent.plan.created' as const,
      payload: {
        planId: 'p1',
        intent: 'Edit',
        stepCount: 3,
        tokensEstimated: 100,
      },
      // missing id, timestamp, correlationId, source
    };
    expect(() => PlatformEventSchema.parse(event)).toThrow();
  });
});

// =============================================================================
//  MediaRefSchema
// =============================================================================

describe('MediaRefSchema', () => {
  const validRef = {
    id: 'ref-1',
    assetId: 'asset-1',
    mediaRoot: '/media',
    relativePath: 'clips/clip1.mp4',
    format: 'mp4',
    codec: 'h264',
    resolution: { width: 1920, height: 1080 },
    frameRate: 24,
    sampleRate: null,
    channels: null,
    fileSize: 1048576,
    checksum: 'sha256:abc123',
  };

  it('accepts valid media ref', () => {
    expect(MediaRefSchema.parse(validRef)).toEqual(validRef);
  });

  it('rejects negative fileSize', () => {
    expect(() => MediaRefSchema.parse({ ...validRef, fileSize: -1 })).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => MediaRefSchema.parse({ ...validRef, id: '' })).toThrow();
  });
});

// =============================================================================
//  TranscriptSegmentSchema
// =============================================================================

describe('TranscriptSegmentSchema', () => {
  const validSegment = {
    id: 'seg-1',
    assetId: 'asset-1',
    startTime: 0,
    endTime: 5.5,
    text: 'Hello world',
    confidence: 0.95,
    speaker: null,
    language: { code: 'en', name: 'English', confidence: 0.99 },
    words: [
      { text: 'Hello', startTime: 0, endTime: 0.5, confidence: 0.98 },
      { text: 'world', startTime: 0.5, endTime: 1.0, confidence: 0.92 },
    ],
  };

  it('accepts valid transcript segment', () => {
    expect(TranscriptSegmentSchema.parse(validSegment)).toEqual(validSegment);
  });

  it('rejects confidence > 1', () => {
    expect(() => TranscriptSegmentSchema.parse({ ...validSegment, confidence: 1.1 })).toThrow();
  });

  it('rejects empty assetId', () => {
    expect(() => TranscriptSegmentSchema.parse({ ...validSegment, assetId: '' })).toThrow();
  });
});
