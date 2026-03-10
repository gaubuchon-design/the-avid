import React, { memo } from 'react';
import { toTimecode } from '../../lib/timecode';
import { useCollabStore } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';

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

function getFollowLabel(name: string, playheadTime: number, fps: number): string {
  return `Follow ${name} playhead at ${toTimecode(playheadTime, fps)}`;
}

export const CollaboratorPlayheadIndicators = memo(function CollaboratorPlayheadIndicators({
  zoom,
  scrollLeft,
  fps,
}: CollaboratorPlayheadIndicatorsProps) {
  const onlineUsers = useCollabStore((state) => state.onlineUsers);
  const currentUserId = useCollabStore((state) => state.currentUserId);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const selectTrack = useEditorStore((state) => state.selectTrack);

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
    <div className="collab-playhead-layer" role="group" aria-label="Collaborator playhead indicators">
      {collaborators.map((user) => {
        const left = user.playheadTime * zoom - scrollLeft;
        const style: React.CSSProperties & { '--collab-playhead-color'?: string } = {
          left,
          '--collab-playhead-color': user.color,
        };
        const followLabel = getFollowLabel(user.name, user.playheadTime, fps);
        const followPlayhead = () => {
          setPlayhead(user.playheadTime);
          if (user.cursorTrackId) {
            selectTrack(user.cursorTrackId);
          }
        };

        return (
          <button
            type="button"
            key={user.id}
            className={`collab-playhead${user.isOnline ? '' : ' offline'}`}
            style={style}
            aria-label={followLabel}
            title={`${followLabel}${user.isOnline ? '' : ' (offline)'}`}
            onClick={followPlayhead}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') {
                return;
              }
              event.preventDefault();
              followPlayhead();
            }}
          >
            <span className="collab-playhead-tag">{getInitials(user.name)}</span>
          </button>
        );
      })}
    </div>
  );
});
