#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const rootPackagePath = path.join(repoRoot, 'package.json');
const desktopPackagePath = path.join(desktopRoot, 'package.json');
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const VERSION_LINE_PATTERN = /^version:\s*["']?([0-9A-Za-z.+-]+)["']?\s*$/m;

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

function getFlagValue(argv, name) {
  const prefix = `--${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length).trim();
    }
  }
  return undefined;
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function detectReleaseChannel(version) {
  const prerelease = version.split('-', 2)[1];
  if (!prerelease) {
    return 'stable';
  }

  const [channel] = prerelease.split('.', 1);
  return channel || 'stable';
}

function parseSemver(version) {
  ensureSemver(version);

  const [coreAndPrerelease, build] = version.split('+', 2);
  const [core, prerelease] = coreAndPrerelease.split('-', 2);
  const [major, minor, patch] = core.split('.').map((value) => Number.parseInt(value, 10));

  return {
    major,
    minor,
    patch,
    prerelease: prerelease ? prerelease.split('.') : [],
    build: build ? build.split('.') : [],
  };
}

function compareIdentifier(left, right) {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);
  const leftIsNumber = String(leftNumber) === left;
  const rightIsNumber = String(rightNumber) === right;

  if (leftIsNumber && rightIsNumber) {
    return leftNumber - rightNumber;
  }
  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;
  return left.localeCompare(right);
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = a.prerelease[index];
    const rightIdentifier = b.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;

    const identifierComparison = compareIdentifier(leftIdentifier, rightIdentifier);
    if (identifierComparison !== 0) {
      return identifierComparison;
    }
  }

  return 0;
}

function formatSemver({ major, minor, patch, prerelease }) {
  const core = `${major}.${minor}.${patch}`;
  if (!prerelease || prerelease.length === 0) {
    return core;
  }

  return `${core}-${prerelease.join('.')}`;
}

function incrementVersion(version) {
  const parsed = parseSemver(version);
  if (parsed.prerelease.length === 0) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  const prerelease = [...parsed.prerelease];
  const lastIdentifier = prerelease[prerelease.length - 1];
  const lastNumber = Number.parseInt(lastIdentifier, 10);
  if (String(lastNumber) === lastIdentifier) {
    prerelease[prerelease.length - 1] = String(lastNumber + 1);
  } else {
    prerelease.push('1');
  }

  return formatSemver({ ...parsed, prerelease });
}

async function fetchPublishedVersion(baseUrl, channel, sharedKey) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const candidates = [
    `${normalizedBaseUrl}/${channel}/latest.yml`,
    `${normalizedBaseUrl}/${channel}/latest-mac.yml`,
    `${normalizedBaseUrl}/${channel}/${channel}.yml`,
    `${normalizedBaseUrl}/${channel}/${channel}-mac.yml`,
  ];
  const headers = sharedKey ? { 'X-Desktop-Update-Key': sharedKey } : {};

  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        continue;
      }
      const body = await response.text();
      const match = body.match(VERSION_LINE_PATTERN);
      if (match?.[1]) {
        ensureSemver(match[1]);
        return match[1];
      }
    } catch (error) {
      console.warn(`Unable to read published desktop version from ${url}: ${error.message}`);
    }
  }

  return null;
}

async function resolveAutomaticVersion({
  argv,
  fallbackVersion,
}) {
  const publishedVersionOverride = getFlagValue(argv, 'published-version');
  if (publishedVersionOverride) {
    ensureSemver(publishedVersionOverride);
  }

  const baseUrl = getFlagValue(argv, 'feed-base-url') || process.env.DESKTOP_UPDATE_BASE_URL;
  const sharedKey = getFlagValue(argv, 'shared-key') || process.env.DESKTOP_UPDATE_SHARED_KEY;
  const channel =
    getFlagValue(argv, 'channel')
    || process.env.DESKTOP_UPDATE_CHANNEL
    || detectReleaseChannel(fallbackVersion);

  const publishedVersion =
    publishedVersionOverride
    || (baseUrl ? await fetchPublishedVersion(baseUrl, channel, sharedKey) : null);

  if (!publishedVersion) {
    return fallbackVersion;
  }

  if (compareSemver(fallbackVersion, publishedVersion) > 0) {
    return fallbackVersion;
  }

  return incrementVersion(publishedVersion);
}

async function main() {
  const argv = process.argv.slice(2);
  const rootPackage = readJson(rootPackagePath);
  const desktopPackage = readJson(desktopPackagePath);
  const fallbackVersion = resolveRequestedVersion(argv, rootPackage.version);
  const nextVersion = hasFlag(argv, 'auto')
    ? await resolveAutomaticVersion({ argv, fallbackVersion })
    : fallbackVersion;
  ensureSemver(nextVersion);

  if (hasFlag(argv, 'print')) {
    console.log(nextVersion);
    return;
  }

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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
