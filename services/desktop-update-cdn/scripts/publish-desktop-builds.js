#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { del, list } from '@vercel/blob';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultArtifactsDir = path.join(repoRoot, 'apps', 'desktop', 'out');
const metadataFileNames = ['latest.yml', 'latest-mac.yml', 'stable.yml', 'stable-mac.yml'];

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

function buildLocalArtifactIndex(artifactsDir) {
  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  return new Map(entries.map((name) => [name, {
    name,
    filePath: path.join(artifactsDir, name),
    normalized: normalizeArtifactName(name),
  }]));
}

function resolveLocalArtifact(localArtifacts, requestedName) {
  const direct = localArtifacts.get(requestedName);
  if (direct) {
    return direct;
  }

  const normalizedRequested = normalizeArtifactName(requestedName);
  const matches = Array.from(localArtifacts.values()).filter((entry) => entry.normalized === normalizedRequested);
  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error(`Unable to resolve local artifact for "${requestedName}" in the desktop out directory.`);
}

function contentTypeForFileName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'text/yaml; charset=utf-8';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (lower.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (lower.endsWith('.blockmap')) return 'application/octet-stream';
  return 'application/octet-stream';
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

  const isMetadata = filePath.endsWith('.yml') || filePath.endsWith('.yaml');
  const rwToken = requireBlobReadWriteToken({ dryRun });

  execFileSync('vercel', [
    'blob',
    'put',
    filePath,
    '--access',
    'private',
    '--pathname',
    blobPathname,
    '--allow-overwrite',
    'true',
    '--cache-control-max-age',
    String(isMetadata ? 60 : 31536000),
    '--content-type',
    contentTypeForFileName(filePath),
    '--rw-token',
    rwToken,
  ], {
    cwd: serviceRoot,
    stdio: 'pipe',
    encoding: 'utf8',
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

  for (const metadataFileName of metadataFileNames) {
    const metadataPath = path.join(args.artifactsDir, metadataFileName);
    if (!fs.existsSync(metadataPath)) {
      continue;
    }

    requestedBlobPaths.set(`${blobPrefix}/${channel}/${metadataFileName}`, metadataPath);

    const metadataContents = fs.readFileSync(metadataPath, 'utf8');
    for (const referencedUrl of extractMetadataUrls(metadataContents)) {
      const localArtifact = resolveLocalArtifact(localArtifacts, referencedUrl);
      requestedBlobPaths.set(`${blobPrefix}/${channel}/${referencedUrl}`, localArtifact.filePath);

      const localBlockmapName = `${localArtifact.name}.blockmap`;
      const referencedBlockmapName = `${referencedUrl}.blockmap`;
      if (localArtifacts.has(localBlockmapName)) {
        requestedBlobPaths.set(
          `${blobPrefix}/${channel}/${referencedBlockmapName}`,
          localArtifacts.get(localBlockmapName).filePath,
        );
      }
    }
  }

  if (requestedBlobPaths.size === 0) {
    throw new Error(`No update metadata files were found in ${args.artifactsDir}. Build desktop installers first.`);
  }

  for (const [blobPathname, filePath] of requestedBlobPaths.entries()) {
    await uploadFile(blobPathname, filePath, args.dryRun);
  }

  await cleanupStaleBlobs({
    prefix: `${blobPrefix}/${channel}/`,
    desiredPathnames: new Set(requestedBlobPaths.keys()),
    dryRun: args.dryRun,
  });

  const publicBaseUrl = process.env.DESKTOP_UPDATE_PUBLIC_BASE_URL
    ? `${trimSlashes(process.env.DESKTOP_UPDATE_PUBLIC_BASE_URL)}/${channel}`
    : null;
  if (publicBaseUrl) {
    console.log(`Desktop update feed published to ${publicBaseUrl}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
