#!/usr/bin/env node
/**
 * Render the DMG background PNG from the SVG source using platform tools.
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resourcesDir = path.resolve(__dirname, '..', 'resources');
const sourcePath = path.join(resourcesDir, 'dmg-background.svg');
const outputPath = path.join(resourcesDir, 'dmg-background.png');

function checkTool(name) {
  try {
    execSync(process.platform === 'win32' ? `where ${name}` : `which ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error('Missing resources/dmg-background.svg');
    process.exit(1);
  }

  if (checkTool('rsvg-convert')) {
    execFileSync('rsvg-convert', ['-w', '540', '-h', '380', sourcePath, '-o', outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  if (checkTool('sips')) {
    execFileSync('sips', ['-s', 'format', 'png', '-z', '380', '540', sourcePath, '--out', outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  if (checkTool('magick')) {
    execFileSync('magick', ['-background', 'none', '-density', '300', sourcePath, '-resize', '540x380!', outputPath], {
      stdio: 'inherit',
    });
    return;
  }

  console.error('Unable to render dmg-background.png: install rsvg-convert, use macOS sips, or install ImageMagick.');
  process.exit(1);
}

main();
