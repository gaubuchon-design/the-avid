import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agentEngine } from '../../ai/AgentEngine';
import { AgentPlanCard } from '../Workspaces/AgentPlanCard';
import { effectsEngine } from '../../engine/EffectsEngine';
import { useEffectsStore } from '../../store/effects.store';
import { useEditorStore } from '../../store/editor.store';
import { TrackerPanel } from '../TrackerPanel/TrackerPanel';
import { TitleTool } from '../TitleTool/TitleTool';
import { vfxJobManager, type VFXJob } from '../../ai/vfx/VFXJobManager';

const VFX_ACCENT = '#00d4aa';
type VFXTab = 'director' | 'compositor' | 'tracking' | 'mograph' | 'particles';

const VFX_SUGGESTIONS = [
  'Remove the boom mic across the selected clip.',
  'Replace the sky with a warmer sunset and match the foreground.',
  'Rotoscope the lead actor and soften the matte edges.',
  'Stabilize this shot and keep the handheld feel.',
];

function formatJobProgress(job: VFXJob): string {
  if (job.status === 'completed') {
    return '100%';
  }
  return `${Math.round(job.progress * 100)}%`;
}

export function VFXWorkspace() {
  const [activeTab, setActiveTab] = useState<VFXTab>('director');
  const [jobs, setJobs] = useState<VFXJob[]>(() => vfxJobManager.getAllJobs());
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([
    {
      id: 'vfx-intro',
      role: 'assistant',
      content: 'Describe the effect you want. The VFX director will turn it into a step-by-step plan using the existing tracking, roto, and AI toolchain.',
    },
  ]);
  const [currentPlan, setCurrentPlan] = useState<Awaited<ReturnType<typeof agentEngine.executeUserIntent>> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedClipId = useEditorStore((state) => state.selectedClipIds[0] ?? null);
  const tracks = useEditorStore((state) => state.tracks);
  const clipEffects = useEffectsStore((state) => selectedClipId ? state.clipEffects[selectedClipId] ?? [] : []);
  const addEffect = useEffectsStore((state) => state.addEffect);
  const removeEffect = useEffectsStore((state) => state.removeEffect);
  const reorderEffects = useEffectsStore((state) => state.reorderEffects);
  const planIdRef = useRef<string | null>(null);

  const selectedClip = useMemo(() => {
    if (!selectedClipId) {
      return null;
    }

    for (const track of tracks) {
      const clip = track.clips.find((candidate) => candidate.id === selectedClipId);
      if (clip) {
        return clip;
      }
    }

    return null;
  }, [selectedClipId, tracks]);

  const compositorDefs = useMemo(() => {
    return effectsEngine.getDefinitions().filter((definition) => {
      return ['Composite', 'Keyer', 'Distort', 'Light', 'Particle', 'Stylize', 'Time', 'Warp', 'Generate'].includes(definition.category);
    });
  }, []);

  const particleDefs = useMemo(() => {
    return effectsEngine.getDefinitions().filter((definition) => {
      return definition.category === 'Particle' || definition.category === 'Generate';
    });
  }, []);

  useEffect(() => {
    return vfxJobManager.subscribeAll((nextJobs) => {
      setJobs([...nextJobs].sort((left, right) => right.createdAt - left.createdAt));
    });
  }, []);

  useEffect(() => {
    return agentEngine.subscribe((plan) => {
      if (!planIdRef.current || plan.id !== planIdRef.current) {
        return;
      }

      setCurrentPlan(plan);
      if (plan.status === 'completed' || plan.status === 'failed') {
        setIsProcessing(false);
      }
      if (plan.status === 'completed') {
        setMessages((current) => current.concat({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `Plan complete. ${plan.steps.filter((step) => step.status === 'completed').length} VFX steps finished.`,
        }));
      }
    });
  }, []);

  const handleSubmit = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isProcessing) {
      return;
    }

    setMessages((current) => current.concat({ id: `user-${Date.now()}`, role: 'user', content: trimmedPrompt }));
    setIsProcessing(true);
    setError(null);

    try {
      const plan = await agentEngine.executeUserIntent(trimmedPrompt);
      planIdRef.current = plan.id;
      setCurrentPlan(plan);
      setMessages((current) => current.concat({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Prepared a VFX plan with ${plan.steps.length} steps. Execute it when you are ready.`,
      }));
      setDraft('');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to prepare a VFX plan.';
      setError(message);
      setIsProcessing(false);
    }
  };

  const moveEffect = (fromIndex: number, toIndex: number) => {
    if (!selectedClipId || toIndex < 0 || toIndex >= clipEffects.length) {
      return;
    }

    const nextOrder = clipEffects.map((effect) => effect.id);
    const [moved] = nextOrder.splice(fromIndex, 1);
    if (!moved) {
      return;
    }

    nextOrder.splice(toIndex, 0, moved);
    reorderEffects(selectedClipId, nextOrder);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%', minHeight: 0 }}>
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.9fr)',
          gap: 18,
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(0, 212, 170, 0.12), rgba(15, 23, 42, 0.92))',
            border: '1px solid rgba(0, 212, 170, 0.2)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
            Prompts 15-19
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1 }}>VFX Workspace</h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 760 }}>
            Node-style compositing, AI VFX direction, tracking, motion graphics, and particle-ready effects are now exposed through a dedicated studio surface.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <MetricCard label="Selected Clip" value={selectedClip?.name ?? 'None'} accent={VFX_ACCENT} />
          <MetricCard label="Stack Nodes" value={String(clipEffects.length)} />
          <MetricCard label="Queued Jobs" value={String(jobs.filter((job) => job.status === 'queued' || job.status === 'running').length)} />
          <MetricCard label="Recent Jobs" value={String(jobs.length)} />
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabButton label="Director" active={activeTab === 'director'} onClick={() => setActiveTab('director')} />
        <TabButton label="Compositor" active={activeTab === 'compositor'} onClick={() => setActiveTab('compositor')} />
        <TabButton label="Tracking" active={activeTab === 'tracking'} onClick={() => setActiveTab('tracking')} />
        <TabButton label="Mograph" active={activeTab === 'mograph'} onClick={() => setActiveTab('mograph')} />
        <TabButton label="Particles" active={activeTab === 'particles'} onClick={() => setActiveTab('particles')} />
      </div>

      {activeTab === 'director' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 0.95fr)', gap: 18, minHeight: 0, flex: 1 }}>
          <section style={workspaceSurfaceStyle}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {VFX_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion);
                    void handleSubmit(suggestion);
                  }}
                  style={chipStyle}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 14, height: '100%' }}>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                {messages.map((message) => (
                  <article
                    key={message.id}
                    style={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: 'min(88%, 720px)',
                      padding: '12px 14px',
                      borderRadius: 16,
                      background: message.role === 'user'
                        ? 'linear-gradient(135deg, rgba(0, 212, 170, 0.14), rgba(45, 212, 191, 0.2))'
                        : 'rgba(15, 23, 42, 0.56)',
                      border: `1px solid ${message.role === 'user' ? 'rgba(0, 212, 170, 0.24)' : 'rgba(148, 163, 184, 0.16)'}`,
                    }}
                  >
                    <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </div>
                  </article>
                ))}
                {error ? (
                  <div style={{ color: '#fecaca', background: 'rgba(127, 29, 29, 0.22)', border: '1px solid rgba(248, 113, 113, 0.22)', borderRadius: 14, padding: '12px 14px' }}>
                    {error}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Describe the shot fix, comp, replacement, or roto task you want to execute."
                  style={{
                    width: '100%',
                    minHeight: 96,
                    resize: 'vertical',
                    borderRadius: 14,
                    padding: '12px 14px',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    background: 'rgba(15, 23, 42, 0.92)',
                    color: 'var(--text-primary)',
                    font: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSubmit(draft)}
                  disabled={isProcessing || !draft.trim()}
                  style={{
                    minWidth: 148,
                    border: 'none',
                    borderRadius: 14,
                    padding: '12px 16px',
                    background: isProcessing || !draft.trim() ? 'rgba(15, 23, 42, 0.8)' : VFX_ACCENT,
                    color: isProcessing || !draft.trim() ? 'var(--text-muted)' : '#05211d',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isProcessing || !draft.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? 'Planning...' : 'Create VFX Plan'}
                </button>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
            <AgentPlanCard
              title="Director Plan"
              plan={currentPlan}
              accentColor={VFX_ACCENT}
              emptyState="Ask for a key, roto, removal, replacement, or stabilization plan."
              onApprove={async (planId) => {
                setIsProcessing(true);
                await agentEngine.approvePlan(planId);
              }}
              onReject={(planId) => {
                agentEngine.cancelPlan(planId);
                setIsProcessing(false);
              }}
            />

            <section style={workspaceSurfaceStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
                Job Queue
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 10, overflowY: 'auto' }}>
                {jobs.length > 0 ? jobs.map((job) => (
                  <article key={job.id} style={jobCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{job.type}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{job.clipId} • {job.frameRange.start}-{job.frameRange.end}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(job.status) }}>{job.status}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={progressTrackStyle}>
                        <div style={{ ...progressFillStyle, width: formatJobProgress(job), background: statusColor(job.status) }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>{formatJobProgress(job)}</span>
                      {job.status === 'queued' || job.status === 'running' ? (
                        <button type="button" onClick={() => vfxJobManager.cancelJob(job.id)} style={miniDangerButtonStyle}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </article>
                )) : (
                  <div style={emptyStateStyle}>No VFX jobs have been submitted yet.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'compositor' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.9fr)', gap: 18, minHeight: 0, flex: 1 }}>
          <section style={workspaceSurfaceStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
              Node Chain
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedClip ? `Selected clip: ${selectedClip.name}` : 'Select a clip in the timeline to build a comp stack.'}
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              {selectedClip && clipEffects.length > 0 ? clipEffects.map((effect, index) => {
                const definition = effectsEngine.getDefinition(effect.definitionId);
                return (
                  <article key={effect.id} style={surfaceCardStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0, 212, 170, 0.14)',
                        color: VFX_ACCENT,
                        fontWeight: 700,
                      }}>
                        {index + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {definition?.name ?? effect.definitionId}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                          {definition?.category ?? 'Unknown'} • {effect.enabled ? 'Enabled' : 'Disabled'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => moveEffect(index, index - 1)} style={miniButtonStyle}>Up</button>
                        <button type="button" onClick={() => moveEffect(index, index + 1)} style={miniButtonStyle}>Down</button>
                        {selectedClipId ? (
                          <button type="button" onClick={() => removeEffect(selectedClipId, effect.id)} style={miniDangerButtonStyle}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div style={emptyStateStyle}>No compositor nodes are active on the selected clip yet.</div>
              )}
            </div>
          </section>

          <section style={workspaceSurfaceStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
              Add VFX Node
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10, overflowY: 'auto' }}>
              {selectedClip ? compositorDefs.map((definition) => (
                <article key={definition.id} style={jobCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{definition.name}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{definition.category}</div>
                    </div>
                    <button type="button" onClick={() => selectedClipId && addEffect(selectedClipId, definition.id)} style={miniPrimaryButtonStyle}>
                      Add
                    </button>
                  </div>
                </article>
              )) : (
                <div style={emptyStateStyle}>Select a clip to add keyers, light effects, particles, or warp nodes.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'tracking' ? (
        <section style={{ ...workspaceSurfaceStyle, minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <TrackerPanel />
        </section>
      ) : null}

      {activeTab === 'mograph' ? (
        <section style={{ ...workspaceSurfaceStyle, minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
              Motion Graphics
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              Reusing the title and template stack as the first dedicated motion-graphics workspace surface.
            </div>
          </div>
          <div style={{ minHeight: 0, height: 'calc(100% - 54px)', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(148, 163, 184, 0.16)' }}>
            <TitleTool embedded />
          </div>
        </section>
      ) : null}

      {activeTab === 'particles' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: 18, minHeight: 0, flex: 1 }}>
          <section style={workspaceSurfaceStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
              Particle Library
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              Apply procedural particle and generator effects to the selected clip.
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {selectedClip ? particleDefs.map((definition) => (
                <article key={definition.id} style={surfaceCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{definition.name}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{definition.category}</div>
                    </div>
                    <button type="button" onClick={() => selectedClipId && addEffect(selectedClipId, definition.id)} style={miniPrimaryButtonStyle}>
                      Apply
                    </button>
                  </div>
                </article>
              )) : (
                <div style={emptyStateStyle}>Select a clip in the timeline before applying particle systems or generators.</div>
              )}
            </div>
          </section>

          <section style={workspaceSurfaceStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: VFX_ACCENT }}>
              Active Particle Stack
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {selectedClip && clipEffects.filter((effect) => {
                const definition = effectsEngine.getDefinition(effect.definitionId);
                return definition?.category === 'Particle' || definition?.category === 'Generate';
              }).length > 0 ? clipEffects.filter((effect) => {
                const definition = effectsEngine.getDefinition(effect.definitionId);
                return definition?.category === 'Particle' || definition?.category === 'Generate';
              }).map((effect) => {
                const definition = effectsEngine.getDefinition(effect.definitionId);
                return (
                  <article key={effect.id} style={jobCardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{definition?.name ?? effect.definitionId}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{definition?.category ?? 'Unknown'}</div>
                  </article>
                );
              }) : (
                <div style={emptyStateStyle}>No particle or generator effects are applied to the current clip.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'failed':
      return '#ef4444';
    case 'running':
    case 'executing':
      return '#f59e0b';
    case 'queued':
    case 'preview':
      return VFX_ACCENT;
    case 'cancelled':
      return '#64748b';
    default:
      return 'var(--text-muted)';
  }
}

function MetricCard({
  label,
  value,
  accent = 'var(--text-primary)',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '14px 16px',
        background: 'rgba(15, 23, 42, 0.72)',
        border: '1px solid rgba(148, 163, 184, 0.16)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: '8px 14px',
        border: `1px solid ${active ? 'rgba(0, 212, 170, 0.28)' : 'rgba(148, 163, 184, 0.16)'}`,
        background: active ? 'rgba(0, 212, 170, 0.1)' : 'rgba(15, 23, 42, 0.44)',
        color: active ? VFX_ACCENT : 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const workspaceSurfaceStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  padding: 18,
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.88)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
};

const surfaceCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: 'rgba(15, 23, 42, 0.54)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
};

const jobCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: 'rgba(15, 23, 42, 0.52)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
};

const chipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(0, 212, 170, 0.2)',
  background: 'rgba(0, 212, 170, 0.08)',
  color: 'var(--text-secondary)',
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
};

const miniPrimaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 10px',
  background: VFX_ACCENT,
  color: '#03211d',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const miniButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  padding: '8px 10px',
  background: 'transparent',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const miniDangerButtonStyle: React.CSSProperties = {
  ...miniButtonStyle,
  color: '#fca5a5',
  border: '1px solid rgba(239, 68, 68, 0.2)',
};

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 8,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'rgba(148, 163, 184, 0.12)',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
};

const emptyStateStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 14,
  textAlign: 'center',
  border: '1px dashed rgba(148, 163, 184, 0.2)',
  color: 'var(--text-muted)',
  background: 'rgba(15, 23, 42, 0.42)',
};
