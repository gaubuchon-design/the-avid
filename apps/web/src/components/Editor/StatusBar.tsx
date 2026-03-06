import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';

export function StatusBar() {
  const { tracks } = useEditorStore();
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  return (
    <div className="status-bar">
      <div className="status-item"><div className="status-dot ready" /><span>NEXIS Connected</span></div>
      <span className="status-sep">|</span>
      <div className="status-item"><span>{tracks.length} tracks</span></div>
      <span className="status-sep">|</span>
      <div className="status-item"><span>{clipCount} clips</span></div>
      <span className="status-sep">|</span>
      <div className="status-item"><span>H.264  1920×1080  23.976fps</span></div>
      <div style={{ flex: 1 }} />
      <div className="status-item"><span>GPU: RTX 4090</span></div>
      <span className="status-sep">|</span>
      <div className="status-item"><span style={{ color: 'var(--success)' }}>● Ready</span></div>
    </div>
  );
}

const AI_JOBS = [
  { type: 'TRANSCRIPTION',   title: 'Auto-Transcribe',    desc: 'Whisper AI — all clips in bin',          cost: 10, icon: '🎙' },
  { type: 'ASSEMBLY',        title: 'First-Pass Assembly', desc: 'Agentic timeline from transcripts',      cost: 50, icon: '🎬' },
  { type: 'HIGHLIGHTS',      title: 'Extract Highlights',  desc: 'Key moments + emotional peaks',          cost: 40, icon: '⭐' },
  { type: 'AUTO_CAPTIONS',   title: 'Auto-Captions',       desc: 'Word-level timed subtitles',             cost: 15, icon: '💬' },
  { type: 'VOICE_ISOLATION', title: 'Voice Isolation',     desc: 'Remove background noise',                cost: 25, icon: '🎤' },
  { type: 'SMART_REFRAME',   title: 'Smart Reframe',       desc: 'AI recompose for 9:16 / 1:1',           cost: 20, icon: '⬡' },
  { type: 'SCRIPT_SYNC',     title: 'Script Sync',         desc: 'Align footage to script',                cost: 30, icon: '📄' },
  { type: 'COMPLIANCE_SCAN', title: 'Compliance Scan',     desc: 'Broadcast loudness + color gamut',       cost: 10, icon: '✅' },
];

export function AIFloatingPanel() {
  const { toggleAIPanel, tokenBalance } = useEditorStore();
  const [running, setRunning] = useState<{ type: string; title: string; progress: number }[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [role, setRole] = useState('Editor');
  const [q, setQ] = useState('');

  const run = (job: typeof AI_JOBS[0]) => {
    if (running.find(j => j.type === job.type)) return;
    setRunning(p => [...p, { type: job.type, title: job.title, progress: 0 }]);
    let prog = 0;
    const iv = setInterval(() => {
      prog += Math.random() * 18 + 4;
      if (prog >= 100) {
        clearInterval(iv);
        setRunning(p => p.filter(j => j.type !== job.type));
        setDone(p => [...p, job.type]);
        setTimeout(() => setDone(p => p.filter(j => j !== job.type)), 4000);
        prog = 100;
      }
      setRunning(p => p.map(j => j.type === job.type ? { ...j, progress: Math.min(prog, 100) } : j));
    }, 250);
  };

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <div className="ai-logo">✦</div>
        <div className="ai-title">Avid AI</div>
        <div className="ai-status"><div className="ai-status-dot" />Ready</div>
        <button onClick={toggleAIPanel} style={{ marginLeft: 8, width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div className="ai-body">
        {running.length > 0 && <>
          <div className="ai-section-title">Running</div>
          {running.map(j => (
            <div key={j.type} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-accent)', borderRadius: 6, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="ai-job-title">{j.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>{Math.round(j.progress)}%</span>
              </div>
              <div className="ai-progress-bar">
                <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent),#b066ff)', borderRadius: 2, width: `${j.progress}%`, transition: 'width 0.25s' }} />
              </div>
            </div>
          ))}
        </>}

        {done.map(type => {
          const job = AI_JOBS.find(j => j.type === type);
          return job ? <div key={type} style={{ background: 'rgba(43,182,114,0.1)', border: '1px solid rgba(43,182,114,0.3)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}><span>✅</span><span style={{ fontSize: 11, color: 'var(--success)' }}>{job.title} complete</span></div> : null;
        })}

        <div className="ai-section-title">PhraseFind™</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="text" placeholder="Search dialogue, scenes…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, padding: '6px 8px', outline: 'none', fontFamily: 'var(--font-ui)' }} />
          <button className="btn btn-primary" style={{ padding: '0 10px', fontSize: 11 }}>🔍</button>
        </div>

        <div>
          <div className="ai-section-title">Role Context</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['Editor','Producer','Reviewer','Sports','Social'].map(r => (
              <button key={r} onClick={() => setRole(r)} style={{ padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, background: role === r ? 'var(--accent)' : 'var(--accent-muted)', color: role === r ? '#fff' : 'var(--text-accent)', fontFamily: 'var(--font-ui)' }}>{r}</button>
            ))}
          </div>
        </div>

        <div className="ai-section-title">AI Tools</div>
        {AI_JOBS.map(job => {
          const isRunning = running.some(j => j.type === job.type);
          const isDone = done.includes(job.type);
          const ok = tokenBalance >= job.cost;
          return (
            <div key={job.type} className="ai-job-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>{job.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="ai-job-title">{job.title}</div>
                  <div className="ai-job-desc">{job.desc}</div>
                  <div className="ai-job-cost"><span>⬡</span><span>{job.cost} tokens</span>{!ok && <span style={{ color: 'var(--error)', marginLeft: 4 }}>⚠</span>}</div>
                </div>
              </div>
              <button className="ai-run-btn" onClick={() => run(job)} disabled={isRunning || !ok} style={{ opacity: isRunning || !ok ? 0.5 : 1 }}>
                {isDone ? '✓ Done' : isRunning ? 'Running…' : '▶ Run'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="ai-token-bar">
        <span className="ai-token-label">Token balance</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ai-token-count">{tokenBalance}</span>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>+ Buy</button>
        </div>
      </div>
    </div>
  );
}
