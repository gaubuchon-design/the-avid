import { describe, it, expect } from 'vitest';
import {
  // Type guards
  isMediaType,
  isApprovalStatus,
  isTranscriptFormat,
  isEmbeddingBackend,
  isTraceStatus,
  isPublishPlatform,
  isPublishStatus,
  isTokenCategory,
  isPlanStatus,
  isStepStatus,
  isExecutionMode,
  isModality,
  isHydrationLevel,
  isMeshEventType,
  isRenderJobType,
  isRenderJobStatus,
  isEventType,
  isPrivacyLevel,
  isPlatformEventKind,

  // Assertion functions
  assertMediaType,
  assertApprovalStatus,
  assertTranscriptFormat,
  assertEmbeddingBackend,
  assertTraceStatus,
  assertPublishPlatform,
  assertPublishStatus,
  assertTokenCategory,
  assertPlanStatus,
  assertStepStatus,
  assertExecutionMode,
  assertModality,
  assertHydrationLevel,
  assertMeshEventType,
  assertRenderJobType,
  assertRenderJobStatus,
  assertEventType,
  assertPrivacyLevel,
  assertPlatformEventKind,

  // Branded ID factories
  createClipId,
  createTrackId,
  createEffectId,
  createBinId,
  createWalletId,
  createNodeId,
  createCorrelationId,
  createProjectId,
  createSequenceId,
  createAssetId,
  createShardId,
  createPlanId,
  createJobId,
} from '../type-guards';

// =============================================================================
//  Type guard tests
// =============================================================================

describe('isMediaType', () => {
  it.each(['audio', 'video', 'image', 'document'])('returns true for valid value "%s"', (value) => {
    expect(isMediaType(value)).toBe(true);
  });

  it.each([
    'AUDIO',         // wrong case
    'music',         // not a valid type
    '',              // empty string
    42,              // number
    null,            // null
    undefined,       // undefined
    true,            // boolean
    {},              // object
    [],              // array
  ])('returns false for invalid value %s', (value) => {
    expect(isMediaType(value)).toBe(false);
  });
});

describe('isApprovalStatus', () => {
  it.each(['pending', 'approved', 'rejected', 'review'])('returns true for "%s"', (value) => {
    expect(isApprovalStatus(value)).toBe(true);
  });

  it.each(['Pending', 'APPROVED', 'unknown', '', null, 42])('returns false for %s', (value) => {
    expect(isApprovalStatus(value)).toBe(false);
  });
});

describe('isTranscriptFormat', () => {
  it.each(['srt', 'vtt', 'json', 'ttml'])('returns true for "%s"', (value) => {
    expect(isTranscriptFormat(value)).toBe(true);
  });

  it.each(['SRT', 'ass', '', null, undefined])('returns false for %s', (value) => {
    expect(isTranscriptFormat(value)).toBe(false);
  });
});

describe('isEmbeddingBackend', () => {
  it.each(['bge-m3', 'nvidia-embed', 'custom'])('returns true for "%s"', (value) => {
    expect(isEmbeddingBackend(value)).toBe(true);
  });

  it.each(['openai', '', null])('returns false for %s', (value) => {
    expect(isEmbeddingBackend(value)).toBe(false);
  });
});

describe('isTraceStatus', () => {
  it.each(['pending', 'executing', 'completed', 'failed', 'compensated'])(
    'returns true for "%s"',
    (value) => {
      expect(isTraceStatus(value)).toBe(true);
    },
  );

  it('returns false for invalid values', () => {
    expect(isTraceStatus('running')).toBe(false);
    expect(isTraceStatus(null)).toBe(false);
  });
});

describe('isPublishPlatform', () => {
  it.each(['youtube', 'vimeo', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin', 'custom'])(
    'returns true for "%s"',
    (value) => {
      expect(isPublishPlatform(value)).toBe(true);
    },
  );

  it('returns false for invalid platforms', () => {
    expect(isPublishPlatform('snapchat')).toBe(false);
  });
});

describe('isPublishStatus', () => {
  it.each(['draft', 'rendering', 'ready', 'published', 'failed', 'revoked'])(
    'returns true for "%s"',
    (value) => {
      expect(isPublishStatus(value)).toBe(true);
    },
  );

  it('returns false for invalid statuses', () => {
    expect(isPublishStatus('pending')).toBe(false);
  });
});

describe('isTokenCategory', () => {
  it.each([
    'archive-reasoning', 'premium-translation', 'reference-dubbing',
    'temp-music-gen', 'generative-motion', 'generative-effects',
    'premium-publish', 'cloud-stt', 'cloud-analysis',
  ])('returns true for "%s"', (value) => {
    expect(isTokenCategory(value)).toBe(true);
  });

  it('returns false for invalid categories', () => {
    expect(isTokenCategory('basic-stt')).toBe(false);
  });
});

describe('isPlanStatus', () => {
  it.each(['planning', 'preview', 'approved', 'executing', 'completed', 'failed', 'cancelled'])(
    'returns true for "%s"',
    (value) => {
      expect(isPlanStatus(value)).toBe(true);
    },
  );

  it('returns false for invalid statuses', () => {
    expect(isPlanStatus('running')).toBe(false);
  });
});

describe('isStepStatus', () => {
  it.each(['pending', 'approved', 'executing', 'completed', 'failed', 'cancelled', 'compensated'])(
    'returns true for "%s"',
    (value) => {
      expect(isStepStatus(value)).toBe(true);
    },
  );
});

describe('isExecutionMode', () => {
  it.each(['sequential', 'parallel', 'conditional'])('returns true for "%s"', (value) => {
    expect(isExecutionMode(value)).toBe(true);
  });

  it('returns false for "concurrent"', () => {
    expect(isExecutionMode('concurrent')).toBe(false);
  });
});

describe('isModality', () => {
  it.each(['transcript', 'visual', 'marker', 'metadata', 'embedding'])(
    'returns true for "%s"',
    (value) => {
      expect(isModality(value)).toBe(true);
    },
  );
});

describe('isHydrationLevel', () => {
  it.each(['stub', 'summary', 'full'])('returns true for "%s"', (value) => {
    expect(isHydrationLevel(value)).toBe(true);
  });
});

describe('isMeshEventType', () => {
  it.each([
    'peer-joined', 'peer-left', 'shard-created', 'shard-replicated',
    'lease-acquired', 'lease-released', 'lease-expired',
    'conflict-detected', 'search-request', 'search-response',
  ])('returns true for "%s"', (value) => {
    expect(isMeshEventType(value)).toBe(true);
  });
});

describe('isRenderJobType', () => {
  it.each(['encode', 'transcode', 'effects', 'composite'])('returns true for "%s"', (value) => {
    expect(isRenderJobType(value)).toBe(true);
  });
});

describe('isRenderJobStatus', () => {
  it.each(['queued', 'assigned', 'rendering', 'completed', 'failed', 'cancelled'])(
    'returns true for "%s"',
    (value) => {
      expect(isRenderJobStatus(value)).toBe(true);
    },
  );
});

describe('isEventType', () => {
  it.each([
    'prompt', 'plan-generated', 'plan-approved', 'plan-rejected',
    'step-override', 'step-failure', 'missing-endpoint',
    'manual-fix-after-agent', 'time-saved-estimate', 'publish-outcome',
    'token-consumed', 'model-fallback', 'latency-report',
  ])('returns true for "%s"', (value) => {
    expect(isEventType(value)).toBe(true);
  });
});

describe('isPrivacyLevel', () => {
  it.each(['public-aggregate', 'org-internal', 'user-private', 'do-not-log'])(
    'returns true for "%s"',
    (value) => {
      expect(isPrivacyLevel(value)).toBe(true);
    },
  );
});

describe('isPlatformEventKind', () => {
  it.each([
    'agent.plan.created', 'agent.plan.approved', 'agent.plan.rejected',
    'agent.step.started', 'agent.step.completed', 'agent.step.failed',
    'render.job.queued', 'render.job.progress', 'render.job.completed', 'render.job.failed',
    'mesh.peer.joined', 'mesh.peer.left', 'mesh.shard.replicated',
    'publish.started', 'publish.completed', 'publish.failed',
    'tokens.consumed', 'tokens.insufficient',
  ])('returns true for "%s"', (value) => {
    expect(isPlatformEventKind(value)).toBe(true);
  });

  it('returns false for invalid kinds', () => {
    expect(isPlatformEventKind('agent.plan.deleted')).toBe(false);
    expect(isPlatformEventKind('')).toBe(false);
    expect(isPlatformEventKind(null)).toBe(false);
  });
});

// =============================================================================
//  Assertion function tests
// =============================================================================

describe('assertMediaType', () => {
  it('does not throw for valid media type', () => {
    expect(() => assertMediaType('video')).not.toThrow();
  });

  it('throws TypeError for invalid value', () => {
    expect(() => assertMediaType('music')).toThrow(TypeError);
    expect(() => assertMediaType('music')).toThrow(/Expected a valid MediaType/);
  });

  it('throws for null', () => {
    expect(() => assertMediaType(null)).toThrow(TypeError);
  });
});

describe('assertApprovalStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertApprovalStatus('approved')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertApprovalStatus('invalid')).toThrow(TypeError);
  });
});

describe('assertTranscriptFormat', () => {
  it('does not throw for valid format', () => {
    expect(() => assertTranscriptFormat('srt')).not.toThrow();
  });

  it('throws for invalid format', () => {
    expect(() => assertTranscriptFormat('mp3')).toThrow(TypeError);
  });
});

describe('assertEmbeddingBackend', () => {
  it('does not throw for valid backend', () => {
    expect(() => assertEmbeddingBackend('bge-m3')).not.toThrow();
  });

  it('throws for invalid backend', () => {
    expect(() => assertEmbeddingBackend('openai')).toThrow(TypeError);
  });
});

describe('assertTraceStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertTraceStatus('completed')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertTraceStatus('running')).toThrow(TypeError);
  });
});

describe('assertPublishPlatform', () => {
  it('does not throw for valid platform', () => {
    expect(() => assertPublishPlatform('youtube')).not.toThrow();
  });

  it('throws for invalid platform', () => {
    expect(() => assertPublishPlatform('dailymotion')).toThrow(TypeError);
  });
});

describe('assertPublishStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertPublishStatus('published')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertPublishStatus('queued')).toThrow(TypeError);
  });
});

describe('assertTokenCategory', () => {
  it('does not throw for valid category', () => {
    expect(() => assertTokenCategory('cloud-stt')).not.toThrow();
  });

  it('throws for invalid category', () => {
    expect(() => assertTokenCategory('free-stt')).toThrow(TypeError);
  });
});

describe('assertPlanStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertPlanStatus('approved')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertPlanStatus('started')).toThrow(TypeError);
  });
});

describe('assertStepStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertStepStatus('pending')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertStepStatus('running')).toThrow(TypeError);
  });
});

describe('assertExecutionMode', () => {
  it('does not throw for valid mode', () => {
    expect(() => assertExecutionMode('parallel')).not.toThrow();
  });

  it('throws for invalid mode', () => {
    expect(() => assertExecutionMode('concurrent')).toThrow(TypeError);
  });
});

describe('assertModality', () => {
  it('does not throw for valid modality', () => {
    expect(() => assertModality('visual')).not.toThrow();
  });

  it('throws for invalid modality', () => {
    expect(() => assertModality('tactile')).toThrow(TypeError);
  });
});

describe('assertHydrationLevel', () => {
  it('does not throw for valid level', () => {
    expect(() => assertHydrationLevel('full')).not.toThrow();
  });

  it('throws for invalid level', () => {
    expect(() => assertHydrationLevel('partial')).toThrow(TypeError);
  });
});

describe('assertMeshEventType', () => {
  it('does not throw for valid type', () => {
    expect(() => assertMeshEventType('peer-joined')).not.toThrow();
  });

  it('throws for invalid type', () => {
    expect(() => assertMeshEventType('peer-connected')).toThrow(TypeError);
  });
});

describe('assertRenderJobType', () => {
  it('does not throw for valid type', () => {
    expect(() => assertRenderJobType('encode')).not.toThrow();
  });

  it('throws for invalid type', () => {
    expect(() => assertRenderJobType('decode')).toThrow(TypeError);
  });
});

describe('assertRenderJobStatus', () => {
  it('does not throw for valid status', () => {
    expect(() => assertRenderJobStatus('rendering')).not.toThrow();
  });

  it('throws for invalid status', () => {
    expect(() => assertRenderJobStatus('processing')).toThrow(TypeError);
  });
});

describe('assertEventType', () => {
  it('does not throw for valid event type', () => {
    expect(() => assertEventType('prompt')).not.toThrow();
  });

  it('throws for invalid event type', () => {
    expect(() => assertEventType('click')).toThrow(TypeError);
  });
});

describe('assertPrivacyLevel', () => {
  it('does not throw for valid level', () => {
    expect(() => assertPrivacyLevel('user-private')).not.toThrow();
  });

  it('throws for invalid level', () => {
    expect(() => assertPrivacyLevel('secret')).toThrow(TypeError);
  });
});

describe('assertPlatformEventKind', () => {
  it('does not throw for valid kind', () => {
    expect(() => assertPlatformEventKind('agent.plan.created')).not.toThrow();
  });

  it('throws for invalid kind', () => {
    expect(() => assertPlatformEventKind('agent.plan.deleted')).toThrow(TypeError);
  });
});

// =============================================================================
//  Branded ID factory functions
// =============================================================================

describe('branded ID factory functions', () => {
  const factories = [
    { name: 'createClipId', fn: createClipId },
    { name: 'createTrackId', fn: createTrackId },
    { name: 'createEffectId', fn: createEffectId },
    { name: 'createBinId', fn: createBinId },
    { name: 'createWalletId', fn: createWalletId },
    { name: 'createNodeId', fn: createNodeId },
    { name: 'createCorrelationId', fn: createCorrelationId },
    { name: 'createProjectId', fn: createProjectId },
    { name: 'createSequenceId', fn: createSequenceId },
    { name: 'createAssetId', fn: createAssetId },
    { name: 'createShardId', fn: createShardId },
    { name: 'createPlanId', fn: createPlanId },
    { name: 'createJobId', fn: createJobId },
  ] as const;

  for (const { name, fn } of factories) {
    describe(name, () => {
      it('returns a branded string for valid input', () => {
        const result = fn('test-id-123');
        expect(result).toBe('test-id-123');
        expect(typeof result).toBe('string');
      });

      it('accepts single-character strings', () => {
        expect(() => fn('x')).not.toThrow();
      });

      it('throws TypeError for empty string', () => {
        expect(() => fn('')).toThrow(TypeError);
      });

      it('throws TypeError for non-string input', () => {
        expect(() => fn(42 as unknown as string)).toThrow(TypeError);
      });

      it('throws TypeError for null input', () => {
        expect(() => fn(null as unknown as string)).toThrow(TypeError);
      });

      it('includes type name in error message', () => {
        try {
          fn('');
        } catch (e) {
          expect((e as Error).message).toContain('must be a non-empty string');
        }
      });
    });
  }
});
