import React, { memo, useState } from 'react';
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
    .filter((user) => Number.isFinite(user.playheadTime) && user.playheadTime >= 0)
    .sort((a, b) => a.playheadTime - b.playheadTime);
  const [activeIndicatorId, setActiveIndicatorId] = useState<string | null>(null);
  const hasActiveIndicator = activeIndicatorId !== null
    && collaborators.some((user) => user.id === activeIndicatorId);

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <div className="collab-playhead-layer" role="group" aria-label="Collaborator playhead indicators">
      {collaborators.map((user, index) => {
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
        const tabIndex = hasActiveIndicator
          ? (activeIndicatorId === user.id ? 0 : -1)
          : (index === 0 ? 0 : -1);

        return (
          <button
            type="button"
            key={user.id}
            data-indicator-id={user.id}
            className={`collab-playhead${user.isOnline ? '' : ' offline'}`}
            style={style}
            aria-label={followLabel}
            title={`${followLabel}${user.isOnline ? '' : ' (offline)'}`}
            tabIndex={tabIndex}
            onClick={() => {
              setActiveIndicatorId(user.id);
              followPlayhead();
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const layer = event.currentTarget.parentElement;
                if (!layer) {
                  return;
                }
                const buttons = Array.from(layer.querySelectorAll<HTMLButtonElement>('.collab-playhead'));
                const currentIndex = buttons.indexOf(event.currentTarget);
                if (currentIndex === -1 || buttons.length <= 1) {
                  return;
                }

                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
                const nextButton = buttons[nextIndex];
                const nextIndicatorId = nextButton?.dataset['indicatorId'];
                if (nextIndicatorId) {
                  setActiveIndicatorId(nextIndicatorId);
                }
                nextButton?.focus();
                return;
              }

              if (event.key !== 'Enter' && event.key !== ' ') {
                return;
              }
              event.preventDefault();
              setActiveIndicatorId(user.id);
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
