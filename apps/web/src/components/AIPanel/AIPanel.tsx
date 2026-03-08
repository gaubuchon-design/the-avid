import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';

const AI_TOOLS = [
  { id: 'assembly',   icon: '⚡', label: 'Agentic Assembly',  desc: 'First-pass cut from transcript + AI direction',        cost: 50 },
  { id: 'transcribe', icon: '📝', label: 'Transcribe All',    desc: 'Whisper AI across all unwatched media in bins',        cost: 10 },
  { id: 'search',     icon: '🔍', label: 'Phrase Search',     desc: 'Semantic search across transcripts and visual content', cost: 2  },
  { id: 'highlights', icon: '🎯', label: 'Auto Highlights',   desc: 'Detect key moments: action, emotion, beats',            cost: 40 },
  { id: 'captions',   icon: '💬', label: 'Auto Captions',     desc: 'Word-level subtitles with style and timing',           cost: 15 },
  { id: 'compliance', icon: '✅', label: 'Compliance Scan',   desc: 'Broadcast loudness, gamut, accessibility check',       cost: 10 },
] as const;

// ─── Agentic AI Workflows ──────────────────────────────────────────────────
interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  result?: string;
}

interface AIWorkflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  steps: { label: string; description: string }[];
  category: 'editing' | 'audio' | 'color' | 'delivery';
}

const AI_WORKFLOWS: AIWorkflow[] = [
  {
    id: 'wf-rough-cut', name: 'Rough Cut Assembly', icon: '⚡', cost: 75,
    description: 'AI analyzes transcript + bins, selects best takes, assembles a first-pass edit',
    category: 'editing',
    steps: [
      { label: 'Analyzing transcript', description: 'Parsing speech-to-text, identifying narrative structure' },
      { label: 'Scoring takes', description: 'Evaluating audio quality, framing, performance for each take' },
      { label: 'Selecting best clips', description: 'Choosing optimal takes for each scene' },
      { label: 'Assembling timeline', description: 'Placing clips on timeline with J/L cuts and pacing' },
      { label: 'Adding music bed', description: 'Selecting and placing background music' },
    ],
  },
  {
    id: 'wf-audio-mix', name: 'Auto Audio Mix', icon: '🎵', cost: 30,
    description: 'Leveling, noise reduction, EQ, and ducking across all audio tracks',
    category: 'audio',
    steps: [
      { label: 'Analyzing audio levels', description: 'Measuring loudness across all clips' },
      { label: 'Applying noise reduction', description: 'AI noise profile detection and reduction' },
      { label: 'Setting EQ curves', description: 'Dialogue clarity, music warmth, effects presence' },
      { label: 'Auto-ducking music', description: 'Lowering music under dialogue, raising in gaps' },
      { label: 'Normalizing to -23 LUFS', description: 'Broadcast-standard loudness normalization' },
    ],
  },
  {
    id: 'wf-color-match', name: 'Scene Color Match', icon: '🎨', cost: 40,
    description: 'Match color and exposure across all clips in the timeline for continuity',
    category: 'color',
    steps: [
      { label: 'Detecting scene boundaries', description: 'Finding distinct scenes and shot changes' },
      { label: 'Analyzing reference frames', description: 'Building color profiles for each scene' },
      { label: 'Matching white balance', description: 'Neutralizing color casts across takes' },
      { label: 'Applying color grade', description: 'Consistent look across all clips in scene' },
    ],
  },
  {
    id: 'wf-social-export', name: 'Social Media Package', icon: '📱', cost: 45,
    description: 'Auto-generate vertical/square cuts, captions, thumbnails for social platforms',
    category: 'delivery',
    steps: [
      { label: 'Extracting highlights', description: 'Finding 15s, 30s, and 60s best moments' },
      { label: 'Reframing for vertical', description: 'AI-powered subject tracking for 9:16 crop' },
      { label: 'Generating captions', description: 'Word-level animated subtitles' },
      { label: 'Creating thumbnails', description: 'Best frame extraction with text overlay' },
      { label: 'Packaging exports', description: 'Preparing for TikTok, Reels, Shorts, X' },
    ],
  },
  {
    id: 'wf-scene-detect', name: 'Scene Detection', icon: '🔬', cost: 15,
    description: 'AI-powered scene boundary detection and marker placement',
    category: 'editing',
    steps: [
      { label: 'Analyzing visual content', description: 'Frame-by-frame change detection' },
      { label: 'Detecting cuts and transitions', description: 'Identifying hard cuts, dissolves, wipes' },
      { label: 'Placing markers', description: 'Adding color-coded markers at scene boundaries' },
    ],
  },
  {
    id: 'wf-cleanup', name: 'Timeline Cleanup', icon: '🧹', cost: 20,
    description: 'Remove gaps, align cuts, fix audio sync, consolidate tracks',
    category: 'editing',
    steps: [
      { label: 'Finding gaps', description: 'Detecting empty spaces between clips' },
      { label: 'Closing gaps', description: 'Ripple-shifting clips to remove dead space' },
      { label: 'Checking sync', description: 'Verifying audio/video alignment' },
      { label: 'Consolidating tracks', description: 'Moving clips to minimize track count' },
    ],
  },
];

interface RunningWorkflow {
  workflowId: string;
  name: string;
  icon: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'running' | 'done' | 'failed';
  startTime: number;
}

interface RunningJob {
  id: string;
  icon: string;
  label: string;
  cost: number;
  progress: number;
  status: 'running' | 'done' | 'failed';
  result?: string;
}

export function AIPanel() {
  const { toggleAIPanel, tokenBalance, searchFilterType, setSearchFilterType, setPlayhead } = useEditorStore();
  const [tab, setTab] = useState<'tools' | 'workflows' | 'jobs' | 'search'>('tools');
  const [prompt, setPrompt] = useState('');
  const [role, setRole] = useState('editor');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<RunningJob[]>([]);
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [runningWorkflows, setRunningWorkflows] = useState<RunningWorkflow[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<'all' | AIWorkflow['category']>('all');

  const runJob = (tool: typeof AI_TOOLS[number]) => {
    const job: RunningJob = { id: `j${Date.now()}`, icon: tool.icon, label: tool.label, cost: tool.cost, progress: 0, status: 'running' };
    setJobs(prev => [job, ...prev]);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18 + 4;
      if (p >= 100) {
        clearInterval(iv);
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 100, status: 'done', result: `${tool.label} complete` } : j));
      } else {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: p } : j));
      }
    }, 280);
  };

  // ── Run multi-step workflow ──
  const runWorkflow = useCallback((wf: AIWorkflow) => {
    const steps: WorkflowStep[] = wf.steps.map((s, i) => ({
      id: `ws_${Date.now()}_${i}`,
      label: s.label,
      description: s.description,
      status: 'pending' as const,
      progress: 0,
    }));

    const rw: RunningWorkflow = {
      workflowId: wf.id,
      name: wf.name,
      icon: wf.icon,
      steps,
      currentStep: 0,
      status: 'running',
      startTime: Date.now(),
    };

    setRunningWorkflows(prev => [rw, ...prev]);
    setTab('jobs');

    // Simulate step-by-step execution
    let stepIdx = 0;
    const runNextStep = () => {
      if (stepIdx >= steps.length) {
        setRunningWorkflows(prev =>
          prev.map(w => w.startTime === rw.startTime
            ? { ...w, status: 'done' as const, currentStep: steps.length }
            : w
          )
        );
        return;
      }

      // Mark step as running
      setRunningWorkflows(prev =>
        prev.map(w => {
          if (w.startTime !== rw.startTime) return w;
          const updatedSteps = w.steps.map((s, i) =>
            i === stepIdx ? { ...s, status: 'running' as const } : s
          );
          return { ...w, steps: updatedSteps, currentStep: stepIdx };
        })
      );

      // Simulate progress
      let p = 0;
      const currentIdx = stepIdx;
      const iv = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 100) {
          clearInterval(iv);
          setRunningWorkflows(prev =>
            prev.map(w => {
              if (w.startTime !== rw.startTime) return w;
              const updatedSteps = w.steps.map((s, i) =>
                i === currentIdx ? { ...s, status: 'done' as const, progress: 100, result: 'Complete' } : s
              );
              return { ...w, steps: updatedSteps };
            })
          );
          stepIdx++;
          setTimeout(runNextStep, 200);
        } else {
          setRunningWorkflows(prev =>
            prev.map(w => {
              if (w.startTime !== rw.startTime) return w;
              const updatedSteps = w.steps.map((s, i) =>
                i === currentIdx ? { ...s, progress: Math.min(99, p) } : s
              );
              return { ...w, steps: updatedSteps };
            })
          );
        }
      }, 200 + Math.random() * 300);
    };

    runNextStep();
  }, []);

  const filteredWorkflows = workflowFilter === 'all'
    ? AI_WORKFLOWS
    : AI_WORKFLOWS.filter(w => w.category === workflowFilter);

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
        {(['tools', 'workflows', 'jobs', 'search'] as const).map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === t ? 'var(--accent)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', transition: 'all 80ms' }}>
            {t === 'workflows' ? '✦ Flows' : t}
            {t === 'jobs' && runningWorkflows.some(w => w.status === 'running') && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginLeft: 4, animation: 'pulse 1.5s infinite' }} />
            )}
          </div>
        ))}
      </div>

      <div className="ai-body">
        {tab === 'tools' && (
          <>
            {/* Assembly card */}
            <div style={{ background: 'linear-gradient(135deg, var(--accent-muted), rgba(176,102,255,.08))', border: '1px solid var(--border-accent)', borderRadius: 8, padding: 12, marginBottom: 4 }}>
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

        {tab === 'workflows' && (
          <>
            {/* Category filter */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['all', 'editing', 'audio', 'color', 'delivery'] as const).map(cat => (
                <button key={cat}
                  className={`btn btn-ghost${workflowFilter === cat ? ' active' : ''}`}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: 9, textTransform: 'uppercase',
                    background: workflowFilter === cat ? 'var(--accent-muted)' : undefined,
                    color: workflowFilter === cat ? 'var(--accent)' : undefined,
                  }}
                  onClick={() => setWorkflowFilter(cat)}
                >{cat}</button>
              ))}
            </div>

            {filteredWorkflows.map(wf => (
              <div key={wf.id} className="ai-job-card" style={{ border: '1px solid var(--border)', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{wf.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ai-job-title">{wf.name}</div>
                    <div className="ai-job-desc">{wf.description}</div>
                  </div>
                </div>
                {/* Steps preview */}
                <div style={{ marginBottom: 8 }}>
                  {wf.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{step.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="ai-job-cost">✦ {wf.cost} tokens · {wf.steps.length} steps</span>
                  <button className="ai-run-btn" onClick={() => runWorkflow(wf)}
                    style={{ width: 'auto', padding: '4px 14px', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}>
                    Run ⚡
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'jobs' && (
          (jobs.length === 0 && runningWorkflows.length === 0)
            ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>No jobs yet. Run a tool or workflow to see progress here.</div>
            : <>
              {/* Running/completed workflows */}
              {runningWorkflows.map((rw, wi) => (
                <div key={wi} className="ai-job-card" style={{ border: '1px solid var(--border-accent)', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{rw.icon}</span>
                    <span className="ai-job-title" style={{ flex: 1 }}>{rw.name}</span>
                    <span className={`badge ${rw.status === 'done' ? 'badge-success' : rw.status === 'failed' ? 'badge-error' : 'badge-accent'}`}>
                      {rw.status === 'running' ? `Step ${rw.currentStep + 1}/${rw.steps.length}` : rw.status}
                    </span>
                  </div>
                  {/* Step progress */}
                  {rw.steps.map((step, si) => (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0,
                        background: step.status === 'done' ? 'var(--success)' : step.status === 'running' ? 'var(--accent)' : 'var(--bg-void)',
                        color: step.status === 'pending' ? 'var(--text-muted)' : '#fff',
                        border: step.status === 'pending' ? '1px solid var(--border)' : 'none',
                      }}>
                        {step.status === 'done' ? '✓' : step.status === 'running' ? '▶' : si + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: step.status === 'running' ? 'var(--accent)' : step.status === 'done' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: step.status === 'running' ? 600 : 400 }}>
                          {step.label}
                        </div>
                        {step.status === 'running' && (
                          <div className="ai-progress-bar" style={{ marginTop: 3, height: 3 }}>
                            <div className="ai-progress-fill" style={{ width: `${step.progress}%`, backgroundImage: 'linear-gradient(90deg,var(--accent),#b066ff)' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Simple jobs */}
              {jobs.map(job => (
                <div key={job.id} className="ai-job-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{job.icon}</span>
                    <span className="ai-job-title">{job.label}</span>
                    <span className={`badge ${job.status === 'done' ? 'badge-success' : job.status === 'failed' ? 'badge-error' : 'badge-accent'}`} style={{ marginLeft: 'auto' }}>{job.status}</span>
                  </div>
                  {job.status === 'running' && (
                    <div className="ai-progress-bar">
                      <div className="ai-progress-fill" style={{ width: `${job.progress}%`, backgroundImage: 'linear-gradient(90deg,var(--accent),#b066ff)' }} />
                    </div>
                  )}
                  {job.result && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>{job.result}</div>}
                </div>
              ))}
            </>
        )}

        {tab === 'search' && (
          <>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder='Search: "close-up of face", "says thank you"...' style={{ width: '100%', background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '8px 10px', outline: 'none', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['semantic', 'phonetic', 'visual'] as const).map(type => (
                <button key={type}
                  className={`btn btn-ghost${searchFilterType === type ? ' active' : ''}`}
                  style={{ flex: 1, padding: '4px 0', fontSize: 10,
                    background: searchFilterType === type ? 'var(--accent-muted)' : undefined,
                    color: searchFilterType === type ? 'var(--accent)' : undefined,
                    borderColor: searchFilterType === type ? 'var(--accent)' : undefined,
                  }}
                  onClick={() => setSearchFilterType(type)}
                >{type.charAt(0).toUpperCase() + type.slice(1)}</button>
              ))}
            </div>
            {[{ name: 'Scene 01 Take 01', excerpt: '…she said "thank you" and walked away…', time: 12.4 }, { name: 'Scene 02 Take 01', excerpt: '…nodding: "thank you very much for—"…', time: 34.1 }].map((r, i) => (
              <div key={i} className="ai-job-card" style={{ cursor: 'pointer' }}
                onClick={() => { setPlayhead(r.time); toggleAIPanel(); }}
                title="Click to jump to this timecode"
              >
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{r.excerpt}</div>
                <div style={{ fontSize: 10, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>@ {r.time.toFixed(1)}s</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Token purchase dialog */}
      {showBuyDialog && (
        <div style={{
          padding: 12, margin: '0 8px 8px', background: 'var(--bg-raised)',
          border: '1px solid var(--border-accent)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Purchase Tokens</div>
          {[
            { amount: 100, price: '$4.99' },
            { amount: 500, price: '$19.99' },
            { amount: 2000, price: '$59.99' },
          ].map(pkg => (
            <button key={pkg.amount} className="ai-run-btn" style={{ marginBottom: 4, background: 'var(--bg-void)' }}
              onClick={() => { setShowBuyDialog(false); alert(`Purchase ${pkg.amount} tokens for ${pkg.price} — Stripe checkout not connected in demo`); }}>
              ✦ {pkg.amount} tokens — {pkg.price}
            </button>
          ))}
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4, fontSize: 10 }}
            onClick={() => setShowBuyDialog(false)}>Cancel</button>
        </div>
      )}

      {/* Token footer */}
      <div className="ai-token-bar">
        <div className="ai-token-label">Token balance</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-token-count">✦ {tokenBalance}</span>
          <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 10 }}
            onClick={() => setShowBuyDialog(!showBuyDialog)}>Buy</button>
        </div>
      </div>
    </div>
  );
}
