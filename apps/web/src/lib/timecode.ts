export function toTimecode(seconds: number, fps = 23.976): string {
  const totalFrames = Math.floor(seconds * fps);
  const frames = totalFrames % Math.round(fps);
  const secs = Math.floor(seconds) % 60;
  const mins = Math.floor(seconds / 60) % 60;
  const hours = Math.floor(seconds / 3600);
  return [
    String(hours).padStart(2, '0'),
    String(mins).padStart(2, '0'),
    String(secs).padStart(2, '0'),
    String(frames).padStart(2, '0'),
  ].join(':');
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function trackTypeColor(type: string): string {
  switch (type) {
    case 'VIDEO':    return '#5b6ef4';
    case 'AUDIO':    return '#22c896';
    case 'EFFECT':   return '#f0a500';
    case 'SUBTITLE': return '#c084fc';
    case 'GRAPHIC':  return '#fb7185';
    default:         return '#5b6ef4';
  }
}

export function trackTypeClass(type: string): string {
  switch (type) {
    case 'VIDEO':  return 'clip-video';
    case 'AUDIO':  return 'clip-audio';
    case 'EFFECT': return 'clip-effect';
    default:       return 'clip-video';
  }
}

export function mediaTypeIcon(type: string): string {
  switch (type) {
    case 'VIDEO':    return '🎬';
    case 'AUDIO':    return '🎵';
    case 'IMAGE':    return '🖼️';
    case 'DOCUMENT': return '📄';
    default:         return '📁';
  }
}
