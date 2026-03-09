export const SERVICE_NAME = 'knowledge-node';
export const SERVICE_VERSION = '0.1.0';

// ─── Database ─────────────────────────────────────────────────────────────
export { KnowledgeDB, vectorToBuffer, bufferToVector } from './db/KnowledgeDB.js';
export type {
  AssetRow,
  TranscriptSegmentRow,
  VisionEventRow,
  EmbeddingChunkRow,
  MarkerRow,
  PlaybookRow,
  ToolTraceRow,
  PublishVariantRow,
  ShardMetaRow,
  DBStats,
} from './db/KnowledgeDB.js';

// ─── Shard ────────────────────────────────────────────────────────────────
export {
  createManifest,
  validateManifest,
  computeChecksum,
  serializeManifest,
  deserializeManifest,
} from './shard/ShardManifest.js';
export type {
  ShardManifestData,
  LeaseInfoData,
  ReplicationStateData,
  CreateManifestOptions,
} from './shard/ShardManifest.js';
export { ShardManager } from './shard/ShardManager.js';
export type {
  CreateShardOptions,
  ShardHandle,
  IntegrityResult,
} from './shard/ShardManager.js';

// ─── Index ────────────────────────────────────────────────────────────────
export { BruteForceIndex } from './index/ANNIndex.js';
export type { IANNIndex, ANNSearchResult } from './index/ANNIndex.js';
export { IndexBuilder } from './index/IndexBuilder.js';

// ─── Mesh ─────────────────────────────────────────────────────────────────
export { MeshService } from './mesh/MeshService.js';
export type {
  MeshConfig,
  PeerAddress,
  NodeInfo,
} from './mesh/MeshService.js';
export { PeerDiscovery } from './mesh/PeerDiscovery.js';
export type { PeerState } from './mesh/PeerDiscovery.js';
export { ShardLeaseManager } from './mesh/ShardLeaseManager.js';
export type { Lease } from './mesh/ShardLeaseManager.js';
export { ReplicationManager } from './mesh/ReplicationManager.js';
export type { ReplicationEvent } from './mesh/ReplicationManager.js';
export { ScatterGatherSearch } from './mesh/ScatterGatherSearch.js';
export type {
  SearchQuery,
  SearchHit,
  MergedSearchResults,
} from './mesh/ScatterGatherSearch.js';
export { ResultRanker } from './mesh/ResultRanker.js';
export { ConflictHandler } from './mesh/ConflictHandler.js';
export type { ConflictType, Conflict } from './mesh/ConflictHandler.js';
