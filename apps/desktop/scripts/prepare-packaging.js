#!/usr/bin/env node
/**
 * Prepare desktop installer resources for packaging.
 *
 * This script:
 * - generates icons for macOS, Windows, and Linux
 * - renders the DMG background PNG
 * - downloads bundled FFmpeg/FFprobe binaries for the requested target
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;

function run(scriptName, args = []) {
  execFileSync(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
    stdio: 'inherit',
  });
}

function resolveTargets(rawArg) {
  const current = `${process.platform}-${process.arch}`;

  switch ((rawArg || 'current').toLowerCase()) {
    case 'current':
      return [current];
    case 'mac':
    case 'darwin':
      return [process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64'];
    case 'mac-arm64':
    case 'darwin-arm64':
      return ['darwin-arm64'];
    case 'mac-x64':
    case 'darwin-x64':
      return ['darwin-x64'];
    case 'win':
    case 'windows':
    case 'win32':
    case 'win32-x64':
      return ['win32-x64'];
    case 'linux':
    case 'linux-x64':
      return ['linux-x64'];
    case 'all':
      return ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'];
    default:
      return rawArg.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
}

function main() {
  const targets = resolveTargets(process.argv[2]);
  console.log(`Preparing packaging assets for: ${targets.join(', ')}`);
  run('sync-version.js');

  const resourcesDir = path.resolve(scriptsDir, '..', 'resources');
  const needsMacAssets = targets.some((target) => target.startsWith('darwin'));
  const requiredIconAssets = [
    path.join(resourcesDir, 'icon.ico'),
    path.join(resourcesDir, 'icon.png'),
  ];
  const optionalMacAssets = [
    path.join(resourcesDir, 'icon.icns'),
    path.join(resourcesDir, 'dmg-background.png'),
  ];

  const missingIcons = requiredIconAssets.some((assetPath) => !fs.existsSync(assetPath))
    || (needsMacAssets && optionalMacAssets.some((assetPath) => !fs.existsSync(assetPath)));

  if (missingIcons) {
    run('generate-icons.js');
  }

  if (needsMacAssets && !fs.existsSync(path.join(resourcesDir, 'dmg-background.png'))) {
    run('render-dmg-background.js');
  }

  for (const target of targets) {
    run('download-ffmpeg.js', [target]);
  }
}

main();
