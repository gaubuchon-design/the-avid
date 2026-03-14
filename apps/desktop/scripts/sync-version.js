#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const rootPackagePath = path.join(repoRoot, 'package.json');
const desktopPackagePath = path.join(desktopRoot, 'package.json');
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveRequestedVersion(argv, fallbackVersion) {
  for (const arg of argv) {
    if (arg.startsWith('--set=')) {
      return arg.slice('--set='.length).trim();
    }
  }

  const positional = argv.find((arg) => !arg.startsWith('--'));
  return positional ? positional.trim() : fallbackVersion;
}

function ensureSemver(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid desktop version "${version}". Expected semver, for example 0.2.0 or 0.2.0-beta.1.`);
  }
}

function main() {
  const rootPackage = readJson(rootPackagePath);
  const desktopPackage = readJson(desktopPackagePath);
  const nextVersion = resolveRequestedVersion(process.argv.slice(2), rootPackage.version);
  ensureSemver(nextVersion);

  const previousRootVersion = rootPackage.version;
  const previousDesktopVersion = desktopPackage.version;

  rootPackage.version = nextVersion;
  desktopPackage.version = nextVersion;

  const changed = previousRootVersion !== nextVersion || previousDesktopVersion !== nextVersion;
  if (!changed) {
    console.log(`Desktop version already synchronized at ${nextVersion}`);
    return;
  }

  writeJson(rootPackagePath, rootPackage);
  writeJson(desktopPackagePath, desktopPackage);
  console.log(`Synchronized root and desktop versions to ${nextVersion}`);
}

main();
