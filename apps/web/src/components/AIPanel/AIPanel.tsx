import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);

  // Track all interval/timeout IDs for cleanup on unmount
  const timerIds = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timerIds.current.forEach(id => clearInterval(id));
      timerIds.current = [];
    };
  }, []);

  const trackTimer = (id: number) => {
    timerIds.current.push(id);
    return id;
  };

  const runJob = (tool: typeof AI_TOOLS[number]) => {
    const job: RunningJob = { id: `j${Date.now()}`, icon: tool.icon, label: tool.label, cost: tool.cost, progress: 0, status: 'running' };
    setJobs(prev => [job, ...prev]);
    let p = 0;
    const iv = trackTimer(window.setInterval(() => {
      p += Math.random() * 18 + 4;
      if (p >= 100) {
        clearInterval(iv);
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 100, status: 'done', result: `${tool.label} complete` } : j));
      } else {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: p } : j));
      }
    }, 280));
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
      const iv = trackTimer(window.setInterval(() => {
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
          trackTimer(window.setTimeout(runNextStep, 200));
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
      }, 200 + Math.random() * 300));
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
        <button className="ai-close-btn" onClick={toggleAIPanel} aria-label="Close AI Panel">✕</button>
      </div>

      {/* Tabs */}
      <div className="ai-tab-bar" role="tablist">
        {(['tools', 'workflows', 'jobs', 'search'] as const).map(t => (
          <button key={t} className="ai-tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'workflows' ? '✦ Flows' : t}
            {t === 'jobs' && runningWorkflows.some(w => w.status === 'running') && (
              <span className="ai-tab-dot" />
            )}
          </button>
        ))}
      </div>

      <div className="ai-body">
        {tab === 'tools' && (
          <>
            {/* Assembly card */}
            <div className="ai-assembly-card">
              <div className="ai-assembly-header">
                <span className="ai-assembly-icon">⚡</span>
                <span className="ai-assembly-label">Agentic Assembly</span>
                <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>New</span>
              </div>
              <textarea className="ai-assembly-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe your film: 'Create a 3-min documentary cut focusing on the emotional arc...'" />
              <div className="ai-assembly-role-row">
                <span className="ai-assembly-role-label">Role:</span>
                <select className="ai-assembly-role-select" value={role} onChange={e => setRole(e.target.value)}>
                  {['Editor (Craft)', 'Producer (Story)', 'Sports (Action)', 'Marketing (Brand)', 'Social (Short-form)'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <button className="ai-run-btn ai-run-btn--primary" onClick={() => runJob(AI_TOOLS[0])}>⚡  Generate Assembly · 50 ✦</button>
            </div>

            {AI_TOOLS.slice(1).map(tool => (
              <div key={tool.id} className="ai-job-card">
                <div className="ai-card-row">
                  <span className="ai-card-icon">{tool.icon}</span>
                  <div className="ai-card-body">
                    <div className="ai-job-title">{tool.label}</div>
                    <div className="ai-job-desc">{tool.desc}</div>
                  </div>
                </div>
                <div className="ai-card-footer">
                  <span className="ai-job-cost">✦ {tool.cost} tokens</span>
                  <button className="ai-run-btn ai-run-btn--inline" onClick={() => runJob(tool)}>Run</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'workflows' && (
          <>
            {/* Category filter */}
            <div className="ai-filter-bar">
              {(['all', 'editing', 'audio', 'color', 'delivery'] as const).map(cat => (
                <button key={cat}
                  className={`btn btn-ghost ai-filter-btn${workflowFilter === cat ? ' active' : ''}`}
                  style={workflowFilter === cat ? { background: 'var(--accent-muted)', color: 'var(--accent)' } : undefined}
                  onClick={() => setWorkflowFilter(cat)}
                >{cat}</button>
              ))}
            </div>

            {filteredWorkflows.map(wf => (
              <div key={wf.id} className="ai-job-card ai-workflow-card">
                <div className="ai-workflow-card-header">
                  <span className="ai-card-icon">{wf.icon}</span>
                  <div className="ai-card-body">
                    <div className="ai-job-title">{wf.name}</div>
                    <div className="ai-job-desc">{wf.description}</div>
                  </div>
                </div>
                {/* Steps preview */}
                <div className="ai-step-list">
                  {wf.steps.map((step, i) => (
                    <div key={i} className="ai-step-row">
                      <span className="ai-step-number">
                        {i + 1}
                      </span>
                      <span className="ai-step-label">{step.label}</span>
                    </div>
                  ))}
                </div>
                <div className="ai-card-footer">
                  <span className="ai-job-cost">✦ {wf.cost} tokens · {wf.steps.length} steps</span>
                  <button className="ai-run-btn ai-run-btn--inline ai-run-btn--primary" onClick={() => runWorkflow(wf)}
                    style={{ padding: '4px 14px' }}>
                    Run ⚡
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'jobs' && (
          (jobs.length === 0 && runningWorkflows.length === 0)
            ? <div className="ai-empty-state">No jobs yet. Run a tool or workflow to see progress here.</div>
            : <>
              {/* Running/completed workflows */}
              {runningWorkflows.map((rw, wi) => (
                <div key={wi} className="ai-job-card ai-workflow-active">
                  <div className="ai-workflow-active-header">
                    <span className="ai-card-icon--md">{rw.icon}</span>
                    <span className="ai-job-title ai-card-body">{rw.name}</span>
                    <span className={`badge ${rw.status === 'done' ? 'badge-success' : rw.status === 'failed' ? 'badge-error' : 'badge-accent'}`}>
                      {rw.status === 'running' ? `Step ${rw.currentStep + 1}/${rw.steps.length}` : rw.status}
                    </span>
                  </div>
                  {/* Step progress */}
                  {rw.steps.map((step, si) => (
                    <div key={step.id} className="ai-wf-step-row">
                      <span className={`ai-wf-step-indicator ai-wf-step-indicator--${step.status === 'failed' ? 'pending' : step.status}`}>
                        {step.status === 'done' ? '✓' : step.status === 'running' ? '▶' : si + 1}
                      </span>
                      <div className="ai-card-body">
                        <div className={`ai-wf-step-text ai-wf-step-text--${step.status === 'failed' ? 'pending' : step.status}`}>
                          {step.label}
                        </div>
                        {step.status === 'running' && (
                          <div className="ai-progress-bar ai-progress-bar--thin">
                            <div className="ai-progress-fill ai-progress-fill--gradient" style={{ width: `${step.progress}%` }} />
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
                  <div className="ai-job-header">
                    <span className="ai-card-icon--sm">{job.icon}</span>
                    <span className="ai-job-title">{job.label}</span>
                    <span className={`badge ${job.status === 'done' ? 'badge-success' : job.status === 'failed' ? 'badge-error' : 'badge-accent'}`} style={{ marginLeft: 'auto' }}>{job.status}</span>
                  </div>
                  {job.status === 'running' && (
                    <div className="ai-progress-bar">
                      <div className="ai-progress-fill ai-progress-fill--gradient" style={{ width: `${job.progress}%` }} />
                    </div>
                  )}
                  {job.result && <div className="ai-job-result">{job.result}</div>}
                </div>
              ))}
            </>
        )}

        {tab === 'search' && (
          <>
            <input className="ai-search-input" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder='Search: "close-up of face", "says thank you"...' />
            <div className="ai-search-filter-bar">
              {(['semantic', 'phonetic', 'visual'] as const).map(type => (
                <button key={type}
                  className={`btn btn-ghost ai-search-filter-btn${searchFilterType === type ? ' active' : ''}`}
                  style={searchFilterType === type ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                  onClick={() => setSearchFilterType(type)}
                >{type.charAt(0).toUpperCase() + type.slice(1)}</button>
              ))}
            </div>
            {[{ name: 'Scene 01 Take 01', excerpt: '…she said "thank you" and walked away…', time: 12.4 }, { name: 'Scene 02 Take 01', excerpt: '…nodding: "thank you very much for—"…', time: 34.1 }].map((r, i) => (
              <div key={i} className="ai-job-card" style={{ cursor: 'pointer' }}
                onClick={() => { setPlayhead(r.time); toggleAIPanel(); }}
                title="Click to jump to this timecode"
              >
                <div className="ai-result-name">{r.name}</div>
                <div className="ai-result-excerpt">{r.excerpt}</div>
                <div className="ai-result-timecode">@ {r.time.toFixed(1)}s</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Token purchase dialog */}
      {showBuyDialog && (
        <div className="ai-buy-dialog">
          <div className="ai-buy-title">Purchase Tokens</div>
          {[
            { amount: 100, price: '$4.99' },
            { amount: 500, price: '$19.99' },
            { amount: 2000, price: '$59.99' },
          ].map(pkg => (
            <button key={pkg.amount} className="ai-run-btn ai-buy-option"
              onClick={() => { setShowBuyDialog(false); console.info(`Purchase ${pkg.amount} tokens for ${pkg.price} — Stripe checkout not connected in demo`); setPurchaseMessage(`Demo mode — Stripe checkout not connected. Would purchase ${pkg.amount} tokens for ${pkg.price}.`); }}>
              ✦ {pkg.amount} tokens — {pkg.price}
            </button>
          ))}
          <button className="btn btn-ghost ai-buy-cancel"
            onClick={() => setShowBuyDialog(false)}>Cancel</button>
        </div>
      )}

      {/* Purchase feedback message */}
      {purchaseMessage && (
        <div className="ai-purchase-msg">
          <span className="ai-purchase-msg-text">{purchaseMessage}</span>
          <button
            className="ai-purchase-msg-close"
            onClick={() => setPurchaseMessage(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Token footer */}
      <div className="ai-token-bar">
        <div className="ai-token-label">Token balance</div>
        <div className="ai-token-footer-right">
          <span className="ai-token-count">✦ {tokenBalance}</span>
          <button className="btn btn-ghost ai-buy-btn"
            onClick={() => setShowBuyDialog(!showBuyDialog)}>Buy</button>
        </div>
      </div>
    </div>
  );
}
