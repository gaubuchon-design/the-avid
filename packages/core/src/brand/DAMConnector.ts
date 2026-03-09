// ─── DAM Connector ───────────────────────────────────────────────────────────
// Enterprise DAM integration: Bynder, Brandfolder, Canto, AEM, Cloudinary
// adapters. Browse/search from editor, download to project with AMA-link,
// upload finished content back, metadata sync, and rights expiry warnings.

import { generateId } from '../utils';
import type {
  DAMConnection,
  DAMAsset,
  DAMProvider,
  DAMCredentials,
  DAMSearchParams,
  DAMUploadParams,
  DAMUsageRights,
} from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const connectionStore = new Map<string, DAMConnection>();
const assetCache = new Map<string, DAMAsset[]>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Provider display names ──────────────────────────────────────────────────

const PROVIDER_NAMES: Record<DAMProvider, string> = {
  BYNDER: 'Bynder',
  BRANDFOLDER: 'Brandfolder',
  CANTO: 'Canto',
  AEM: 'Adobe Experience Manager',
  CLOUDINARY: 'Cloudinary',
};

export function getProviderDisplayName(provider: DAMProvider): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

// ─── Connection Management ───────────────────────────────────────────────────

export function createConnection(
  provider: DAMProvider,
  credentials: DAMCredentials,
  displayName?: string,
): DAMConnection {
  const connection: DAMConnection = {
    id: generateId(),
    provider,
    credentials: clone(credentials),
    displayName: displayName ?? getProviderDisplayName(provider),
    isConnected: false,
    lastSyncedAt: undefined,
  };
  connectionStore.set(connection.id, clone(connection));
  return clone(connection);
}

export function getConnection(id: string): DAMConnection | null {
  const conn = connectionStore.get(id);
  return conn ? clone(conn) : null;
}

export function listConnections(): DAMConnection[] {
  return Array.from(connectionStore.values()).map(clone);
}

export function deleteConnection(id: string): void {
  if (!connectionStore.has(id)) {
    throw new Error(`DAM connection not found: ${id}`);
  }
  connectionStore.delete(id);
  assetCache.delete(id);
}

/**
 * Authenticate and connect to a DAM provider.
 * In a real implementation this would perform OAuth or API key validation.
 */
export async function connect(connectionId: string): Promise<DAMConnection> {
  const conn = connectionStore.get(connectionId);
  if (!conn) throw new Error(`DAM connection not found: ${connectionId}`);

  // Simulate authentication
  await new Promise<void>((resolve) => setTimeout(resolve, 300 + Math.random() * 200));

  conn.isConnected = true;
  conn.lastSyncedAt = now();
  connectionStore.set(connectionId, clone(conn));
  return clone(conn);
}

export async function disconnect(connectionId: string): Promise<DAMConnection> {
  const conn = connectionStore.get(connectionId);
  if (!conn) throw new Error(`DAM connection not found: ${connectionId}`);

  conn.isConnected = false;
  connectionStore.set(connectionId, clone(conn));
  return clone(conn);
}

// ─── Browse & Search ─────────────────────────────────────────────────────────

/**
 * Search assets across connected DAM providers.
 * In production this calls each provider's search API.
 */
export async function searchAssets(
  params: DAMSearchParams,
): Promise<DAMAsset[]> {
  // Simulate API call
  await new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.random() * 300));

  const connectedProviders = Array.from(connectionStore.values())
    .filter((c) => c.isConnected)
    .filter((c) => !params.provider || c.provider === params.provider);

  if (connectedProviders.length === 0) {
    return [];
  }

  // Generate simulated search results
  const results: DAMAsset[] = [];
  const limit = params.limit ?? 20;
  const queryLower = params.query.toLowerCase();

  for (const conn of connectedProviders) {
    const count = Math.min(limit, 3 + Math.floor(Math.random() * 5));
    for (let i = 0; i < count; i++) {
      const assetType = params.type ?? (['VIDEO', 'IMAGE', 'AUDIO', 'VIDEO'] as const)[i % 4];
      results.push({
        id: generateId(),
        externalId: `${conn.provider.toLowerCase()}-${generateId().slice(0, 8)}`,
        provider: conn.provider,
        name: `${queryLower}_${assetType.toLowerCase()}_${i + 1}`,
        type: assetType,
        thumbnailUrl: `/dam-thumbnails/${conn.provider.toLowerCase()}-${i + 1}.jpg`,
        downloadUrl: `/dam-downloads/${conn.provider.toLowerCase()}-${i + 1}`,
        metadata: {
          source: conn.provider,
          query: params.query,
          resolution: assetType === 'VIDEO' || assetType === 'IMAGE' ? '1920x1080' : undefined,
        },
        keywords: params.keywords ?? [queryLower, conn.provider.toLowerCase()],
        usageRights: generateUsageRights(),
      });
    }
  }

  return results.slice(0, limit);
}

/**
 * Browse a specific DAM connection's asset library.
 */
export async function browseAssets(
  connectionId: string,
  folder?: string,
  limit?: number,
): Promise<DAMAsset[]> {
  const conn = connectionStore.get(connectionId);
  if (!conn) throw new Error(`DAM connection not found: ${connectionId}`);
  if (!conn.isConnected) throw new Error('DAM connection is not active.');

  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  const cached = assetCache.get(connectionId);
  if (cached) return clone(cached).slice(0, limit ?? 50);

  // Generate browse results
  const assets: DAMAsset[] = Array.from({ length: limit ?? 12 }, (_, i) => ({
    id: generateId(),
    externalId: `browse-${i}`,
    provider: conn.provider,
    name: `${conn.displayName} Asset ${i + 1}`,
    type: (['VIDEO', 'IMAGE', 'AUDIO', 'VIDEO'] as const)[i % 4],
    thumbnailUrl: `/dam-thumbnails/browse-${i + 1}.jpg`,
    downloadUrl: `/dam-downloads/browse-${i + 1}`,
    metadata: { folder: folder ?? 'root' },
    keywords: ['brand', 'asset'],
    usageRights: generateUsageRights(),
  }));

  assetCache.set(connectionId, clone(assets));
  return clone(assets);
}

// ─── Download & Upload ───────────────────────────────────────────────────────

export interface DownloadResult {
  assetId: string;
  localPath: string;
  amaLink: string; // Avid Media Access link
  metadata: Record<string, unknown>;
}

/**
 * Download a DAM asset to the local project with an AMA-link.
 */
export async function downloadAsset(
  asset: DAMAsset,
  projectPath: string,
): Promise<DownloadResult> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

  const localPath = `${projectPath}/dam-imports/${asset.provider.toLowerCase()}/${asset.name}`;
  const amaLink = `ama://${asset.provider.toLowerCase()}/${asset.externalId}`;

  return {
    assetId: asset.id,
    localPath,
    amaLink,
    metadata: clone(asset.metadata),
  };
}

/**
 * Upload finished content back to a DAM provider.
 */
export async function uploadAsset(
  params: DAMUploadParams,
): Promise<{ externalId: string; url: string }> {
  const conn = connectionStore.get(params.connectionId);
  if (!conn) throw new Error(`DAM connection not found: ${params.connectionId}`);
  if (!conn.isConnected) throw new Error('DAM connection is not active.');

  await new Promise<void>((resolve) => setTimeout(resolve, 800 + Math.random() * 400));

  return {
    externalId: `${conn.provider.toLowerCase()}-upload-${generateId().slice(0, 8)}`,
    url: `https://${conn.provider.toLowerCase()}.example.com/assets/${generateId().slice(0, 8)}`,
  };
}

// ─── Metadata Sync ───────────────────────────────────────────────────────────

export interface MetadataSyncResult {
  assetId: string;
  synced: boolean;
  fields: string[];
}

/**
 * Sync metadata between the local project and the DAM.
 */
export async function syncMetadata(
  asset: DAMAsset,
  localMetadata: Record<string, unknown>,
): Promise<MetadataSyncResult> {
  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  const fields = Object.keys(localMetadata);
  return {
    assetId: asset.id,
    synced: true,
    fields,
  };
}

// ─── Rights Expiry Warnings ──────────────────────────────────────────────────

export interface RightsWarning {
  assetId: string;
  assetName: string;
  provider: DAMProvider;
  daysUntilExpiry: number;
  licensedUntil: string;
  severity: 'urgent' | 'warning' | 'info';
}

/**
 * Check all cached DAM assets for upcoming rights expiry.
 */
export function checkRightsExpiry(): RightsWarning[] {
  const warnings: RightsWarning[] = [];
  const nowDate = new Date();

  for (const assets of assetCache.values()) {
    for (const asset of assets) {
      if (!asset.usageRights?.licensedUntil) continue;

      const expiryDate = new Date(asset.usageRights.licensedUntil);
      const daysUntil = Math.ceil(
        (expiryDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntil <= 30) {
        warnings.push({
          assetId: asset.id,
          assetName: asset.name,
          provider: asset.provider,
          daysUntilExpiry: Math.max(0, daysUntil),
          licensedUntil: asset.usageRights.licensedUntil,
          severity: daysUntil <= 0 ? 'urgent' : daysUntil <= 7 ? 'warning' : 'info',
        });
      }
    }
  }

  return warnings.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// ─── Helpers (internal) ──────────────────────────────────────────────────────

function generateUsageRights(): DAMUsageRights {
  const daysFromNow = Math.floor(Math.random() * 365) - 30; // some may be expired
  const expiryDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return {
    licensedUntil: expiryDate.toISOString(),
    territories: ['US', 'EU', 'UK'],
    restrictions: Math.random() < 0.3 ? ['no-broadcast'] : [],
    isExpired: daysFromNow < 0,
  };
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export function seedDemoConnections(): DAMConnection[] {
  const bynder = createConnection('BYNDER', {
    apiKey: 'demo-bynder-key',
    endpoint: 'https://acme.bynder.com',
  }, 'Acme Bynder');

  const cloudinary = createConnection('CLOUDINARY', {
    apiKey: 'demo-cloudinary-key',
    apiSecret: 'demo-cloudinary-secret',
  }, 'Acme Cloudinary');

  return [bynder, cloudinary];
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetDAMStore(): void {
  connectionStore.clear();
  assetCache.clear();
}
