import { head } from '@vercel/blob';

const UPDATE_PREFIX = trimSlashes(process.env.DESKTOP_UPDATE_BLOB_PREFIX || 'desktop-updates');
const SHARED_KEY_HEADER = 'x-desktop-update-key';
const CHANNEL_PATTERN = /^[A-Za-z0-9._-]+$/;
const ARTIFACT_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function notFoundResponse() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

function methodNotAllowedResponse() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

function isMetadataPath(pathname) {
  return pathname.endsWith('.yml') || pathname.endsWith('.yaml');
}

function validateArtifactPath(artifactPath) {
  const normalized = trimSlashes(artifactPath || '');
  if (!normalized) {
    return null;
  }

  const [channel, ...artifactParts] = normalized.split('/').filter(Boolean);
  if (!channel || !CHANNEL_PATTERN.test(channel)) {
    return null;
  }
  if (artifactParts.length === 0 || artifactParts.some((part) => !ARTIFACT_SEGMENT_PATTERN.test(part))) {
    return null;
  }

  return {
    channel,
    artifactPath: artifactParts.join('/'),
  };
}

function createResponseHeaders(result, artifactPath) {
  const headers = new Headers();
  const contentType = result.contentType || (isMetadataPath(artifactPath) ? 'text/yaml; charset=utf-8' : 'application/octet-stream');
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', isMetadataPath(artifactPath) ? 'private, no-cache, must-revalidate' : 'private, max-age=31536000, immutable');
  headers.set('Vary', SHARED_KEY_HEADER);

  if (result.contentDisposition) {
    headers.set('Content-Disposition', result.contentDisposition);
  }
  if (typeof result.size === 'number') {
    headers.set('Content-Length', String(result.size));
  }

  return headers;
}

export async function handleDesktopUpdateArtifactRequest(request, artifactPath) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowedResponse();
  }

  const expectedSharedKey = process.env.DESKTOP_UPDATE_SHARED_KEY;
  if (expectedSharedKey) {
    const providedSharedKey = request.headers.get(SHARED_KEY_HEADER);
    if (!providedSharedKey || providedSharedKey !== expectedSharedKey) {
      return unauthorizedResponse();
    }
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return Response.json({ error: 'BLOB_READ_WRITE_TOKEN is not configured.' }, { status: 500 });
  }

  const validated = validateArtifactPath(artifactPath);
  if (!validated) {
    return notFoundResponse();
  }

  const blobPathname = `${UPDATE_PREFIX}/${validated.channel}/${validated.artifactPath}`;
  let result;
  try {
    result = await head(blobPathname, {
      token: blobToken,
    });
  } catch {
    return notFoundResponse();
  }

  const headers = createResponseHeaders(result, validated.artifactPath);
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers,
    });
  }

  headers.set('Location', result.downloadUrl);
  return new Response(null, {
    status: 307,
    headers,
  });
}
