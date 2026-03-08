import React, { useEffect, useRef, useState } from 'react';
import { flattenAssets } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';

const AI_TOOLS = [
  { id: 'assembly',   icon: '⚡', label: 'Agentic Assembly',  desc: 'First-pass cut from transcript + AI direction',        cost: 50 },
  { id: 'transcribe', icon: '📝', label: 'Transcribe All',    desc: 'Whisper AI across all unwatched media in bins',        cost: 10 },
  { id: 'search',     icon: '🔍', label: 'Phrase Search',     desc: 'Semantic search across transcripts and visual content', cost: 2  },
  { id: 'highlights', icon: '🎯', label: 'Auto Highlights',   desc: 'Detect key moments: action, emotion, beats',            cost: 40 },
  { id: 'captions',   icon: '💬', label: 'Auto Captions',     desc: 'Word-level subtitles with style and timing',           cost: 15 },
  { id: 'compliance', icon: '✅', label: 'Compliance Scan',   desc: 'Broadcast loudness, gamut, accessibility check',       cost: 10 },
] as const;

export function AIPanel() {
  const { toggleAIPanel, tokenBalance, aiJobs, startAIJob, updateAIJob, bins } = useEditorStore();
  const [tab, setTab] = useState<'tools' | 'jobs' | 'search'>('tools');
  const [prompt, setPrompt] = useState('');
  const [role, setRole] = useState('editor');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const intervalsRef = useRef<Array<ReturnType<typeof window.setInterval>>>([]);

  useEffect(() => {
    return () => {
      intervalsRef.current.forEach((id) => window.clearInterval(id));
    };
  }, []);

  const runJob = (tool: typeof AI_TOOLS[number]) => {
    const jobId = startAIJob(tool);
    if (!jobId) {
      setError('Not enough tokens to run this agent.');
      return;
    }

    setError(null);
    setTab('jobs');
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18 + 4;
      if (p >= 100) {
        clearInterval(iv);
        updateAIJob(jobId, {
          progress: 100,
          status: 'COMPLETED',
          resultSummary: `${tool.label} complete`,
        });
      } else {
        updateAIJob(jobId, { progress: p, status: 'RUNNING' });
      }
    }, 280);
    intervalsRef.current.push(iv);
  };

  const searchResults = flattenAssets(bins).filter((asset) => {
    if (!search.trim()) {
      return false;
    }

    const needle = search.toLowerCase();
    return asset.name.toLowerCase().includes(needle) || asset.tags.some((tag) => tag.toLowerCase().includes(needle));
  }).slice(0, 6);

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-header">
        <div className="ai-logo">✦</div>
        <span className="ai-title">Avid AI</span>
        <div className="ai-status"><div className="ai-status-dot" />Ready</div>
        <button onClick={toggleAIPanel} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['tools', 'jobs', 'search'] as const).map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === t ? 'var(--accent)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', transition: 'all 80ms' }}>{t}</div>
        ))}
      </div>

      <div className="ai-body">
        {tab === 'tools' && (
          <>
            {error && (
              <div className="ai-job-card" style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'var(--error)' }}>
                {error}
              </div>
            )}
            {/* Assembly card */}
            <div style={{ background: 'linear-gradient(135deg,rgba(124,92,252,.12),rgba(176,102,255,.08))', border: '1px solid var(--border-accent)', borderRadius: 8, padding: 12, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Agentic Assembly</span>
                <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>New</span>
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe your film: 'Create a 3-min documentary cut focusing on the emotional arc...'" style={{ width: '100%', minHeight: 72, background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 11, padding: '7px 9px', resize: 'vertical', outline: 'none', lineHeight: 1.5, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Role:</span>
                <select value={role} onChange={e => setRole(e.target.value)} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 11, padding: '3px 6px', flex: 1, outline: 'none' }}>
                  {['Editor (Craft)', 'Producer (Story)', 'Sports (Action)', 'Marketing (Brand)', 'Social (Short-form)'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <button className="ai-run-btn" onClick={() => runJob(AI_TOOLS[0])} style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}>⚡  Generate Assembly · 50 ✦</button>
            </div>

            {AI_TOOLS.slice(1).map(tool => (
              <div key={tool.id} className="ai-job-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{tool.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ai-job-title">{tool.label}</div>
                    <div className="ai-job-desc">{tool.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="ai-job-cost">✦ {tool.cost} tokens</span>
                  <button className="ai-run-btn" onClick={() => runJob(tool)} style={{ width: 'auto', padding: '4px 12px' }}>Run</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'jobs' && (
          aiJobs.length === 0
            ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>No jobs yet.</div>
            : aiJobs.map(job => (
              <div key={job.id} className="ai-job-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>{AI_TOOLS.find(tool => tool.id === job.type)?.icon ?? '✦'}</span>
                  <span className="ai-job-title">{job.label}</span>
                  <span className={`badge ${job.status === 'COMPLETED' ? 'badge-success' : job.status === 'FAILED' ? 'badge-error' : 'badge-accent'}`} style={{ marginLeft: 'auto' }}>{job.status.toLowerCase()}</span>
                </div>
                {job.status === 'RUNNING' && (
                  <div className="ai-progress-bar">
                    <div className="ai-progress-fill" style={{ width: `${job.progress ?? 0}%`, backgroundImage: 'linear-gradient(90deg,var(--accent),#b066ff)' }} />
                  </div>
                )}
                {job.resultSummary && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>{job.resultSummary}</div>}
              </div>
            ))
        )}

        {tab === 'search' && (
          <>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder='Search: "close-up of face", "says thank you"...' style={{ width: '100%', background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '8px 10px', outline: 'none', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {['Semantic', 'Phonetic', 'Visual'].map(type => (
                <button key={type} className="btn btn-ghost" style={{ flex: 1, padding: '4px 0', fontSize: 10 }}>{type}</button>
              ))}
            </div>
            {searchResults.length === 0 ? (
              <div className="ai-job-card" style={{ color: 'var(--text-muted)' }}>
                {search.trim() ? 'No transcript-style matches yet. Try a clip name or tag.' : 'Search project clips, bins, and tags.'}
              </div>
            ) : searchResults.map((asset, index) => (
              <div key={asset.id} className="ai-job-card" style={{ cursor: 'pointer' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{asset.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{asset.tags.join(' · ') || 'untagged asset'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>Result {index + 1}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Token footer */}
      <div className="ai-token-bar">
        <div className="ai-token-label">Token balance</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-token-count">✦ {tokenBalance}</span>
          <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 10 }}>Buy</button>
        </div>
      </div>
    </div>
  );
}
