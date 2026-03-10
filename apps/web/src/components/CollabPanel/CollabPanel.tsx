// ─── Collaboration Panel ────────────────────────────────────────────────────
// Four-tab panel: Users (presence), Comments (threaded with reactions),
// Versions (snapshots), and Activity (live feed).

import React, { useState, useCallback, useMemo } from 'react';
import { useCollabStore, type CollaboratorIdentityProfile } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';
import { toTimecode } from '../../lib/timecode';
import {
  buildVersionComparison,
  formatSignedDelta,
  pickComparisonBaseline,
  type VersionCompareMode,
} from '../../lib/versionComparison';
import type { CollabComment, CollabUser, ProjectVersion } from '../../collab/CollabEngine';

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function frameToTimecode(frame: number, fps = 23.976): string {
  return toTimecode(frame / fps);
}

function getDisplayColorForUser(userName: string): string {
  if (userName === 'Sarah K.') return '#7c5cfc';
  if (userName === 'Marcus T.') return '#2bb672';
  return '#f59e0b';
}

function resolveIdentityProfile(
  identityProfiles: Record<string, CollaboratorIdentityProfile>,
  userId?: string,
  displayName?: string,
): CollaboratorIdentityProfile | null {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) {
    const byId = identityProfiles[`id:${normalizedUserId}`];
    if (byId) {
      return byId;
    }
  }

  const normalizedDisplayName = displayName?.trim().toLowerCase();
  if (normalizedDisplayName) {
    const byName = identityProfiles[`name:${normalizedDisplayName}`];
    if (byName) {
      return byName;
    }
  }

  return null;
}

function getReactionActorNames(
  reaction: CollabComment['reactions'][number],
  identityProfiles: Record<string, CollaboratorIdentityProfile>,
): string[] {
  if (reaction.actorProfiles && reaction.actorProfiles.length > 0) {
    return reaction.actorProfiles.map((profile) => profile.displayName);
  }

  return reaction.userIds.map((userId) => {
    const identity = resolveIdentityProfile(identityProfiles, userId);
    return identity?.displayName || userId;
  });
}

function IdentityAvatar({
  name,
  avatarUrl,
  color,
  size,
  fontSize,
}: {
  name: string;
  avatarUrl?: string;
  color: string;
  size: number;
  fontSize: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        color: '#fff',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
      aria-label={`${name} avatar`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${name} avatar`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : initial}
    </div>
  );
}

const REACTION_EMOJI = ['👍', '❤️', '✨', '🔥', '👀', '🎯'];

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border-default)',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    color: 'var(--text-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    flex: 1,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? 'var(--brand-bright)' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'all 80ms',
    background: 'none',
    border: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  }),
  body: {
    flex: 1,
    overflow: 'auto',
    padding: 8,
  },
};

// ─── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const { onlineUsers } = useCollabStore();
  const { setPlayhead } = useEditorStore();

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 4px 8px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Online ({onlineUsers.length})
      </div>
      {onlineUsers.map((user) => (
        <div
          key={user.id}
          onClick={() => setPlayhead(user.cursorFrame / 23.976)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 8px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            marginBottom: 2,
            transition: 'background 80ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-raised)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Avatar circle */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <IdentityAvatar
              name={user.name}
              avatarUrl={user.avatar}
              color={user.color}
              size={28}
              fontSize={11}
            />
            {/* Online dot */}
            <div
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: user.isOnline ? 'var(--success)' : 'var(--text-muted)',
                border: '2px solid var(--bg-surface)',
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Watching {frameToTimecode(user.cursorFrame)}
              {user.cursorTrackId && ` on ${user.cursorTrackId}`}
            </div>
          </div>

          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: user.isOnline ? 'var(--success)' : 'var(--text-disabled)',
              flexShrink: 0,
            }}
          />
        </div>
      ))}

      {onlineUsers.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No other users online.
        </div>
      )}
    </div>
  );
}

// ─── Comments Tab ───────────────────────────────────────────────────────────

function CommentsTab() {
  const {
    comments,
    commentFilter,
    setCommentFilter,
    selectedCommentId,
    selectComment,
    resolveComment,
    reopenComment,
    replyToComment,
    addComment,
    addReaction,
    currentUserName,
    currentUserAvatar,
    identityProfiles,
  } = useCollabStore();
  const { setPlayhead, playheadTime } = useEditorStore();
  const [newCommentText, setNewCommentText] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [showReplyFor, setShowReplyFor] = useState<string | null>(null);
  const [showAddComment, setShowAddComment] = useState(false);

  const filteredComments = comments.filter((c) => {
    if (commentFilter === 'open') return !c.resolved;
    if (commentFilter === 'resolved') return c.resolved;
    return true;
  });
  const hasActiveContext = commentFilter !== 'all';

  const handleAddComment = useCallback(() => {
    if (!newCommentText.trim()) return;
    const frame = Math.round(playheadTime * 23.976);
    addComment(frame, null, newCommentText.trim());
    setNewCommentText('');
    setShowAddComment(false);
  }, [newCommentText, playheadTime, addComment]);

  const handleReply = useCallback((commentId: string) => {
    const text = replyTexts[commentId]?.trim();
    if (!text) return;
    replyToComment(commentId, text);
    setReplyTexts((prev) => ({ ...prev, [commentId]: '' }));
    setShowReplyFor(null);
  }, [replyTexts, replyToComment]);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['all', 'open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setCommentFilter(f)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: commentFilter === f ? 'var(--bg-elevated)' : 'transparent',
              color: commentFilter === f ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>
      {hasActiveContext && (
        <div
          aria-label="Comments context summary"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '0 0 8px',
          }}
        >
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.03em',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            Filter: {commentFilter}
          </span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.03em',
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-default)',
            }}
          >
            {filteredComments.length}/{comments.length} shown
          </span>
        </div>
      )}

      {/* Add comment button */}
      {!showAddComment && (
        <button
          onClick={() => setShowAddComment(true)}
          style={{
            width: '100%',
            padding: '7px 0',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          + Add Comment at {toTimecode(playheadTime)}
        </button>
      )}

      {/* Add comment form */}
      {showAddComment && (
        <div style={{ padding: 8, background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            Comment at {toTimecode(playheadTime)}
          </div>
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Type your comment..."
            style={{
              width: '100%',
              minHeight: 48,
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowAddComment(false); setNewCommentText(''); }}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddComment}
              disabled={!newCommentText.trim()}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: newCommentText.trim() ? 'var(--brand)' : 'var(--bg-elevated)',
                color: newCommentText.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 600,
                cursor: newCommentText.trim() ? 'pointer' : 'default',
              }}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Comment list */}
      {filteredComments.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          currentUserName={currentUserName}
          currentUserAvatar={currentUserAvatar}
          identityProfiles={identityProfiles}
          isSelected={selectedCommentId === comment.id}
          onSelect={() => selectComment(comment.id === selectedCommentId ? null : comment.id)}
          onSeek={() => setPlayhead(comment.frame / 23.976)}
          onResolve={() => comment.resolved ? reopenComment(comment.id) : resolveComment(comment.id)}
          onReaction={(emoji) => addReaction(comment.id, emoji)}
          showReply={showReplyFor === comment.id}
          onToggleReply={() => setShowReplyFor(showReplyFor === comment.id ? null : comment.id)}
          replyText={replyTexts[comment.id] ?? ''}
          onReplyTextChange={(text) => setReplyTexts((prev) => ({ ...prev, [comment.id]: text }))}
          onSubmitReply={() => handleReply(comment.id)}
        />
      ))}

      {filteredComments.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No {commentFilter !== 'all' ? commentFilter : ''} comments.
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  currentUserName,
  currentUserAvatar,
  identityProfiles,
  isSelected,
  onSelect,
  onSeek,
  onResolve,
  onReaction,
  showReply,
  onToggleReply,
  replyText,
  onReplyTextChange,
  onSubmitReply,
}: {
  comment: CollabComment;
  currentUserName: string;
  currentUserAvatar?: string;
  identityProfiles: Record<string, CollaboratorIdentityProfile>;
  isSelected: boolean;
  onSelect: () => void;
  onSeek: () => void;
  onResolve: () => void;
  onReaction: (emoji: string) => void;
  showReply: boolean;
  onToggleReply: () => void;
  replyText: string;
  onReplyTextChange: (text: string) => void;
  onSubmitReply: () => void;
}) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const commentIdentity = resolveIdentityProfile(identityProfiles, comment.userId, comment.userName);
  const userColor = commentIdentity?.color || getDisplayColorForUser(comment.userName);
  const commentAvatar = commentIdentity?.avatarUrl
    ?? (comment.userName === currentUserName ? currentUserAvatar : undefined);

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-raised)',
        marginBottom: 4,
        border: `1px solid ${isSelected ? 'var(--border-strong)' : 'transparent'}`,
        transition: 'all 80ms',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <IdentityAvatar
          name={comment.userName}
          avatarUrl={commentAvatar}
          color={userColor}
          size={20}
          fontSize={9}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          {comment.userName}
        </span>
        <span
          onClick={onSeek}
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--brand-bright)',
            cursor: 'pointer',
          }}
          title="Seek to this timecode"
        >
          {frameToTimecode(comment.frame)}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>
          {timeAgo(comment.timestamp)}
        </span>
        {comment.resolved && (
          <span
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(34,197,94,0.15)',
              color: 'var(--success)',
              fontWeight: 600,
            }}
          >
            Resolved
          </span>
        )}
      </div>

      {/* Comment text */}
      <div
        onClick={onSelect}
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          cursor: 'pointer',
          marginBottom: 6,
        }}
      >
        {comment.text}
      </div>

      {/* Reactions */}
      {comment.reactions.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {comment.reactions.map((reaction) => {
            const reactionActorNames = getReactionActorNames(reaction, identityProfiles);
            const reactionTitle = reactionActorNames.length > 0
              ? `${reactionActorNames.join(', ')} reacted with ${reaction.emoji}`
              : `React with ${reaction.emoji}`;
            return (
            <button
              key={reaction.emoji}
              onClick={() => onReaction(reaction.emoji)}
              title={reactionTitle}
              aria-label={reactionTitle}
              style={{
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-void)',
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span>{reaction.emoji}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{reaction.userIds.length}</span>
            </button>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={onResolve}
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          {comment.resolved ? 'Reopen' : 'Resolve'}
        </button>
        <button
          onClick={onToggleReply}
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Reply
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          {showReactionPicker && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                display: 'flex',
                gap: 2,
                padding: 4,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 10,
                marginBottom: 4,
              }}
            >
              {REACTION_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(emoji); setShowReactionPicker(false); }}
                  style={{
                    padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Replies thread */}
      {comment.replies.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 16, borderLeft: '2px solid var(--border-default)' }}>
          {comment.replies.map((reply) => {
            const replyIdentity = resolveIdentityProfile(identityProfiles, reply.userId, reply.userName);
            const replyColor = replyIdentity?.color || getDisplayColorForUser(reply.userName);
            const replyAvatar = replyIdentity?.avatarUrl
              ?? (reply.userName === currentUserName ? currentUserAvatar : undefined);
            return (
              <div key={reply.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <IdentityAvatar
                    name={reply.userName}
                    avatarUrl={replyAvatar}
                    color={replyColor}
                    size={14}
                    fontSize={7}
                  />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{reply.userName}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{timeAgo(reply.timestamp)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {reply.text}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply input */}
      {showReply && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={replyText}
            onChange={(e) => onReplyTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmitReply(); }}
            placeholder="Write a reply..."
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              outline: 'none',
            }}
          />
          <button
            onClick={onSubmitReply}
            disabled={!replyText.trim()}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: replyText.trim() ? 'var(--brand)' : 'var(--bg-elevated)',
              color: replyText.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: replyText.trim() ? 'pointer' : 'default',
            }}
          >
            Post
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Versions Tab ───────────────────────────────────────────────────────────

function VersionsTab() {
  const {
    versions,
    saveVersion,
    restoreVersion,
    versionRetentionPreferences,
    setVersionRetentionPreferences,
    currentUserName,
    currentUserAvatar,
  } = useCollabStore();
  const {
    versionHistoryRetentionPreference,
    versionHistoryCompareMode,
    setVersionHistoryRetentionPreference,
    setVersionHistoryCompareMode,
  } = useEditorStore();
  const [showForm, setShowForm] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [versionDesc, setVersionDesc] = useState('');
  const [compareTargetVersionId, setCompareTargetVersionId] = useState<string>('');
  const [compareMode, setCompareMode] = useState<VersionCompareMode>('previous');
  const [customBaselineId, setCustomBaselineId] = useState<string>('');

  const handleSave = useCallback(() => {
    if (!versionName.trim()) return;
    saveVersion(
      versionName.trim(),
      versionDesc.trim(),
      undefined,
      { retentionPolicy: versionHistoryRetentionPreference },
    );
    setVersionName('');
    setVersionDesc('');
    setShowForm(false);
  }, [saveVersion, versionDesc, versionHistoryRetentionPreference, versionName]);

  const compareTargetVersion = versions.find((version) => version.id === compareTargetVersionId) ?? versions[0] ?? null;
  const compareBaseline = useMemo(() => {
    if (!compareTargetVersion) return null;
    return pickComparisonBaseline(versions, compareTargetVersion.id, compareMode, customBaselineId);
  }, [compareMode, compareTargetVersion, customBaselineId, versions]);

  const comparison = useMemo(() => {
    if (!compareTargetVersion || !compareBaseline) return null;
    return buildVersionComparison(compareTargetVersion, compareBaseline);
  }, [compareBaseline, compareTargetVersion]);

  return (
    <div>
      <div style={{ padding: 10, background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Version Retention
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Keep
            <select
              value={versionRetentionPreferences.preset}
              onChange={(event) => setVersionRetentionPreferences({ preset: event.target.value as typeof versionRetentionPreferences.preset })}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-void)',
                color: 'var(--text-primary)',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              <option value="keep-all">All restore points</option>
              <option value="last-50">Last 50 restore points</option>
              <option value="last-25">Last 25 restore points</option>
              <option value="last-10">Last 10 restore points</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={versionRetentionPreferences.autoPrune}
              onChange={(event) => setVersionRetentionPreferences({ autoPrune: event.target.checked })}
            />
            Auto-prune when limit is exceeded
          </label>
        </div>
      </div>

      {/* Save version form or button */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            width: '100%',
            padding: '8px 0',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          + Save Current Version
        </button>
      ) : (
        <div style={{ padding: 10, background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <input
            type="text"
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder="Version name..."
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              outline: 'none',
              marginBottom: 6,
              boxSizing: 'border-box',
            }}
          />
          <textarea
            value={versionDesc}
            onChange={(e) => setVersionDesc(e.target.value)}
            placeholder="Description (optional)..."
            style={{
              width: '100%',
              minHeight: 36,
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              resize: 'vertical',
              outline: 'none',
              marginBottom: 6,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            Retention: {versionHistoryRetentionPreference === 'manual' ? 'Manual retain' : 'Session retention'}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowForm(false); setVersionName(''); setVersionDesc(''); }}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!versionName.trim()}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: versionName.trim() ? 'var(--brand)' : 'var(--bg-elevated)',
                color: versionName.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 600,
                cursor: versionName.trim() ? 'pointer' : 'default',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 6,
          padding: 8,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-raised)',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Retention
          </span>
          {(['manual', 'session'] as const).map((preference) => (
            <button
              key={preference}
              onClick={() => setVersionHistoryRetentionPreference(preference)}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: versionHistoryRetentionPreference === preference ? 'var(--bg-elevated)' : 'transparent',
                color: versionHistoryRetentionPreference === preference ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {preference === 'manual' ? 'Manual retain' : 'Session retention'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Compare
          </span>
          {(['summary', 'details'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setVersionHistoryCompareMode(mode)}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: versionHistoryCompareMode === mode ? 'var(--bg-elevated)' : 'transparent',
                color: versionHistoryCompareMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {mode === 'summary' ? 'Summary view' : 'Detailed compare'}
            </button>
          ))}
        </div>
      </div>

      {/* Version list */}
      {versions.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          compareMode={versionHistoryCompareMode}
          currentUserName={currentUserName}
          currentUserAvatar={currentUserAvatar}
          canRestore={canRestoreVersion(version)}
          onRestore={() => restoreVersion(version.id)}
          onCompare={() => setCompareTargetVersionId(version.id)}
          selectedForCompare={compareTargetVersion?.id === version.id}
        />
      ))}

      {versions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No saved versions yet.
        </div>
      )}

      {versions.length > 1 && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Compare Restore Points
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              Target version
              <select
                value={compareTargetVersion?.id ?? ''}
                onChange={(event) => setCompareTargetVersionId(event.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-void)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  fontFamily: 'var(--font-ui)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              Baseline
              <select
                value={compareMode}
                onChange={(event) => setCompareMode(event.target.value as VersionCompareMode)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-void)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  fontFamily: 'var(--font-ui)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="previous">Previous restore point</option>
                <option value="latest">Latest saved restore point</option>
                <option value="custom">Custom restore point…</option>
              </select>
            </label>

            {compareMode === 'custom' && (
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                Compare against
                <select
                  value={customBaselineId}
                  onChange={(event) => setCustomBaselineId(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-void)',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    fontFamily: 'var(--font-ui)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select baseline</option>
                  {versions
                    .filter((version) => version.id !== compareTargetVersion?.id)
                    .map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          {comparison ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                <strong>{comparison.target.name}</strong> vs <strong>{comparison.baseline.name}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Tracks</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{formatSignedDelta(comparison.trackDelta, '')}</div>
                </div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Clips</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{formatSignedDelta(comparison.clipDelta, '')}</div>
                </div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Duration</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{formatSignedDelta(comparison.durationDelta, 's')}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Saved {comparison.createdAtDeltaMs >= 0 ? 'after' : 'before'} baseline by {Math.abs(Math.round(comparison.createdAtDeltaMs / 60000))}m
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                Changed snapshot fields: {comparison.changedSnapshotKeys.length ? comparison.changedSnapshotKeys.join(', ') : 'none'}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Select a valid baseline to compare this restore point.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function canRestoreVersion(version: ProjectVersion): boolean {
  const snapshot = version.snapshotData as {
    id?: unknown;
    tracks?: unknown;
    bins?: unknown;
    editorialState?: unknown;
    workstationState?: unknown;
  } | null;

  return Boolean(
    snapshot
      && typeof snapshot.id === 'string'
      && Array.isArray(snapshot.tracks)
      && Array.isArray(snapshot.bins)
      && snapshot.editorialState
      && snapshot.workstationState,
  );
}

function formatVersionDuration(duration: number): string {
  const totalFrames = Math.max(0, Math.round(duration * 24));
  const hours = Math.floor(totalFrames / (24 * 3600));
  const minutes = Math.floor((totalFrames % (24 * 3600)) / (24 * 60));
  const seconds = Math.floor((totalFrames % (24 * 60)) / 24);
  const frames = totalFrames % 24;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function getActivityCategory(action: string): 'comments' | 'versions' | 'other' {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction.includes('comment')) {
    return 'comments';
  }
  if (normalizedAction.includes('version')) {
    return 'versions';
  }
  return 'other';
}

function VersionCard({
  version,
  compareMode,
  currentUserName,
  currentUserAvatar,
  onRestore,
  canRestore,
  onCompare,
  selectedForCompare,
}: {
  version: ProjectVersion;
  compareMode: 'summary' | 'details';
  currentUserName: string;
  currentUserAvatar?: string;
  onRestore: () => void;
  canRestore: boolean;
  onCompare: () => void;
  selectedForCompare: boolean;
}) {
  const authorName = version.createdByProfile?.displayName || version.createdBy;
  const versionAuthorAvatar = version.createdByProfile?.avatarUrl
    ?? (authorName === currentUserName ? currentUserAvatar : undefined);
  const versionAuthorColor = version.createdByProfile?.color || getDisplayColorForUser(authorName);
  return (
    <div
      style={{
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-raised)',
        marginBottom: 4,
        border: selectedForCompare ? '1px solid var(--brand-bright)' : '1px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {version.name}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>
          {timeAgo(version.createdAt)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <IdentityAvatar
          name={authorName}
          avatarUrl={versionAuthorAvatar}
          color={versionAuthorColor}
          size={14}
          fontSize={8}
        />
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          by {authorName}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <span
          style={{
            padding: '2px 5px',
            borderRadius: 999,
            background: version.kind === 'restore-point' ? 'var(--accent-muted)' : 'var(--bg-elevated)',
            color: version.kind === 'restore-point' ? 'var(--brand-bright)' : 'var(--text-muted)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}
        >
          {version.kind === 'restore-point' ? 'Restore point' : 'Legacy demo'}
        </span>
        <span
          style={{
            padding: '2px 5px',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}
        >
          {version.retentionPolicy === 'manual'
            ? 'Retained manually'
            : version.retentionPolicy === 'session'
              ? 'Session retention'
              : 'Fixture'}
        </span>
      </div>
      {version.description && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}>
          {version.description}
        </div>
      )}
      {version.snapshotSummary && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6 }}>
          Tracks {version.snapshotSummary.trackCount} · Clips {version.snapshotSummary.clipCount} · Bins {version.snapshotSummary.binCount} · {formatVersionDuration(version.snapshotSummary.duration)}
        </div>
      )}
      {version.compareSummary && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6 }}>
          vs previous {formatSignedDelta(version.compareSummary.trackDelta, ' tracks')} · {formatSignedDelta(version.compareSummary.clipDelta, ' clips')} · {formatSignedDelta(version.compareSummary.binDelta, ' bins')} · {formatSignedDelta(version.compareSummary.durationDelta, 's')}
        </div>
      )}
      {compareMode === 'details' && version.compareMetrics.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            marginBottom: 6,
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
          }}
        >
          <div style={{ marginBottom: 4, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Compared to {version.compareBaselineName ?? 'previous saved state'}
          </div>
          {version.compareMetrics.map((metric) => (
            <div key={`${version.id}-${metric.label}`}>
              {metric.label}: {metric.previousValue} -&gt; {metric.currentValue}
            </div>
          ))}
        </div>
      )}
      {!canRestore && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6 }}>
          This entry is demo history only and cannot restore editor state.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onRestore}
          disabled={!canRestore}
          aria-label={`Restore ${version.name}`}
          title={canRestore ? 'Restore this version snapshot' : 'This version does not include a restorable project snapshot'}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: canRestore ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontSize: 10,
            cursor: canRestore ? 'pointer' : 'default',
            opacity: canRestore ? 1 : 0.6,
          }}
        >
          Restore
        </button>
        <button
          onClick={onCompare}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: selectedForCompare ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Compare
        </button>
      </div>
    </div>
  );
}

// ─── Activity Tab ───────────────────────────────────────────────────────────

function ActivityTab() {
  const {
    activityFeed,
    activityActionFilter,
    activitySearchQuery,
    activityRetentionPreferences,
    setActivityActionFilter,
    setActivitySearchQuery,
    setActivityRetentionPreferences,
    currentUserName,
    currentUserAvatar,
    identityProfiles,
  } = useCollabStore();

  const filteredActivityFeed = useMemo(() => {
    const normalizedQuery = activitySearchQuery.trim().toLowerCase();
    return activityFeed.filter((entry) => {
      const matchesActionFilter = activityActionFilter === 'all'
        || getActivityCategory(entry.action) === activityActionFilter;
      if (!matchesActionFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        entry.user.toLowerCase().includes(normalizedQuery)
        || entry.action.toLowerCase().includes(normalizedQuery)
        || entry.detail.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activityActionFilter, activityFeed, activitySearchQuery]);

  const activeContextLabels = useMemo(() => {
    const labels: string[] = [];
    if (activityActionFilter !== 'all') {
      labels.push(`Filter: ${activityActionFilter}`);
    }
    if (activitySearchQuery.trim().length > 0) {
      labels.push(`Search: ${activitySearchQuery.trim()}`);
    }
    return labels;
  }, [activityActionFilter, activitySearchQuery]);

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 4px 8px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Recent Activity
      </div>
      {activeContextLabels.length > 0 && (
        <div
          aria-label="Activity context summary"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '0 4px 8px',
          }}
        >
          {activeContextLabels.map((label) => (
            <span
              key={label}
              style={{
                padding: '2px 6px',
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.03em',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
              }}
            >
              {label}
            </span>
          ))}
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.03em',
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-default)',
            }}
          >
            {filteredActivityFeed.length}/{activityFeed.length} shown
          </span>
        </div>
      )}
      <div style={{ padding: 8, background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Activity Retention
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Keep
            <select
              aria-label="Activity retention preset"
              value={activityRetentionPreferences.preset}
              onChange={(event) => setActivityRetentionPreferences({ preset: event.target.value as typeof activityRetentionPreferences.preset })}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-void)',
                color: 'var(--text-primary)',
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
              }}
            >
              <option value="keep-all">All activity</option>
              <option value="last-25">Last 25 entries</option>
              <option value="last-50">Last 50 entries</option>
              <option value="last-100">Last 100 entries</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Filter
            <select
              aria-label="Activity action filter"
              value={activityActionFilter}
              onChange={(event) => setActivityActionFilter(event.target.value as typeof activityActionFilter)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-void)',
                color: 'var(--text-primary)',
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
              }}
            >
              <option value="all">All activity</option>
              <option value="comments">Comment actions</option>
              <option value="versions">Version actions</option>
              <option value="other">Other actions</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Search
            <input
              aria-label="Activity search query"
              type="text"
              value={activitySearchQuery}
              onChange={(event) => setActivitySearchQuery(event.target.value)}
              placeholder="Filter by user/action/detail"
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-void)',
                color: 'var(--text-primary)',
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              aria-label="Activity retention auto prune"
              type="checkbox"
              checked={activityRetentionPreferences.autoPrune}
              onChange={(event) => setActivityRetentionPreferences({ autoPrune: event.target.checked })}
            />
            Auto-prune old activity entries
          </label>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Showing {filteredActivityFeed.length} of {activityFeed.length} entries
          </div>
        </div>
      </div>
      {filteredActivityFeed.map((entry) => {
        const entryIdentity = resolveIdentityProfile(identityProfiles, entry.userId, entry.user);
        const userColor = entryIdentity?.color || getDisplayColorForUser(entry.user);
        const userAvatar = entryIdentity?.avatarUrl
          ?? (entry.user === currentUserName ? currentUserAvatar : undefined);
        return (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              gap: 8,
              padding: '6px 4px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ marginTop: 1 }}>
              <IdentityAvatar
                name={entry.user}
                avatarUrl={userAvatar}
                color={userColor}
                size={18}
                fontSize={8}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.user}</span>
                {' '}
                <span style={{ color: 'var(--text-secondary)' }}>{entry.action}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, marginTop: 1 }}>
                {entry.detail}
              </div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }}>
              {timeAgo(entry.timestamp)}
            </span>
          </div>
        );
      })}

      {filteredActivityFeed.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No matching activity.
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function CollabPanel() {
  const { activeTab, setActiveTab, onlineUsers } = useCollabStore();
  const { toggleCollabPanel } = useEditorStore();

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ fontSize: 14 }}>👥</span>
        <span style={S.title}>Collaboration</span>
        <div style={{ display: 'flex' }}>
          {onlineUsers.slice(0, 3).map((u) => (
            <div key={u.id} style={{ marginLeft: -4 }}>
              <IdentityAvatar
                name={u.name}
                avatarUrl={u.avatar}
                color={u.color}
                size={20}
                fontSize={8}
              />
            </div>
          ))}
        </div>
        <button onClick={toggleCollabPanel} style={S.closeBtn}>✕</button>
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {([
          { key: 'users' as const, label: 'Users' },
          { key: 'comments' as const, label: 'Comments' },
          { key: 'versions' as const, label: 'Versions' },
          { key: 'activity' as const, label: 'Activity' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={S.tab(activeTab === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'comments' && <CommentsTab />}
        {activeTab === 'versions' && <VersionsTab />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>
    </div>
  );
}
