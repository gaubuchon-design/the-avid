import { head } from '@vercel/blob';

const UPDATE_PREFIX = trimSlashes(process.env.DESKTOP_UPDATE_BLOB_PREFIX || 'desktop-updates');
const DOWNLOAD_MANIFEST_NAME = 'downloads.json';
const CHANNEL_PATTERN = /^[A-Za-z0-9._-]+$/;
const PLATFORM_ALIASES = new Map([
  ['darwin', 'mac'],
  ['mac', 'mac'],
  ['macos', 'mac'],
  ['osx', 'mac'],
  ['win', 'win'],
  ['windows', 'win'],
]);

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function notFoundResponse() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

function internalErrorResponse(message) {
  return Response.json({ error: message }, { status: 500 });
}

function normalizePlatform(value) {
  return PLATFORM_ALIASES.get((value || '').toLowerCase()) ?? null;
}

function parseDownloadRequest(rawPath) {
  const parts = trimSlashes(rawPath || '')
    .split('/')
    .filter(Boolean);
  let channel = 'stable';
  let platform = null;

  if (parts.length === 1) {
    platform = normalizePlatform(parts[0]);
    if (!platform) {
      channel = parts[0];
    }
  } else if (parts.length === 2) {
    channel = parts[0];
    platform = normalizePlatform(parts[1]);
    if (!platform) {
      return null;
    }
  } else if (parts.length > 2) {
    return null;
  }

  if (!channel || !CHANNEL_PATTERN.test(channel)) {
    return null;
  }

  return { channel, platform };
}

function buildLatestUrl(request, channel, platform) {
  const url = new URL(request.url);
  return `${url.origin}/desktop-downloads/${channel}/${platform}`;
}

async function loadDownloadManifest(channel, token) {
  const manifestHead = await head(`${UPDATE_PREFIX}/${channel}/${DOWNLOAD_MANIFEST_NAME}`, {
    token,
  });
  const response = await fetch(manifestHead.downloadUrl);
  if (!response.ok) {
    throw new Error(`Unable to read ${DOWNLOAD_MANIFEST_NAME}`);
  }
  return response.json();
}

function createRedirectResponse(downloadUrl, fileName) {
  const headers = new Headers();
  headers.set('Cache-Control', 'public, no-cache, must-revalidate');
  headers.set('Location', downloadUrl);
  if (fileName) {
    headers.set('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
  }
  return new Response(null, {
    status: 307,
    headers,
  });
}

function createManifestResponse(request, channel, manifest) {
  const downloads = Object.fromEntries(
    Object.entries(manifest.downloads || {}).map(([platform, entry]) => [
      platform,
      {
        ...entry,
        latestUrl: buildLatestUrl(request, channel, platform),
      },
    ])
  );

  return Response.json(
    {
      channel,
      generatedAt: manifest.generatedAt ?? null,
      downloads,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    }
  );
}

async function handleDesktopDownloadRequest(request) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return internalErrorResponse('BLOB_READ_WRITE_TOKEN is not configured.');
  }

  const rawPath = new URL(request.url).searchParams.get('path');
  const parsed = parseDownloadRequest(rawPath);
  if (!parsed) {
    return notFoundResponse();
  }

  let manifest;
  try {
    manifest = await loadDownloadManifest(parsed.channel, blobToken);
  } catch {
    return notFoundResponse();
  }

  if (!parsed.platform) {
    return createManifestResponse(request, parsed.channel, manifest);
  }

  const download = manifest.downloads?.[parsed.platform];
  if (!download?.artifactPath) {
    return notFoundResponse();
  }

  try {
    const artifactHead = await head(`${UPDATE_PREFIX}/${parsed.channel}/${download.artifactPath}`, {
      token: blobToken,
    });
    return createRedirectResponse(artifactHead.downloadUrl, download.fileName);
  } catch {
    return notFoundResponse();
  }
}

export async function GET(request) {
  return handleDesktopDownloadRequest(request);
}

export async function HEAD(request) {
  return handleDesktopDownloadRequest(request);
}
