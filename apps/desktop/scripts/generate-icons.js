#!/usr/bin/env node
/**
 * Generates platform-specific icon files from the source SVG.
 *
 * Requirements:
 *   - macOS: `brew install librsvg` (for rsvg-convert)
 *   - All: ImageMagick (`brew install imagemagick` or `apt install imagemagick`)
 *
 * Usage: node scripts/generate-icons.js
 *
 * Outputs:
 *   resources/icon.icns    (macOS)
 *   resources/icon.ico     (Windows)
 *   resources/icon.png     (Linux/fallback, 512x512)
 *   resources/icons/       (Linux multi-size PNGs)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resourcesDir = path.resolve(__dirname, '..', 'resources');
const svgPath = path.join(resourcesDir, 'icon.svg');
const tmpDir = '/tmp/avid-icons';

// Required sizes for icns
const ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function checkTool(name) {
  try {
    execSync(`which ${name}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

async function main() {
  console.log('Icon Generator for The Avid\n');

  if (!fs.existsSync(svgPath)) {
    console.error('Error: resources/icon.svg not found');
    process.exit(1);
  }

  // Clean and create temp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const hasRsvg = checkTool('rsvg-convert');
  const hasMagick = checkTool('magick') || checkTool('convert');
  const hasSips = checkTool('sips'); // macOS built-in
  const hasIconutil = checkTool('iconutil'); // macOS built-in

  if (!hasRsvg && !hasMagick) {
    console.error('Error: Need either rsvg-convert or ImageMagick installed.');
    console.error('  macOS: brew install librsvg imagemagick');
    console.error('  Linux: apt install librsvg2-bin imagemagick');
    process.exit(1);
  }

  // Step 1: Generate PNGs at all sizes
  console.log('Generating PNGs...');
  for (const size of ICON_SIZES) {
    const outPng = path.join(tmpDir, `icon_${size}x${size}.png`);
    if (hasRsvg) {
      run(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outPng}"`);
    } else {
      run(`magick -background none -density 300 "${svgPath}" -resize ${size}x${size} "${outPng}"`);
    }
  }

  // Step 2: Copy 512px as main PNG
  fs.copyFileSync(path.join(tmpDir, 'icon_512x512.png'), path.join(resourcesDir, 'icon.png'));
  console.log('✓ icon.png (512x512)');

  // Step 3: Create Linux icon directory
  const linuxIconDir = path.join(resourcesDir, 'icons');
  fs.mkdirSync(linuxIconDir, { recursive: true });
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    const src = path.join(tmpDir, `icon_${size}x${size}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(linuxIconDir, `${size}x${size}.png`));
    }
  }
  console.log('✓ icons/ directory (Linux multi-size)');

  // Step 4: Generate macOS .icns
  if (hasIconutil) {
    console.log('Generating macOS .icns...');
    const iconsetDir = path.join(tmpDir, 'icon.iconset');
    fs.mkdirSync(iconsetDir, { recursive: true });

    const icnsSizes = [
      [16, '16x16'], [32, '16x16@2x'],
      [32, '32x32'], [64, '32x32@2x'],
      [128, '128x128'], [256, '128x128@2x'],
      [256, '256x256'], [512, '256x256@2x'],
      [512, '512x512'], [1024, '512x512@2x'],
    ];

    for (const [size, name] of icnsSizes) {
      const src = path.join(tmpDir, `icon_${size}x${size}.png`);
      fs.copyFileSync(src, path.join(iconsetDir, `icon_${name}.png`));
    }

    run(`iconutil -c icns "${iconsetDir}" -o "${path.join(resourcesDir, 'icon.icns')}"`);
    console.log('✓ icon.icns (macOS)');
  } else {
    console.log('⚠ Skipping .icns (iconutil not found - macOS only)');
  }

  // Step 5: Generate Windows .ico
  if (hasMagick) {
    console.log('Generating Windows .ico...');
    const icoSizes = [16, 32, 48, 64, 128, 256].map(s => path.join(tmpDir, `icon_${s}x${s}.png`));
    const magickCmd = checkTool('magick') ? 'magick' : 'convert';
    run(`${magickCmd} ${icoSizes.join(' ')} "${path.join(resourcesDir, 'icon.ico')}"`);
    console.log('✓ icon.ico (Windows)');
  } else {
    console.log('⚠ Skipping .ico (ImageMagick not found)');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
