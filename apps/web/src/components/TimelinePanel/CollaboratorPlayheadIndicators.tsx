import React, { memo } from 'react';
import { toTimecode } from '../../lib/timecode';
import { useCollabStore } from '../../store/collab.store';

interface CollaboratorPlayheadIndicatorsProps {
  zoom: number;
  scrollLeft: number;
  fps: number;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export const CollaboratorPlayheadIndicators = memo(function CollaboratorPlayheadIndicators({
  zoom,
  scrollLeft,
  fps,
}: CollaboratorPlayheadIndicatorsProps) {
  const onlineUsers = useCollabStore((state) => state.onlineUsers);
  const currentUserId = useCollabStore((state) => state.currentUserId);

  const collaborators = onlineUsers
    .filter((user) => user.id !== currentUserId)
    .map((user) => {
      const playheadTime = typeof user.playheadTime === 'number'
        ? user.playheadTime
        : user.cursorFrame / (fps > 0 ? fps : 24);

      return {
        ...user,
        playheadTime,
      };
    })
    .filter((user) => Number.isFinite(user.playheadTime) && user.playheadTime >= 0);

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <div className="collab-playhead-layer" aria-hidden="true">
      {collaborators.map((user) => {
        const left = user.playheadTime * zoom - scrollLeft;
        const style: React.CSSProperties & { '--collab-playhead-color'?: string } = {
          left,
          '--collab-playhead-color': user.color,
        };

        return (
          <div
            key={user.id}
            className={`collab-playhead${user.isOnline ? '' : ' offline'}`}
            style={style}
            role="img"
            aria-label={`Collaborator playhead ${user.name} at ${toTimecode(user.playheadTime, fps)}`}
            title={`${user.name}${user.isOnline ? '' : ' (offline)'} \u2022 ${toTimecode(user.playheadTime, fps)}`}
          >
            <span className="collab-playhead-tag">{getInitials(user.name)}</span>
          </div>
        );
      })}
    </div>
  );
});
