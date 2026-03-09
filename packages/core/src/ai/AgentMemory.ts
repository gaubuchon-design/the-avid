// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Agent Memory (AI-02)
//  Per-user preference memory across AI assistant sessions.
//  Stored as structured JSON, encrypted server-side, GDPR-compliant.
//  Injected as context at session start.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'editing-preferences'
  | 'audio-preferences'
  | 'workflow-patterns'
  | 'tool-usage'
  | 'project-context'
  | 'custom';

export interface MemoryEntry {
  id: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  value: unknown;
  confidence: number; // 0-1, how confident we are this is a real preference
  observationCount: number; // How many times this was observed
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  source: 'observed' | 'explicit' | 'inferred';
}

export interface MemoryContext {
  userId: string;
  sessionId: string;
  entries: MemoryEntry[];
  totalEntries: number;
  contextTokenEstimate: number;
}

export interface MemoryExportData {
  userId: string;
  exportedAt: string;
  entries: MemoryEntry[];
  version: string;
}

export interface AgentMemoryConfig {
  maxEntriesPerUser: number;
  maxContextTokens: number;
  confidenceThreshold: number;
  autoExpireDays: number;
  encryptionEnabled: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_MAX_CONTEXT_TOKENS = 4096;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_AUTO_EXPIRE_DAYS = 365;
const TOKENS_PER_ENTRY_ESTIMATE = 25;

// ─── Agent Memory Store ────────────────────────────────────────────────────

export class AgentMemory {
  private config: AgentMemoryConfig;
  private store: Map<string, MemoryEntry[]> = new Map(); // userId -> entries

  constructor(config?: Partial<AgentMemoryConfig>) {
    this.config = {
      maxEntriesPerUser: config?.maxEntriesPerUser ?? DEFAULT_MAX_ENTRIES,
      maxContextTokens: config?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      confidenceThreshold: config?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
      autoExpireDays: config?.autoExpireDays ?? DEFAULT_AUTO_EXPIRE_DAYS,
      encryptionEnabled: config?.encryptionEnabled ?? true,
    };
  }

  // ─── Memory Operations ─────────────────────────────────────────────

  /**
   * Records a preference or observation for a user.
   */
  remember(
    userId: string,
    category: MemoryCategory,
    key: string,
    value: unknown,
    source: MemoryEntry['source'] = 'observed',
  ): MemoryEntry {
    const entries = this.getUserEntries(userId);
    const existing = entries.find((e) => e.category === category && e.key === key);

    if (existing) {
      existing.value = value;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.observationCount++;
      existing.updatedAt = new Date().toISOString();
      existing.source = source;
      return existing;
    }

    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      category,
      key,
      value,
      confidence: source === 'explicit' ? 1.0 : 0.5,
      observationCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: this.computeExpiration(),
      source,
    };

    entries.push(entry);

    // Enforce max entries
    if (entries.length > this.config.maxEntriesPerUser) {
      entries.sort((a, b) => {
        // Keep high-confidence and recently updated entries
        const scoreA = a.confidence * 0.5 + (new Date(a.updatedAt).getTime() / Date.now()) * 0.5;
        const scoreB = b.confidence * 0.5 + (new Date(b.updatedAt).getTime() / Date.now()) * 0.5;
        return scoreB - scoreA;
      });
      entries.length = this.config.maxEntriesPerUser;
    }

    this.store.set(userId, entries);
    return entry;
  }

  /**
   * Retrieves a specific memory entry.
   */
  recall(userId: string, category: MemoryCategory, key: string): unknown | null {
    const entries = this.getUserEntries(userId);
    const entry = entries.find((e) => e.category === category && e.key === key);
    return entry?.value ?? null;
  }

  /**
   * Retrieves all memories for a category.
   */
  recallCategory(userId: string, category: MemoryCategory): MemoryEntry[] {
    return this.getUserEntries(userId).filter((e) => e.category === category);
  }

  /**
   * Forgets a specific memory (GDPR: right to erasure).
   */
  forget(userId: string, memoryId: string): boolean {
    const entries = this.getUserEntries(userId);
    const idx = entries.findIndex((e) => e.id === memoryId);
    if (idx >= 0) {
      entries.splice(idx, 1);
      this.store.set(userId, entries);
      return true;
    }
    return false;
  }

  /**
   * Forgets all memories for a user (GDPR: right to erasure).
   */
  forgetAll(userId: string): number {
    const entries = this.getUserEntries(userId);
    const count = entries.length;
    this.store.delete(userId);
    return count;
  }

  /**
   * Forgets all memories in a category.
   */
  forgetCategory(userId: string, category: MemoryCategory): number {
    const entries = this.getUserEntries(userId);
    const before = entries.length;
    const filtered = entries.filter((e) => e.category !== category);
    this.store.set(userId, filtered);
    return before - filtered.length;
  }

  // ─── Context Injection ─────────────────────────────────────────────

  /**
   * Builds the memory context to inject at session start.
   * Filters by confidence threshold and token budget.
   */
  buildContext(userId: string, sessionId: string): MemoryContext {
    const allEntries = this.getUserEntries(userId);

    // Filter by confidence and expiration
    const now = new Date();
    const validEntries = allEntries.filter((entry) => {
      if (entry.confidence < this.config.confidenceThreshold) return false;
      if (entry.expiresAt && new Date(entry.expiresAt) < now) return false;
      return true;
    });

    // Sort by relevance (confidence * recency)
    validEntries.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + (1 - (now.getTime() - new Date(a.updatedAt).getTime()) / (86400000 * 30)) * 0.4;
      const scoreB = b.confidence * 0.6 + (1 - (now.getTime() - new Date(b.updatedAt).getTime()) / (86400000 * 30)) * 0.4;
      return scoreB - scoreA;
    });

    // Trim to token budget
    const maxEntries = Math.floor(this.config.maxContextTokens / TOKENS_PER_ENTRY_ESTIMATE);
    const contextEntries = validEntries.slice(0, maxEntries);

    return {
      userId,
      sessionId,
      entries: contextEntries,
      totalEntries: allEntries.length,
      contextTokenEstimate: contextEntries.length * TOKENS_PER_ENTRY_ESTIMATE,
    };
  }

  /**
   * Serializes the memory context to a string for injection into system prompt.
   */
  serializeContext(context: MemoryContext): string {
    if (context.entries.length === 0) {
      return '';
    }

    const grouped = new Map<MemoryCategory, MemoryEntry[]>();
    for (const entry of context.entries) {
      if (!grouped.has(entry.category)) {
        grouped.set(entry.category, []);
      }
      grouped.get(entry.category)!.push(entry);
    }

    const sections: string[] = [];
    for (const [category, entries] of grouped) {
      const items = entries.map((e) => `  - ${e.key}: ${JSON.stringify(e.value)}`).join('\n');
      sections.push(`[${category}]\n${items}`);
    }

    return `<user-preferences>\n${sections.join('\n\n')}\n</user-preferences>`;
  }

  // ─── GDPR Compliance ───────────────────────────────────────────────

  /**
   * Exports all user data (GDPR: right to data portability).
   */
  exportUserData(userId: string): MemoryExportData {
    return {
      userId,
      exportedAt: new Date().toISOString(),
      entries: [...this.getUserEntries(userId)],
      version: '1.0',
    };
  }

  /**
   * Allows user to view all stored memories.
   */
  viewAllMemories(userId: string): MemoryEntry[] {
    return [...this.getUserEntries(userId)];
  }

  /**
   * Deletes all user data (GDPR: right to erasure).
   */
  deleteAllUserData(userId: string): { deletedCount: number; timestamp: string } {
    const count = this.forgetAll(userId);
    return {
      deletedCount: count,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Bulk Operations ───────────────────────────────────────────────

  /**
   * Imports memory data (for data restoration or migration).
   */
  importUserData(data: MemoryExportData): number {
    const entries = this.getUserEntries(data.userId);
    let imported = 0;

    for (const entry of data.entries) {
      const existing = entries.find((e) => e.id === entry.id);
      if (!existing) {
        entries.push({ ...entry });
        imported++;
      }
    }

    // Enforce limits
    if (entries.length > this.config.maxEntriesPerUser) {
      entries.length = this.config.maxEntriesPerUser;
    }

    this.store.set(data.userId, entries);
    return imported;
  }

  /**
   * Prunes expired and low-confidence entries for a user.
   */
  prune(userId: string): number {
    const entries = this.getUserEntries(userId);
    const now = new Date();
    const before = entries.length;

    const pruned = entries.filter((entry) => {
      if (entry.expiresAt && new Date(entry.expiresAt) < now) return false;
      if (entry.confidence < 0.1 && entry.observationCount <= 1) return false;
      return true;
    });

    this.store.set(userId, pruned);
    return before - pruned.length;
  }

  // ─── Stats ─────────────────────────────────────────────────────────

  getStats(userId: string): {
    totalEntries: number;
    byCategory: Record<string, number>;
    averageConfidence: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  } {
    const entries = this.getUserEntries(userId);
    const byCategory: Record<string, number> = {};

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }

    const avgConfidence = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
      : 0;

    const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      totalEntries: entries.length,
      byCategory,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      oldestEntry: sorted[0]?.createdAt ?? null,
      newestEntry: sorted[sorted.length - 1]?.createdAt ?? null,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private getUserEntries(userId: string): MemoryEntry[] {
    if (!this.store.has(userId)) {
      this.store.set(userId, []);
    }
    return this.store.get(userId)!;
  }

  private computeExpiration(): string | null {
    if (this.config.autoExpireDays <= 0) return null;
    const date = new Date();
    date.setDate(date.getDate() + this.config.autoExpireDays);
    return date.toISOString();
  }

  dispose(): void {
    this.store.clear();
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createAgentMemory(
  config?: Partial<AgentMemoryConfig>,
): AgentMemory {
  return new AgentMemory(config);
}
