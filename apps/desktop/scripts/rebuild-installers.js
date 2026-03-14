#!/usr/bin/env node
/**
 * Clean and rebuild desktop installers for supported targets.
 *
 * Intended usage:
 *   node scripts/rebuild-installers.js --targets=mac
 *   node scripts/rebuild-installers.js --targets=win
 *   node scripts/rebuild-installers.js --targets=mac,win --allow-cross
 *
 * By default this removes apps/desktop/out and apps/desktop/dist before
 * rebuilding so stale installers do not survive between runs.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const outDir = path.join(desktopRoot, 'out');
const distDir = path.join(desktopRoot, 'dist');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const TARGET_TO_SCRIPT = {
  mac: 'dist:mac',
  win: 'dist:win',
  windows: 'dist:win',
  linux: 'dist:linux',
};

const HOST_TARGETS = {
  darwin: new Set(['mac']),
  win32: new Set(['win', 'windows']),
  linux: new Set(['linux']),
};

function parseArgs(argv) {
  const args = {
    allowCross: false,
    skipClean: false,
    targets: null,
  };

  for (const arg of argv) {
    if (arg === '--allow-cross') {
      args.allowCross = true;
      continue;
    }
    if (arg === '--skip-clean') {
      args.skipClean = true;
      continue;
    }
    if (arg.startsWith('--targets=')) {
      args.targets = arg.slice('--targets='.length);
    }
  }

  return args;
}

function resolveTargets(rawTargets) {
  if (!rawTargets || rawTargets === 'current') {
    if (process.platform === 'darwin') return ['mac'];
    if (process.platform === 'win32') return ['win'];
    return ['linux'];
  }

  if (rawTargets === 'all') {
    return ['mac', 'win', 'linux'];
  }

  return Array.from(new Set(
    rawTargets
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ));
}

function ensureTargetsAreSupported(targets, allowCross) {
  if (allowCross || process.env.CI === 'true') {
    return;
  }

  const hostTargets = HOST_TARGETS[process.platform] ?? new Set();
  const unsupported = targets.filter((target) => !hostTargets.has(target));
  if (unsupported.length === 0) {
    return;
  }

  throw new Error(
    `Cross-platform installer rebuilds are disabled on ${process.platform}. ` +
    `Use a matching host/CI runner or pass --allow-cross to try anyway for: ${unsupported.join(', ')}.`,
  );
}

function runWorkspaceScript(scriptName) {
  execFileSync(npmCmd, ['run', scriptName, '--workspace=@mcua/desktop'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function cleanOutputs() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(distDir, { recursive: true, force: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args.targets);
  const scripts = targets.map((target) => {
    const scriptName = TARGET_TO_SCRIPT[target];
    if (!scriptName) {
      throw new Error(`Unsupported installer target: ${target}`);
    }
    return { target, scriptName };
  });

  ensureTargetsAreSupported(targets, args.allowCross);

  if (!args.skipClean) {
    console.log(`Removing previous installer outputs from ${outDir} and ${distDir}`);
    cleanOutputs();
  }

  for (const { target, scriptName } of scripts) {
    console.log(`\n=== Rebuilding ${target} desktop installers ===`);
    runWorkspaceScript(scriptName);
  }

  console.log(`\nInstaller rebuild complete. Artifacts are available in ${outDir}`);
}

main();
