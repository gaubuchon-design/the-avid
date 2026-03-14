import { handleDesktopUpdateArtifactRequest } from './handler.js';

export async function GET(request) {
  const artifact = new URL(request.url).searchParams.get('artifact');
  if (artifact) {
    return handleDesktopUpdateArtifactRequest(request, artifact);
  }

  return Response.json({
    service: 'desktop-update-cdn',
    status: 'ok',
    message: 'Desktop update feed is available.',
  });
}

export async function HEAD(request) {
  const artifact = new URL(request.url).searchParams.get('artifact');
  if (artifact) {
    return handleDesktopUpdateArtifactRequest(request, artifact);
  }

  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'application/json',
    },
  });
}
