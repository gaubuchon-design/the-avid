#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { del, list, put } from '@vercel/blob';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultArtifactsDir = path.join(repoRoot, 'apps', 'desktop', 'out');
const metadataFileNames = ['latest.yml', 'latest-mac.yml', 'stable.yml', 'stable-mac.yml'];
const downloadManifestFileName = 'downloads.json';
const VERSION_LINE_PATTERN = /^version:\s*["']?([0-9A-Za-z.+-]+)["']?\s*$/m;

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function parseArgs(argv) {
  const args = {
    artifactsDir: defaultArtifactsDir,
    channel: process.env.DESKTOP_UPDATE_CHANNEL || 'stable',
    blobPrefix: process.env.DESKTOP_UPDATE_BLOB_PREFIX || 'desktop-updates',
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith('--artifacts-dir=')) {
      args.artifactsDir = path.resolve(repoRoot, arg.slice('--artifacts-dir='.length));
      continue;
    }
    if (arg.startsWith('--channel=')) {
      args.channel = arg.slice('--channel='.length).trim();
      continue;
    }
    if (arg.startsWith('--blob-prefix=')) {
      args.blobPrefix = arg.slice('--blob-prefix='.length).trim();
    }
  }

  return args;
}

function normalizeArtifactName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripOptionalQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function extractMetadataUrls(contents) {
  const urls = new Set();
  for (const line of contents.split(/\r?\n/)) {
    const fileMatch = line.match(/^\s*-\s+url:\s+(.+)\s*$/);
    if (fileMatch?.[1]) {
      urls.add(fileMatch[1].trim());
      continue;
    }

    const pathMatch = line.match(/^\s*path:\s+(.+)\s*$/);
    if (pathMatch?.[1]) {
      urls.add(pathMatch[1].trim());
    }
  }
  return urls;
}

function rewriteMetadataContents(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => {
      const fileMatch = line.match(/^(\s*-\s+url:\s+)(.+?)(\s*)$/);
      if (fileMatch?.[2]) {
        return `${fileMatch[1]}${normalizeArtifactName(stripOptionalQuotes(fileMatch[2].trim()))}${fileMatch[3]}`;
      }

      const pathMatch = line.match(/^(\s*path:\s+)(.+?)(\s*)$/);
      if (pathMatch?.[2]) {
        return `${pathMatch[1]}${normalizeArtifactName(stripOptionalQuotes(pathMatch[2].trim()))}${pathMatch[3]}`;
      }

      return line;
    })
    .join('\n');
}

function buildLocalArtifactIndex(artifactsDir) {
  const entries = fs
    .readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  return new Map(
    entries.map((name) => [
      name,
      {
        name,
        filePath: path.join(artifactsDir, name),
        normalized: normalizeArtifactName(name),
      },
    ])
  );
}

function resolveLocalArtifact(localArtifacts, requestedName) {
  const direct = localArtifacts.get(requestedName);
  if (direct) {
    return direct;
  }

  const normalizedRequested = normalizeArtifactName(requestedName);
  const matches = Array.from(localArtifacts.values()).filter(
    (entry) => entry.normalized === normalizedRequested
  );
  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error(
    `Unable to resolve local artifact for "${requestedName}" in the desktop out directory.`
  );
}

function isMetadataFileName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.yml') || lower.endsWith('.yaml') || lower.endsWith('.json');
}

function contentTypeForFileName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'text/yaml; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (lower.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (lower.endsWith('.blockmap')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function extractMetadataVersion(contents) {
  return contents.match(VERSION_LINE_PATTERN)?.[1] ?? null;
}

function getMetadataEntry(metadataEntries, preferredName, fallbackName) {
  return metadataEntries.get(preferredName) ?? metadataEntries.get(fallbackName) ?? null;
}

function sortArtifactsByName(artifacts) {
  return [...artifacts].sort((left, right) => left.name.localeCompare(right.name));
}

function findArtifacts(localArtifacts, predicate) {
  return sortArtifactsByName(Array.from(localArtifacts.values()).filter(predicate));
}

function chooseMacDownloadArtifact(localArtifacts, version) {
  const versionMatcher = version ? version.toLowerCase() : null;
  const dmgCandidates = findArtifacts(localArtifacts, (artifact) => {
    const lower = artifact.name.toLowerCase();
    return lower.endsWith('.dmg') && (!versionMatcher || lower.includes(versionMatcher));
  });

  if (dmgCandidates.length > 0) {
    return [...dmgCandidates].sort((left, right) => {
      const leftScore = Number(left.name.toLowerCase().includes('arm64'));
      const rightScore = Number(right.name.toLowerCase().includes('arm64'));
      return rightScore - leftScore || left.name.localeCompare(right.name);
    })[0];
  }

  const zipCandidates = findArtifacts(localArtifacts, (artifact) => {
    const lower = artifact.name.toLowerCase();
    return lower.endsWith('.zip') && (!versionMatcher || lower.includes(versionMatcher));
  });
  return zipCandidates[0] ?? null;
}

function resolveDownloadEntries(localArtifacts, metadataEntries) {
  const downloads = {};

  const windowsMetadata = getMetadataEntry(metadataEntries, 'latest.yml', 'stable.yml');
  if (windowsMetadata) {
    const windowsVersion = extractMetadataVersion(windowsMetadata.contents);
    const windowsArtifactPath = Array.from(extractMetadataUrls(windowsMetadata.contents)).find(
      (artifactPath) => artifactPath.toLowerCase().endsWith('.exe')
    );
    if (windowsArtifactPath) {
      const windowsArtifact = resolveLocalArtifact(localArtifacts, windowsArtifactPath);
      downloads['win'] = {
        version: windowsVersion,
        format: path.extname(windowsArtifactPath).slice(1) || 'exe',
        artifactPath: normalizeArtifactName(windowsArtifactPath),
        fileName: windowsArtifact.name,
        filePath: windowsArtifact.filePath,
      };
    }
  }

  const macMetadata = getMetadataEntry(metadataEntries, 'latest-mac.yml', 'stable-mac.yml');
  if (macMetadata) {
    const macVersion = extractMetadataVersion(macMetadata.contents);
    const metadataDmgPath = Array.from(extractMetadataUrls(macMetadata.contents)).find(
      (artifactPath) => artifactPath.toLowerCase().endsWith('.dmg')
    );

    if (metadataDmgPath) {
      const dmgArtifact = resolveLocalArtifact(localArtifacts, metadataDmgPath);
      downloads['mac'] = {
        version: macVersion,
        format: path.extname(metadataDmgPath).slice(1) || 'dmg',
        artifactPath: normalizeArtifactName(metadataDmgPath),
        fileName: dmgArtifact.name,
        filePath: dmgArtifact.filePath,
      };
      return downloads;
    }

    const macArtifact = chooseMacDownloadArtifact(localArtifacts, macVersion);
    if (macArtifact) {
      downloads['mac'] = {
        version: macVersion,
        format: path.extname(macArtifact.name).slice(1) || 'zip',
        artifactPath: macArtifact.normalized,
        fileName: macArtifact.name,
        filePath: macArtifact.filePath,
      };
    }
  }

  return downloads;
}

function createDownloadManifest(channel, downloadEntries) {
  return {
    channel,
    generatedAt: new Date().toISOString(),
    downloads: Object.fromEntries(
      Object.entries(downloadEntries).map(([platform, entry]) => [
        platform,
        {
          version: entry.version,
          format: entry.format,
          artifactPath: entry.artifactPath,
          fileName: entry.fileName,
        },
      ])
    ),
  };
}

function deriveDownloadBaseUrl(updateBaseUrl) {
  if (!updateBaseUrl) {
    return null;
  }

  const normalized = updateBaseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/desktop-updates')) {
    return normalized.replace(/\/desktop-updates$/, '/desktop-downloads');
  }
  if (normalized.endsWith('/desktop')) {
    return normalized.replace(/\/desktop$/, '/desktop-downloads');
  }
  return `${normalized}/desktop-downloads`;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function requireBlobReadWriteToken({ dryRun }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token && !dryRun) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required to publish desktop updates to Vercel Blob.');
  }
  return token ?? null;
}

async function uploadFile(blobPathname, filePath, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${filePath} -> ${blobPathname}`);
    return;
  }

  const isMetadata = isMetadataFileName(filePath);
  const token = requireBlobReadWriteToken({ dryRun });
  const maxAge = isMetadata ? 60 : 31536000;
  const contentType = contentTypeForFileName(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  await put(blobPathname, fileBuffer, {
    token,
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: maxAge,
  });

  console.log(`Uploaded ${path.basename(filePath)} -> ${blobPathname}`);
}

async function listAllBlobPathnames(prefix, token) {
  const pathnames = [];
  let cursor;

  do {
    const page = await list({
      token,
      prefix,
      limit: 1000,
      cursor,
    });
    pathnames.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.cursor;
    if (!page.hasMore) {
      break;
    }
  } while (cursor);

  return pathnames;
}

async function cleanupStaleBlobs({ prefix, desiredPathnames, dryRun }) {
  const token = requireBlobReadWriteToken({ dryRun });
  if (!token) {
    console.log('[dry-run] Skipping stale-blob preview because BLOB_READ_WRITE_TOKEN is not set.');
    return;
  }

  const existingPathnames = await listAllBlobPathnames(prefix, token);
  const stalePathnames = existingPathnames.filter((pathname) => !desiredPathnames.has(pathname));

  if (stalePathnames.length === 0) {
    console.log(`No stale desktop update blobs found under ${prefix}`);
    return;
  }

  for (const pathname of stalePathnames) {
    if (dryRun) {
      console.log(`[dry-run] delete ${pathname}`);
    }
  }

  if (dryRun) {
    return;
  }

  for (const batch of chunk(stalePathnames, 100)) {
    await del(batch, { token });
  }

  console.log(`Deleted ${stalePathnames.length} stale desktop update blob(s) under ${prefix}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const blobPrefix = trimSlashes(args.blobPrefix);
  const channel = trimSlashes(args.channel);

  if (!channel) {
    throw new Error('A non-empty update channel is required.');
  }
  if (!fs.existsSync(args.artifactsDir)) {
    throw new Error(`Desktop artifacts directory not found: ${args.artifactsDir}`);
  }

  const localArtifacts = buildLocalArtifactIndex(args.artifactsDir);
  const requestedBlobPaths = new Map();
  const metadataEntries = new Map();

  for (const metadataFileName of metadataFileNames) {
    const metadataPath = path.join(args.artifactsDir, metadataFileName);
    if (!fs.existsSync(metadataPath)) {
      continue;
    }

    const metadataContents = fs.readFileSync(metadataPath, 'utf8');
    metadataEntries.set(metadataFileName, {
      fileName: metadataFileName,
      filePath: metadataPath,
      contents: metadataContents,
    });
  }

  if (metadataEntries.size === 0) {
    throw new Error(
      `No update metadata files were found in ${args.artifactsDir}. Build desktop installers first.`
    );
  }

  const downloadEntries = resolveDownloadEntries(localArtifacts, metadataEntries);
  for (const entry of Object.values(downloadEntries)) {
    requestedBlobPaths.set(`${blobPrefix}/${channel}/${entry.artifactPath}`, entry.filePath);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-update-publish-'));

  try {
    for (const [metadataFileName, metadataEntry] of metadataEntries.entries()) {
      const rewrittenMetadataPath = path.join(tempDir, metadataFileName);
      fs.writeFileSync(
        rewrittenMetadataPath,
        `${rewriteMetadataContents(metadataEntry.contents)}\n`,
        'utf8'
      );
      requestedBlobPaths.set(`${blobPrefix}/${channel}/${metadataFileName}`, rewrittenMetadataPath);

      for (const referencedUrl of extractMetadataUrls(metadataEntry.contents)) {
        const localArtifact = resolveLocalArtifact(localArtifacts, referencedUrl);
        const publishedArtifactPath = normalizeArtifactName(referencedUrl);
        requestedBlobPaths.set(
          `${blobPrefix}/${channel}/${publishedArtifactPath}`,
          localArtifact.filePath
        );

        const localBlockmapName = `${localArtifact.name}.blockmap`;
        const publishedBlockmapName = `${publishedArtifactPath}.blockmap`;
        if (localArtifacts.has(localBlockmapName)) {
          requestedBlobPaths.set(
            `${blobPrefix}/${channel}/${publishedBlockmapName}`,
            localArtifacts.get(localBlockmapName).filePath
          );
        }
      }
    }

    const manifestPath = path.join(tempDir, downloadManifestFileName);
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(createDownloadManifest(channel, downloadEntries), null, 2)}\n`,
      'utf8'
    );
    requestedBlobPaths.set(`${blobPrefix}/${channel}/${downloadManifestFileName}`, manifestPath);

    for (const [blobPathname, filePath] of requestedBlobPaths.entries()) {
      await uploadFile(blobPathname, filePath, args.dryRun);
    }

    await cleanupStaleBlobs({
      prefix: `${blobPrefix}/${channel}/`,
      desiredPathnames: new Set(requestedBlobPaths.keys()),
      dryRun: args.dryRun,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const publicBaseUrl = process.env.DESKTOP_UPDATE_PUBLIC_BASE_URL
    ? `${trimSlashes(process.env.DESKTOP_UPDATE_PUBLIC_BASE_URL)}/${channel}`
    : null;
  const downloadBaseUrl = deriveDownloadBaseUrl(process.env.DESKTOP_UPDATE_PUBLIC_BASE_URL);

  if (publicBaseUrl) {
    console.log(`Desktop update feed published to ${publicBaseUrl}`);
  }

  if (downloadBaseUrl) {
    for (const platform of ['mac', 'win']) {
      if (!downloadEntries[platform]) {
        continue;
      }
      console.log(
        `Latest ${platform === 'mac' ? 'macOS' : 'Windows'} download: ${downloadBaseUrl}/${channel}/${platform}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
