/**
 * @module events
 *
 * Discriminated union event types for the entire platform event bus.
 * Every event carries a `kind` discriminator and a typed `payload` so
 * that consumers can use exhaustive `switch` statements for type-safe
 * event handling.
 *
 * These supplement the analytics-events module by providing strongly-typed
 * payloads rather than generic `Record<string, unknown>`.
 */

// -- Base event envelope -----------------------------------------------------

/** Fields shared by every platform event. */
export interface EventEnvelope {
  /** Unique event identifier. */
  readonly id: string;
  /** ISO 8601 event timestamp. */
  readonly timestamp: string;
  /** Correlation ID linking related events across services. */
  readonly correlationId: string;
  /** Originating service or module name. */
  readonly source: string;
}

// -- Agent events ------------------------------------------------------------

export interface AgentPlanCreatedEvent extends EventEnvelope {
  readonly kind: 'agent.plan.created';
  readonly payload: {
    readonly planId: string;
    readonly intent: string;
    readonly stepCount: number;
    readonly tokensEstimated: number;
  };
}

export interface AgentPlanApprovedEvent extends EventEnvelope {
  readonly kind: 'agent.plan.approved';
  readonly payload: {
    readonly planId: string;
    readonly approvedBy: string;
  };
}

export interface AgentPlanRejectedEvent extends EventEnvelope {
  readonly kind: 'agent.plan.rejected';
  readonly payload: {
    readonly planId: string;
    readonly rejectedBy: string;
    readonly reason?: string;
  };
}

export interface AgentStepStartedEvent extends EventEnvelope {
  readonly kind: 'agent.step.started';
  readonly payload: {
    readonly planId: string;
    readonly stepId: string;
    readonly stepIndex: number;
    readonly toolName: string;
  };
}

export interface AgentStepCompletedEvent extends EventEnvelope {
  readonly kind: 'agent.step.completed';
  readonly payload: {
    readonly planId: string;
    readonly stepId: string;
    readonly stepIndex: number;
    readonly toolName: string;
    readonly durationMs: number;
    readonly tokensCost: number;
  };
}

export interface AgentStepFailedEvent extends EventEnvelope {
  readonly kind: 'agent.step.failed';
  readonly payload: {
    readonly planId: string;
    readonly stepId: string;
    readonly stepIndex: number;
    readonly toolName: string;
    readonly error: string;
    readonly recoverable: boolean;
  };
}

// -- Render events -----------------------------------------------------------

export interface RenderJobQueuedEvent extends EventEnvelope {
  readonly kind: 'render.job.queued';
  readonly payload: {
    readonly jobId: string;
    readonly sequenceId: string;
    readonly priority: number;
    readonly estimatedFrames: number;
  };
}

export interface RenderJobProgressEvent extends EventEnvelope {
  readonly kind: 'render.job.progress';
  readonly payload: {
    readonly jobId: string;
    readonly progress: number;
    readonly currentFrame: number;
    readonly totalFrames: number;
    readonly fps: number;
    readonly eta: string | null;
  };
}

export interface RenderJobCompletedEvent extends EventEnvelope {
  readonly kind: 'render.job.completed';
  readonly payload: {
    readonly jobId: string;
    readonly outputUri: string;
    readonly durationMs: number;
    readonly fileSizeBytes: number;
  };
}

export interface RenderJobFailedEvent extends EventEnvelope {
  readonly kind: 'render.job.failed';
  readonly payload: {
    readonly jobId: string;
    readonly error: string;
    readonly retryable: boolean;
    readonly attemptNumber: number;
  };
}

// -- Mesh events (typed payloads) --------------------------------------------

export interface MeshPeerJoinedEvent extends EventEnvelope {
  readonly kind: 'mesh.peer.joined';
  readonly payload: {
    readonly nodeId: string;
    readonly hostname: string;
    readonly capabilities: readonly string[];
  };
}

export interface MeshPeerLeftEvent extends EventEnvelope {
  readonly kind: 'mesh.peer.left';
  readonly payload: {
    readonly nodeId: string;
    readonly reason: 'graceful' | 'timeout' | 'error';
  };
}

export interface MeshShardReplicatedEvent extends EventEnvelope {
  readonly kind: 'mesh.shard.replicated';
  readonly payload: {
    readonly shardId: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
    readonly vectorCount: number;
  };
}

// -- Publish events ----------------------------------------------------------

export interface PublishStartedEvent extends EventEnvelope {
  readonly kind: 'publish.started';
  readonly payload: {
    readonly jobId: string;
    readonly platform: string;
    readonly sequenceId: string;
  };
}

export interface PublishCompletedEvent extends EventEnvelope {
  readonly kind: 'publish.completed';
  readonly payload: {
    readonly jobId: string;
    readonly platform: string;
    readonly publicUrl: string;
  };
}

export interface PublishFailedEvent extends EventEnvelope {
  readonly kind: 'publish.failed';
  readonly payload: {
    readonly jobId: string;
    readonly platform: string;
    readonly error: string;
  };
}

// -- Token / metering events -------------------------------------------------

export interface TokensConsumedEvent extends EventEnvelope {
  readonly kind: 'tokens.consumed';
  readonly payload: {
    readonly walletId: string;
    readonly jobId: string;
    readonly category: string;
    readonly amount: number;
    readonly remainingBalance: number;
  };
}

export interface TokensInsufficientEvent extends EventEnvelope {
  readonly kind: 'tokens.insufficient';
  readonly payload: {
    readonly walletId: string;
    readonly requiredAmount: number;
    readonly currentBalance: number;
    readonly category: string;
  };
}

// -- Discriminated union -----------------------------------------------------

/**
 * Union of all typed platform events.
 *
 * Use `event.kind` as the discriminator in a `switch` statement for
 * exhaustive type-safe handling:
 *
 * @example
 * ```ts
 * function handle(event: PlatformEvent) {
 *   switch (event.kind) {
 *     case 'agent.plan.created':
 *       console.log(event.payload.planId);
 *       break;
 *     case 'render.job.progress':
 *       console.log(event.payload.fps);
 *       break;
 *     // ...
 *   }
 * }
 * ```
 */
export type PlatformEvent =
  | AgentPlanCreatedEvent
  | AgentPlanApprovedEvent
  | AgentPlanRejectedEvent
  | AgentStepStartedEvent
  | AgentStepCompletedEvent
  | AgentStepFailedEvent
  | RenderJobQueuedEvent
  | RenderJobProgressEvent
  | RenderJobCompletedEvent
  | RenderJobFailedEvent
  | MeshPeerJoinedEvent
  | MeshPeerLeftEvent
  | MeshShardReplicatedEvent
  | PublishStartedEvent
  | PublishCompletedEvent
  | PublishFailedEvent
  | TokensConsumedEvent
  | TokensInsufficientEvent;

/**
 * Extract the event kind string literal union from `PlatformEvent`.
 */
export type PlatformEventKind = PlatformEvent['kind'];

/**
 * Extract the specific event type for a given kind.
 *
 * @example
 * ```ts
 * type E = EventByKind<'agent.plan.created'>;
 * // => AgentPlanCreatedEvent
 * ```
 */
export type EventByKind<K extends PlatformEventKind> = Extract<
  PlatformEvent,
  { readonly kind: K }
>;
