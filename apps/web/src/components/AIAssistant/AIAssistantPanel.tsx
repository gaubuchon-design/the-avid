import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agentEngine } from '../../ai/AgentEngine';
import { AgentPlanCard } from '../Workspaces/AgentPlanCard';
import { Timecode } from '../../lib/timecode';
import { phraseFindTranscriptWorkbench } from '../../lib/transcriptWorkbench';
import { useAIStore } from '../../store/ai.store';
import { useEditorStore } from '../../store/editor.store';

const AI_ACCENT = 'var(--ai, #00d4aa)';

const SUGGESTIONS = [
  'Build a rough cut from the interview selects and normalize dialogue.',
  'Generate captions for the selected sequence and flag low-confidence sections.',
  'Color match the B-camera clips to the hero shot and mark anything that still drifts.',
  'Remove silence from the dialogue track and leave review markers where cuts were made.',
];

function formatCueTime(seconds: number | undefined, fps: number): string {
  if (seconds === undefined) {
    return '--:--:--:--';
  }

  return new Timecode({ fps }).framesToTC(Math.round(seconds * fps));
}

export function AIAssistantPanel() {
  const messages = useAIStore((state) => state.messages);
  const currentPlan = useAIStore((state) => state.currentPlan);
  const isProcessing = useAIStore((state) => state.isProcessing);
  const error = useAIStore((state) => state.error);
  const tokenBalance = useAIStore((state) => state.tokenBalance);
  const tokenUsedSession = useAIStore((state) => state.tokenUsedSession);
  const activeTab = useAIStore((state) => state.activeTab);
  const transcriptSearchQuery = useAIStore((state) => state.transcriptSearchQuery);
  const transcriptResults = useAIStore((state) => state.transcriptResults);
  const addMessage = useAIStore((state) => state.addMessage);
  const setCurrentPlan = useAIStore((state) => state.setCurrentPlan);
  const setProcessing = useAIStore((state) => state.setProcessing);
  const setError = useAIStore((state) => state.setError);
  const deductTokens = useAIStore((state) => state.deductTokens);
  const setActiveTab = useAIStore((state) => state.setActiveTab);
  const setTranscriptSearch = useAIStore((state) => state.setTranscriptSearch);
  const setTranscriptResults = useAIStore((state) => state.setTranscriptResults);
  const clearChat = useAIStore((state) => state.clearChat);

  const transcript = useEditorStore((state) => state.transcript);
  const scriptDocument = useEditorStore((state) => state.scriptDocument);
  const sequenceSettings = useEditorStore((state) => state.sequenceSettings);

  const [draft, setDraft] = useState('');
  const planIdRef = useRef<string | null>(null);
  const fps = sequenceSettings?.fps ?? 24;

  useEffect(() => {
    return agentEngine.subscribe((plan) => {
      if (!planIdRef.current || plan.id !== planIdRef.current) {
        return;
      }

      setCurrentPlan(plan);
      if (plan.status === 'completed' || plan.status === 'failed') {
        setProcessing(false);
      }
      if (plan.status === 'completed') {
        addMessage('assistant', `Plan "${plan.intent}" finished. ${plan.steps.filter((step) => step.status === 'completed').length} steps completed.`);
      }
    });
  }, [addMessage, setCurrentPlan, setProcessing]);

  useEffect(() => {
    const nextResults = phraseFindTranscriptWorkbench(transcriptSearchQuery, transcript, scriptDocument);
    setTranscriptResults(nextResults);
  }, [scriptDocument, setTranscriptResults, transcript, transcriptSearchQuery]);

  const tools = useMemo(() => agentEngine.getTools(), []);
  const sortedTools = useMemo(() => {
    return [...tools].sort((left, right) => left.name.localeCompare(right.name));
  }, [tools]);

  const handleSubmit = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isProcessing) {
      return;
    }

    addMessage('user', trimmedPrompt);
    setProcessing(true);
    setError(null);

    try {
      const plan = await agentEngine.executeUserIntent(trimmedPrompt);
      planIdRef.current = plan.id;
      setCurrentPlan(plan);
      deductTokens(Math.max(1, plan.tokensUsed));
      addMessage('assistant', `Prepared a ${plan.steps.length}-step execution plan. Review it and execute when ready.`);
      setActiveTab('chat');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to prepare an AI plan.';
      setError(message);
      addMessage('assistant', `Planning failed: ${message}`);
      setProcessing(false);
    } finally {
      setDraft('');
    }
  };

  const handleApprovePlan = async (planId: string) => {
    setProcessing(true);
    setError(null);
    try {
      await agentEngine.approvePlan(planId);
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : 'Unable to execute the selected plan.';
      setError(message);
      setProcessing(false);
    }
  };

  const handleRejectPlan = (planId: string) => {
    agentEngine.cancelPlan(planId);
    setProcessing(false);
    addMessage('assistant', 'Plan cancelled. Nothing was executed.');
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 0.9fr)',
        gap: 18,
        height: '100%',
        minHeight: 0,
        color: 'var(--text-primary)',
      }}
    >
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRadius: 18,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(8, 47, 73, 0.14), rgba(15, 23, 42, 0.92))',
          border: '1px solid rgba(0, 212, 170, 0.18)',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 20px 16px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: AI_ACCENT }}>
              Prompt 09
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1 }}>AI Assistant</h2>
            <p style={{ margin: '8px 0 0', maxWidth: 720, fontSize: 13, color: 'var(--text-secondary)' }}>
              Natural-language editing, transcript search, and inspectable execution plans backed by the existing Gemini-ready agent stack.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <MetricCard label="Balance" value={`${tokenBalance} tokens`} accent={AI_ACCENT} />
            <MetricCard label="Session Use" value={`${tokenUsedSession} tokens`} />
            <MetricCard label="Tools" value={String(sortedTools.length)} />
          </div>
        </header>

        <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
          <TabButton label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
          <TabButton label="Transcript" active={activeTab === 'transcript'} onClick={() => setActiveTab('transcript')} />
          <TabButton label="Tools" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
        </div>

        <div style={{ padding: '16px 20px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setDraft(suggestion);
                void handleSubmit(suggestion);
              }}
              style={{
                borderRadius: 999,
                border: '1px solid rgba(0, 212, 170, 0.2)',
                background: 'rgba(2, 132, 199, 0.08)',
                color: 'var(--text-secondary)',
                padding: '8px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '18px 20px 20px' }}>
          {activeTab === 'chat' ? (
            <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 14, height: '100%' }}>
              <div
                style={{
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  paddingRight: 4,
                }}
              >
                {messages.map((message) => (
                  <article
                    key={message.id}
                    style={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: 'min(88%, 720px)',
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: message.role === 'user'
                        ? 'linear-gradient(135deg, rgba(0, 212, 170, 0.16), rgba(34, 197, 94, 0.18))'
                        : 'rgba(15, 23, 42, 0.58)',
                      border: `1px solid ${message.role === 'user' ? 'rgba(0, 212, 170, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: message.role === 'user' ? AI_ACCENT : 'var(--text-muted)' }}>
                        {message.role === 'user' ? 'You' : 'Agent'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </div>
                  </article>
                ))}
                {error ? (
                  <div
                    style={{
                      borderRadius: 14,
                      padding: '12px 14px',
                      color: '#fecaca',
                      background: 'rgba(127, 29, 29, 0.24)',
                      border: '1px solid rgba(248, 113, 113, 0.22)',
                    }}
                  >
                    {error}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'end',
                  padding: 12,
                  borderRadius: 16,
                  background: 'rgba(15, 23, 42, 0.62)',
                  border: '1px solid rgba(148, 163, 184, 0.16)',
                }}
              >
                <div>
                  <label htmlFor="ai-workspace-draft" style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Describe the edit
                  </label>
                  <textarea
                    id="ai-workspace-draft"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask for rough cuts, captions, color matches, silence removal, or sequence operations."
                    style={{
                      width: '100%',
                      minHeight: 92,
                      resize: 'vertical',
                      borderRadius: 14,
                      padding: '12px 14px',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      background: 'rgba(15, 23, 42, 0.92)',
                      color: 'var(--text-primary)',
                      font: 'inherit',
                      lineHeight: 1.5,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void handleSubmit(draft)}
                    disabled={isProcessing || !draft.trim()}
                    style={{
                      minWidth: 148,
                      border: 'none',
                      borderRadius: 14,
                      padding: '12px 16px',
                      background: isProcessing || !draft.trim() ? 'rgba(15, 23, 42, 0.8)' : AI_ACCENT,
                      color: isProcessing || !draft.trim() ? 'var(--text-muted)' : '#022c22',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isProcessing || !draft.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isProcessing ? 'Planning...' : 'Create Plan'}
                  </button>
                  <button
                    type="button"
                    onClick={clearChat}
                    style={{
                      minWidth: 148,
                      borderRadius: 14,
                      padding: '10px 16px',
                      background: 'transparent',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Reset Session
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'transcript' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                <label htmlFor="transcript-search" style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Transcript and script search
                </label>
                <input
                  id="transcript-search"
                  value={transcriptSearchQuery}
                  onChange={(event) => setTranscriptSearch(event.target.value)}
                  placeholder="Search dialogue, translations, or script lines..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(15, 23, 42, 0.92)',
                    color: 'var(--text-primary)',
                    font: 'inherit',
                  }}
                />
              </div>

              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                {transcriptResults.length > 0 ? transcriptResults.map((result) => (
                  <article
                    key={result.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: 'rgba(15, 23, 42, 0.58)',
                      border: '1px solid rgba(148, 163, 184, 0.16)',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: result.kind === 'transcript' ? AI_ACCENT : 'var(--brand)' }}>
                        {result.kind}
                      </span>
                      {result.speaker ? (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{result.speaker}</span>
                      ) : null}
                      {result.startTime !== undefined ? (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {formatCueTime(result.startTime, fps)}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      {result.text}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      Match score: {(result.score * 100).toFixed(0)}%
                    </div>
                  </article>
                )) : (
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 14,
                      textAlign: 'center',
                      background: 'rgba(15, 23, 42, 0.46)',
                      border: '1px dashed rgba(148, 163, 184, 0.2)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Enter a phrase to search across the transcript and linked script document.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'tools' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {sortedTools.map((tool) => (
                <article
                  key={tool.name}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: 'rgba(15, 23, 42, 0.58)',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tool.name}</div>
                    <span style={{ fontSize: 10, color: AI_ACCENT, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Tool
                    </span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {tool.description}
                  </p>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Requires: {((tool.parameters['required'] as string[] | undefined) ?? []).join(', ') || 'none'}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
        <AgentPlanCard
          title="Execution Plan"
          plan={currentPlan}
          accentColor={AI_ACCENT}
          emptyState="Prepare a plan to inspect the exact sequence of agent tool calls before running them."
          onApprove={handleApprovePlan}
          onReject={handleRejectPlan}
        />

        <section
          style={{
            padding: 16,
            borderRadius: 16,
            background: 'rgba(15, 23, 42, 0.84)',
            border: '1px solid rgba(148, 163, 184, 0.16)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: AI_ACCENT }}>
            AI Guidance
          </div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <li>Plans stay inspectable until you execute them, so the assistant behaves like a supervised agent.</li>
            <li>Transcript search uses the same workbench matching logic as script sync and phrase find.</li>
            <li>VFX-specific prompts route through the same agent stack, then fan into dedicated VFX tools in the VFX workspace.</li>
          </ul>
        </section>
      </div>
    </div>
  );
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
        minWidth: 118,
        borderRadius: 14,
        padding: '12px 14px',
        background: 'rgba(15, 23, 42, 0.66)',
        border: '1px solid rgba(148, 163, 184, 0.16)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: accent }}>
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
        border: `1px solid ${active ? 'rgba(0, 212, 170, 0.26)' : 'rgba(148, 163, 184, 0.16)'}`,
        background: active ? 'rgba(0, 212, 170, 0.12)' : 'rgba(15, 23, 42, 0.44)',
        color: active ? AI_ACCENT : 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
