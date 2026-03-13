#!/usr/bin/env node
/**
 * Downloads platform-specific FFmpeg + FFprobe binaries
 * for bundling with the desktop app installer.
 *
 * Usage: node scripts/download-ffmpeg.js [platform]
 * Platforms: darwin-x64, darwin-arm64, win32-x64, linux-x64
 *
 * Binaries are placed in resources/bin/{os}/ for electron-builder extraResources.
 * macOS and Windows binaries are fetched from GitHub releases so packaged
 * builds do not depend on third-party non-GitHub mirrors.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const platform = process.argv[2] || `${process.platform}-${process.arch}`;
const resourcesDir = path.resolve(__dirname, '..', 'resources', 'bin');
const tmpRoot = path.join(os.tmpdir(), 'the-avid-ffmpeg');

const DOWNLOADS = {
  'darwin-arm64': {
    dir: 'mac',
    bins: ['ffmpeg', 'ffprobe'],
    source: {
      type: 'github-release',
      repo: 'jellyfin/jellyfin-ffmpeg',
      assetPattern: /^jellyfin-ffmpeg_.*_portable_macarm64-gpl\.tar\.xz$/,
      extract: 'tar',
    },
  },
  'darwin-x64': {
    dir: 'mac',
    bins: ['ffmpeg', 'ffprobe'],
    source: {
      type: 'github-release',
      repo: 'jellyfin/jellyfin-ffmpeg',
      assetPattern: /^jellyfin-ffmpeg_.*_portable_mac64-gpl\.tar\.xz$/,
      extract: 'tar',
    },
  },
  'win32-x64': {
    dir: 'win',
    bins: ['ffmpeg.exe', 'ffprobe.exe'],
    source: {
      type: 'github-release',
      repo: 'jellyfin/jellyfin-ffmpeg',
      assetPattern: /^jellyfin-ffmpeg_.*_portable_win64-clang-gpl\.zip$/,
      extract: 'zip',
    },
  },
  'linux-x64': {
    dir: 'linux',
    bins: ['ffmpeg', 'ffprobe'],
    source: {
      type: 'github-release',
      repo: 'BtbN/FFmpeg-Builds',
      assetPattern: /^ffmpeg-master-latest-linux64-gpl\.tar\.xz$/,
      extract: 'tar',
    },
  },
};

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function listFilesRecursive(rootDir) {
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function findBinary(rootDir, fileName) {
  return listFilesRecursive(rootDir).find((candidate) => path.basename(candidate) === fileName) ?? null;
}

function downloadFile(url, destination) {
  execSync(`curl -fL --retry 3 --retry-delay 2 "${url}" -o "${destination}"`, { stdio: 'inherit' });
}

async function fetchLatestReleaseAsset(source) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'the-avid-desktop-ffmpeg-fetch',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${source.repo}/releases/latest`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to resolve latest release for ${source.repo}: ${response.status} ${response.statusText}`);
  }

  const release = await response.json();
  const asset = release.assets?.find((entry) => source.assetPattern.test(entry.name));
  if (!asset) {
    throw new Error(`Could not find a matching release asset in ${source.repo} for ${platform}`);
  }

  return {
    tag: release.tag_name,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
  };
}

function writeManifest(manifestPath, config, asset) {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      platform,
      source: {
        type: config.source.type,
        repo: config.source.repo,
        tag: asset.tag,
        assetName: asset.assetName,
      },
      bins: config.bins,
      downloadedAt: new Date().toISOString(),
    }, null, 2),
  );
}

function shouldReuseExisting(manifest, config, asset) {
  return Boolean(
    manifest
      && manifest.source?.type === config.source.type
      && manifest.source?.repo === config.source.repo
      && manifest.source?.tag === asset.tag
      && manifest.source?.assetName === asset.assetName,
  );
}

function extractArchive(archivePath, extractDir, extractType) {
  removeIfExists(extractDir);
  ensureDir(extractDir);

  if (extractType === 'zip') {
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit' });
      return;
    }
    execSync(`unzip -o "${archivePath}" -d "${extractDir}"`, { stdio: 'inherit' });
    return;
  }

  execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });
}

async function main() {
  const config = DOWNLOADS[platform];
  if (!config) {
    console.log(`Platform ${platform} not supported. Available: ${Object.keys(DOWNLOADS).join(', ')}`);
    for (const [, entry] of Object.entries(DOWNLOADS)) {
      ensureDir(path.join(resourcesDir, entry.dir));
    }
    console.log('Created placeholder directories.');
    return;
  }

  const outDir = path.join(resourcesDir, config.dir);
  const manifestPath = path.join(outDir, 'ffmpeg-manifest.json');
  ensureDir(outDir);

  const asset = await fetchLatestReleaseAsset(config.source);
  const manifest = readManifest(manifestPath);
  const existingBinaries = config.bins.every((bin) => fs.existsSync(path.join(outDir, bin)));

  if (existingBinaries && shouldReuseExisting(manifest, config, asset)) {
    console.log(`FFmpeg binaries already current for ${platform} in ${outDir}`);
    return;
  }

  console.log(`Downloading FFmpeg for ${platform} from ${config.source.repo}@${asset.tag}...`);
  console.log(`Asset: ${asset.assetName}`);
  console.log(`Target: ${outDir}`);

  removeIfExists(path.join(outDir, 'ffmpeg'));
  removeIfExists(path.join(outDir, 'ffprobe'));
  removeIfExists(path.join(outDir, 'ffmpeg.exe'));
  removeIfExists(path.join(outDir, 'ffprobe.exe'));
  removeIfExists(manifestPath);

  ensureDir(tmpRoot);
  const archivePath = path.join(tmpRoot, asset.assetName);
  const extractDir = path.join(tmpRoot, `${platform}-extract`);

  removeIfExists(archivePath);
  downloadFile(asset.assetUrl, archivePath);
  extractArchive(archivePath, extractDir, config.source.extract);

  for (const bin of config.bins) {
    const src = findBinary(extractDir, bin);
    if (!src) {
      throw new Error(`Could not locate ${bin} inside ${asset.assetName}`);
    }

    const dest = path.join(outDir, bin);
    fs.copyFileSync(src, dest);
    if (process.platform !== 'win32' && !bin.endsWith('.exe')) {
      execSync(`chmod +x "${dest}"`);
    }
  }

  writeManifest(manifestPath, config, asset);

  for (const bin of config.bins) {
    const binPath = path.join(outDir, bin);
    if (!fs.existsSync(binPath)) {
      throw new Error(`${bin} was not written to ${outDir}`);
    }

    const size = (fs.statSync(binPath).size / 1024 / 1024).toFixed(1);
    console.log(`\u2713 ${bin} (${size} MB)`);
  }

  console.log(`\nFFmpeg binaries ready in ${outDir}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
