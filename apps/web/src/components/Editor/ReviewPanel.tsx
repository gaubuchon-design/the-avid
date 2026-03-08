import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatReviewTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ReviewPanel() {
  const { approvals, reviewComments, playheadTime, addReviewComment, setApprovalStatus } = useEditorStore();
  const [draft, setDraft] = useState('');

  return (
    <div className="review-panel panel">
      <div className="panel-header">
        <span className="panel-title">Review</span>
        <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>
          {reviewComments.filter((comment) => comment.status === 'OPEN').length} open
        </span>
      </div>

      <div className="panel-body">
        <div className="review-section">
          <div className="inspector-section-title">Approvals</div>
          <div className="review-approval-list">
            {approvals.map((approval) => (
              <div key={approval.id} className="review-approval-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="comment-avatar" style={{ background: approval.status === 'APPROVED' ? '#25a865' : approval.status === 'CHANGES_REQUESTED' ? '#ef4444' : '#7c5cfc' }}>
                    {approval.reviewer[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="comment-author">{approval.reviewer}</div>
                    <div className="comment-text" style={{ marginTop: 0 }}>{approval.role}</div>
                  </div>
                  <span className={`badge ${approval.status === 'APPROVED' ? 'badge-success' : approval.status === 'CHANGES_REQUESTED' ? 'badge-error' : 'badge-warning'}`}>
                    {approval.status.toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="comment-text">{approval.notes}</div>
                <div className="review-approval-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => setApprovalStatus(approval.id, 'PENDING', approval.notes)}>Pending</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setApprovalStatus(approval.id, 'APPROVED', 'Approved for next stage.')}>Approve</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setApprovalStatus(approval.id, 'CHANGES_REQUESTED', 'Needs another revision pass.')}>Request changes</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="review-section">
          <div className="inspector-section-title">Timeline Comments</div>
          <div className="review-comment-list">
            {reviewComments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="comment-avatar" style={{ background: comment.color }}>{comment.author[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="comment-author">{comment.author}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="comment-tc">{formatReviewTime(comment.time)}</span>
                      <span className="text-muted" style={{ fontSize: 10 }}>{comment.role}</span>
                    </div>
                  </div>
                  <span className={`badge ${comment.status === 'RESOLVED' ? 'badge-success' : 'badge-warning'}`}>
                    {comment.status.toLowerCase()}
                  </span>
                </div>
                <div className="comment-text">{comment.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="comment-input">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            Add note at {formatReviewTime(playheadTime)}
          </div>
          <input
            className="input input-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add review note, approval context, or change request…"
          />
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (!draft.trim()) {
              return;
            }
            addReviewComment({ body: draft.trim() });
            setDraft('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
