const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const baseBuild = packageJson.build ?? {};

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

const updateBaseUrl = trimTrailingSlash(
  process.env.DESKTOP_UPDATE_BASE_URL || 'https://downloads.theavid.com/desktop',
);
const updateChannel = process.env.DESKTOP_UPDATE_CHANNEL || detectReleaseChannel(packageJson.version);
const updateSharedKey = process.env.DESKTOP_UPDATE_SHARED_KEY;

const publishTarget = {
  provider: 'generic',
  url: `${updateBaseUrl}/${updateChannel}`,
  channel: updateChannel,
};

if (updateSharedKey) {
  publishTarget.requestHeaders = {
    'X-Desktop-Update-Key': updateSharedKey,
  };
}

module.exports = {
  ...baseBuild,
  electronUpdaterCompatibility: '>=2.16',
  publish: [publishTarget],
};
