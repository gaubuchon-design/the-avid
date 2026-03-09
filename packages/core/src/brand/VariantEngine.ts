// ─── Variant Engine ──────────────────────────────────────────────────────────
// Generate N variants from a master edit: subtitle replacement by language,
// clip replacement by variant, end card replacement by market, music
// replacement by rights territory, visual matrix, one-click generate all,
// and master-variant linking for propagation.

import { generateId } from '../utils';
import type {
  VariantDefinition,
  VariantChange,
  VariantResult,
  VariantStatus,
  MasterVariantLink,
} from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const definitionStore = new Map<string, VariantDefinition>();
const resultStore = new Map<string, VariantResult>();
const linkStore = new Map<string, MasterVariantLink>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Variant Definitions ─────────────────────────────────────────────────────

export function createVariantDefinition(
  variantName: string,
  languageCode: string,
  changes: VariantChange[],
  market?: string,
): VariantDefinition {
  const def: VariantDefinition = {
    id: generateId(),
    variantName,
    languageCode,
    market,
    changes: clone(changes),
  };
  definitionStore.set(def.id, clone(def));
  return clone(def);
}

export function getVariantDefinition(id: string): VariantDefinition | null {
  const def = definitionStore.get(id);
  return def ? clone(def) : null;
}

export function listVariantDefinitions(): VariantDefinition[] {
  return Array.from(definitionStore.values()).map(clone);
}

export function updateVariantDefinition(
  id: string,
  patch: Partial<Omit<VariantDefinition, 'id'>>,
): VariantDefinition {
  const existing = definitionStore.get(id);
  if (!existing) throw new Error(`VariantDefinition not found: ${id}`);
  const updated = { ...existing, ...patch, id: existing.id };
  definitionStore.set(id, clone(updated));
  return clone(updated);
}

export function deleteVariantDefinition(id: string): void {
  if (!definitionStore.has(id)) {
    throw new Error(`VariantDefinition not found: ${id}`);
  }
  definitionStore.delete(id);
}

// ─── Variant Generation ──────────────────────────────────────────────────────

export interface GenerateVariantOptions {
  masterSequenceId: string;
  definitionId: string;
}

/**
 * Generate a single variant from a master sequence.
 * In a real implementation this would call into the timeline engine to apply
 * subtitle, clip, endcard, and music replacements.
 * Here we simulate the process asynchronously.
 */
export async function generateVariant(
  options: GenerateVariantOptions,
): Promise<VariantResult> {
  const definition = definitionStore.get(options.definitionId);
  if (!definition) {
    throw new Error(`VariantDefinition not found: ${options.definitionId}`);
  }

  // Create a pending result
  const result: VariantResult = {
    variantDefinitionId: options.definitionId,
    sequenceId: generateId(),
    status: 'generating',
  };
  resultStore.set(result.variantDefinitionId, clone(result));

  try {
    // Simulate variant generation (per-change processing)
    for (const change of definition.changes) {
      await simulateChangeProcessing(change);
    }

    // Mark as generated
    result.status = 'generated';
    result.generatedAt = now();
    resultStore.set(result.variantDefinitionId, clone(result));

    // Create master-variant link
    const link: MasterVariantLink = {
      masterId: options.masterSequenceId,
      variantId: result.sequenceId,
      variantDefinitionId: options.definitionId,
      createdAt: now(),
      lastSyncedAt: now(),
    };
    linkStore.set(`${link.masterId}-${link.variantId}`, clone(link));

    return clone(result);
  } catch (err) {
    result.status = 'failed';
    result.error = err instanceof Error ? err.message : 'Unknown error';
    resultStore.set(result.variantDefinitionId, clone(result));
    return clone(result);
  }
}

/**
 * One-click generate all defined variants for a master sequence.
 */
export async function generateAllVariants(
  masterSequenceId: string,
  definitionIds?: string[],
): Promise<VariantResult[]> {
  const ids = definitionIds ?? Array.from(definitionStore.keys());
  const results: VariantResult[] = [];

  for (const defId of ids) {
    const result = await generateVariant({
      masterSequenceId,
      definitionId: defId,
    });
    results.push(result);
  }

  return results;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export function getVariantResult(definitionId: string): VariantResult | null {
  const result = resultStore.get(definitionId);
  return result ? clone(result) : null;
}

export function listVariantResults(): VariantResult[] {
  return Array.from(resultStore.values()).map(clone);
}

// ─── Master-Variant Links ────────────────────────────────────────────────────

export function listMasterVariantLinks(masterId?: string): MasterVariantLink[] {
  const all = Array.from(linkStore.values());
  const filtered = masterId
    ? all.filter((link) => link.masterId === masterId)
    : all;
  return filtered.map(clone);
}

/**
 * Propagate a change from the master sequence to all linked variants.
 * In a real implementation this would re-apply each variant definition
 * on top of the updated master. Here we update the sync timestamp.
 */
export function propagateMasterChange(masterId: string): MasterVariantLink[] {
  const links = Array.from(linkStore.values()).filter(
    (link) => link.masterId === masterId,
  );

  for (const link of links) {
    link.lastSyncedAt = now();
    linkStore.set(`${link.masterId}-${link.variantId}`, clone(link));
  }

  return links.map(clone);
}

// ─── Visual Matrix ───────────────────────────────────────────────────────────

export interface VariantMatrixEntry {
  definitionId: string;
  variantName: string;
  languageCode: string;
  market?: string;
  status: VariantStatus;
  sequenceId?: string;
}

/**
 * Build a visual matrix of master vs variants for dashboard display.
 */
export function buildVariantMatrix(): VariantMatrixEntry[] {
  return Array.from(definitionStore.values()).map((def) => {
    const result = resultStore.get(def.id);
    return {
      definitionId: def.id,
      variantName: def.variantName,
      languageCode: def.languageCode,
      market: def.market,
      status: result?.status ?? 'pending',
      sequenceId: result?.sequenceId,
    };
  });
}

// ─── Change simulation ───────────────────────────────────────────────────────

async function simulateChangeProcessing(change: VariantChange): Promise<void> {
  // Simulate async work (200-400ms per change)
  const delay = 200 + Math.random() * 200;
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export function seedDemoVariants(): VariantDefinition[] {
  const defs = [
    createVariantDefinition('French', 'fr-FR', [
      { type: 'subtitle-replace', params: { language: 'fr-FR', srtUrl: '/subs/fr.srt' } },
      { type: 'endcard-replace', params: { ctaText: 'En savoir plus', market: 'FR' } },
    ], 'FR'),
    createVariantDefinition('German', 'de-DE', [
      { type: 'subtitle-replace', params: { language: 'de-DE', srtUrl: '/subs/de.srt' } },
      { type: 'endcard-replace', params: { ctaText: 'Mehr erfahren', market: 'DE' } },
    ], 'DE'),
    createVariantDefinition('Japanese', 'ja-JP', [
      { type: 'subtitle-replace', params: { language: 'ja-JP', srtUrl: '/subs/ja.srt' } },
      { type: 'music-replace', params: { reason: 'rights-territory', replacementId: 'music-jp-001' } },
      { type: 'endcard-replace', params: { ctaText: '\u8A73\u3057\u304F\u306F\u3053\u3061\u3089', market: 'JP' } },
    ], 'JP'),
    createVariantDefinition('Spanish (LATAM)', 'es-419', [
      { type: 'subtitle-replace', params: { language: 'es-419', srtUrl: '/subs/es-latam.srt' } },
      { type: 'clip-replace', params: { clipId: 'hero-shot', replacementClipId: 'hero-shot-latam' } },
      { type: 'endcard-replace', params: { ctaText: 'Conoce m\u00e1s', market: 'LATAM' } },
    ], 'LATAM'),
  ];
  return defs;
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetVariantStore(): void {
  definitionStore.clear();
  resultStore.clear();
  linkStore.clear();
}
