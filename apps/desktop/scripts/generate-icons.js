#!/usr/bin/env node
/**
 * Generates platform-specific icon files from the source SVG.
 *
 * This version prefers native macOS tooling (`sips`, `iconutil`) and falls
 * back to `rsvg-convert` or ImageMagick when available, so packaging can run
 * on clean macOS build machines without extra graphics dependencies.
 *
 * Outputs:
 *   resources/icon.icns
 *   resources/icon.ico
 *   resources/icon.png
 *   resources/icons/*
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resourcesDir = path.resolve(__dirname, '..', 'resources');
const svgPath = path.join(resourcesDir, 'icon.svg');
const tmpDir = path.join('/tmp', 'avid-icons');
const linuxIconDir = path.join(resourcesDir, 'icons');
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

function checkTool(name) {
  try {
    execSync(process.platform === 'win32' ? `where ${name}` : `which ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderPng(size, outputPath, tools) {
  if (tools.rsvg) {
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svgPath, '-o', outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  if (tools.sips) {
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), svgPath, '--out', outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  if (tools.magick) {
    execFileSync(tools.magick, ['-background', 'none', '-density', '300', svgPath, '-resize', `${size}x${size}`, outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  throw new Error('No supported rasterization tool found. Install rsvg-convert, ImageMagick, or use macOS sips.');
}

function createIco(iconSizes) {
  const pngBuffers = iconSizes.map((size) => ({
    size,
    data: fs.readFileSync(path.join(tmpDir, `icon_${size}x${size}.png`)),
  }));

  const headerSize = 6;
  const directoryEntrySize = 16;
  const dataOffsetStart = headerSize + (directoryEntrySize * pngBuffers.length);
  let currentOffset = dataOffsetStart;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const directoryEntries = [];
  const payloads = [];

  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(directoryEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    currentOffset += data.length;
    directoryEntries.push(entry);
    payloads.push(data);
  }

  return Buffer.concat([header, ...directoryEntries, ...payloads]);
}

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('Error: resources/icon.svg not found');
    process.exit(1);
  }

  const tools = {
    rsvg: checkTool('rsvg-convert'),
    sips: checkTool('sips'),
    iconutil: checkTool('iconutil'),
    magick: checkTool('magick')
      ? 'magick'
      : (process.platform !== 'win32' && checkTool('convert') ? 'convert' : null),
  };

  if (!tools.rsvg && !tools.sips && !tools.magick) {
    console.error('Error: no supported SVG rasterization tool found.');
    process.exit(1);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  ensureDir(tmpDir);
  ensureDir(linuxIconDir);

  console.log('Generating icon PNGs...');
  for (const size of ICON_SIZES) {
    renderPng(size, path.join(tmpDir, `icon_${size}x${size}.png`), tools);
  }

  fs.copyFileSync(path.join(tmpDir, 'icon_512x512.png'), path.join(resourcesDir, 'icon.png'));

  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    fs.copyFileSync(
      path.join(tmpDir, `icon_${size}x${size}.png`),
      path.join(linuxIconDir, `${size}x${size}.png`),
    );
  }

  if (tools.iconutil) {
    const iconsetDir = path.join(tmpDir, 'icon.iconset');
    ensureDir(iconsetDir);

    const icnsSizes = [
      [16, '16x16'],
      [32, '16x16@2x'],
      [32, '32x32'],
      [64, '32x32@2x'],
      [128, '128x128'],
      [256, '128x128@2x'],
      [256, '256x256'],
      [512, '256x256@2x'],
      [512, '512x512'],
      [1024, '512x512@2x'],
    ];

    for (const [size, name] of icnsSizes) {
      fs.copyFileSync(
        path.join(tmpDir, `icon_${size}x${size}.png`),
        path.join(iconsetDir, `icon_${name}.png`),
      );
    }

    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(resourcesDir, 'icon.icns')], {
      stdio: 'inherit',
    });
  }

  fs.writeFileSync(
    path.join(resourcesDir, 'icon.ico'),
    createIco([16, 32, 48, 64, 128, 256]),
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Generated icon.icns, icon.ico, icon.png, and Linux icons.');
}

main().catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
