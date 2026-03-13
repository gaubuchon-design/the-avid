#!/usr/bin/env node
/**
 * Downloads platform-specific FFmpeg + FFprobe static binaries
 * for bundling with the desktop app installer.
 *
 * Usage: node scripts/download-ffmpeg.js [platform]
 * Platforms: darwin-x64, darwin-arm64, win32-x64, linux-x64
 *
 * Binaries are placed in resources/bin/{os}/ for electron-builder extraResources.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const FFMPEG_VERSION = '7.1';

// Static build URLs (using BtbN releases - widely used GPL builds with all codecs)
const DOWNLOADS = {
  'darwin-arm64': {
    url: `https://evermeet.cx/ffmpeg/getrelease/zip`,
    probeUrl: `https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip`,
    dir: 'mac',
    bins: ['ffmpeg', 'ffprobe'],
    extract: 'zip',
  },
  'darwin-x64': {
    url: `https://evermeet.cx/ffmpeg/getrelease/zip`,
    probeUrl: `https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip`,
    dir: 'mac',
    bins: ['ffmpeg', 'ffprobe'],
    extract: 'zip',
  },
  'win32-x64': {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
    dir: 'win',
    bins: ['ffmpeg.exe', 'ffprobe.exe'],
    extract: 'zip',
    subdir: 'ffmpeg-master-latest-win64-gpl/bin',
  },
  'linux-x64': {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz`,
    dir: 'linux',
    bins: ['ffmpeg', 'ffprobe'],
    extract: 'tar',
    subdir: 'ffmpeg-master-latest-linux64-gpl/bin',
  },
};

const platform = process.argv[2] || `${process.platform}-${process.arch}`;
const resourcesDir = path.resolve(__dirname, '..', 'resources', 'bin');

async function main() {
  const config = DOWNLOADS[platform];
  if (!config) {
    console.log(`Platform ${platform} not supported. Available: ${Object.keys(DOWNLOADS).join(', ')}`);
    // Create placeholder directories for all platforms
    for (const [, cfg] of Object.entries(DOWNLOADS)) {
      const dir = path.join(resourcesDir, cfg.dir);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '.gitkeep'), '');
    }
    console.log('Created placeholder directories.');
    return;
  }

  const outDir = path.join(resourcesDir, config.dir);
  fs.mkdirSync(outDir, { recursive: true });

  const existingBinaries = config.bins.every((bin) => fs.existsSync(path.join(outDir, bin)));
  if (existingBinaries) {
    console.log(`FFmpeg binaries already present for ${platform} in ${outDir}`);
    return;
  }

  console.log(`Downloading FFmpeg for ${platform}...`);
  console.log(`Target: ${outDir}`);

  // For macOS, download ffmpeg and ffprobe separately
  if (platform.startsWith('darwin')) {
    console.log('Downloading ffmpeg...');
    execSync(`curl -L "${config.url}" -o /tmp/ffmpeg.zip`, { stdio: 'inherit' });
    execSync(`unzip -o /tmp/ffmpeg.zip -d "${outDir}"`, { stdio: 'inherit' });

    console.log('Downloading ffprobe...');
    execSync(`curl -L "${config.probeUrl}" -o /tmp/ffprobe.zip`, { stdio: 'inherit' });
    execSync(`unzip -o /tmp/ffprobe.zip -d "${outDir}"`, { stdio: 'inherit' });

    // Make executable
    execSync(`chmod +x "${outDir}/ffmpeg" "${outDir}/ffprobe"`, { stdio: 'inherit' });
  } else if (config.extract === 'zip') {
    const tmpFile = '/tmp/ffmpeg-download.zip';
    console.log('Downloading...');
    execSync(`curl -L "${config.url}" -o "${tmpFile}"`, { stdio: 'inherit' });

    const tmpDir = '/tmp/ffmpeg-extract';
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${tmpFile}' -DestinationPath '${tmpDir}' -Force"`, { stdio: 'inherit' });
    } else {
      execSync(`unzip -o "${tmpFile}" -d "${tmpDir}"`, { stdio: 'inherit' });
    }

    // Copy binaries from subdir
    for (const bin of config.bins) {
      const src = path.join(tmpDir, config.subdir, bin);
      const dest = path.join(outDir, bin);
      fs.copyFileSync(src, dest);
      if (process.platform !== 'win32') execSync(`chmod +x "${dest}"`);
    }
  } else if (config.extract === 'tar') {
    const tmpFile = '/tmp/ffmpeg-download.tar.xz';
    console.log('Downloading...');
    execSync(`curl -L "${config.url}" -o "${tmpFile}"`, { stdio: 'inherit' });

    const tmpDir = '/tmp/ffmpeg-extract';
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`tar -xf "${tmpFile}" -C "${tmpDir}"`, { stdio: 'inherit' });

    for (const bin of config.bins) {
      const src = path.join(tmpDir, config.subdir, bin);
      const dest = path.join(outDir, bin);
      fs.copyFileSync(src, dest);
      execSync(`chmod +x "${dest}"`);
    }
  }

  // Verify
  for (const bin of config.bins) {
    const binPath = path.join(outDir, bin);
    if (fs.existsSync(binPath)) {
      const size = (fs.statSync(binPath).size / 1024 / 1024).toFixed(1);
      console.log(`\u2713 ${bin} (${size} MB)`);
    } else {
      console.error(`\u2717 ${bin} not found!`);
      process.exit(1);
    }
  }

  console.log(`\nFFmpeg binaries ready in ${outDir}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
