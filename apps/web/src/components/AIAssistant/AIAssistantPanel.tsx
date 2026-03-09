// ─── AI Assistant Panel ─────────────────────────────────────────────────────
// Three-tab panel: Chat (agentic conversation), Transcript (phrase search),
// and Tools (quick AI actions). Wired to real Gemini API when configured.

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useAIStore } from '../../store/ai.store';
import { useEditorStore } from '../../store/editor.store';
import { agentEngine, type AgentPlan, type AgentStep } from '../../ai/AgentEngine';
import { transcriptEngine } from '../../ai/TranscriptEngine';
import { geminiClient, type GeminiMessage } from '../../ai/GeminiClient';
import { mcpClient } from '../../ai/MCPClient';
import { toTimecode } from '../../lib/timecode';

// ─── Constants ──────────────────────────────────────────────────────────────

const AI_TEAL = 'var(--ai-accent)';
const AI_TEAL_DIM = 'var(--ai-accent-dim)';
const AI_TEAL_BORDER = 'rgba(0, 212, 170, 0.3)';

const AI_TOOL_CARDS = [
  { id: 'assembly', icon: '⚡', name: 'Assembly', desc: 'Generate a rough-cut assembly from bin footage', cost: 50 },
  { id: 'transcription', icon: '📝', name: 'Transcription', desc: 'Transcribe all media with word-level accuracy', cost: 10 },
  { id: 'phrase-find', icon: '🔍', name: 'Phrase Find', desc: 'Semantic search across all transcripts', cost: 2 },
  { id: 'highlights', icon: '🎯', name: 'Highlights', desc: 'Detect key moments: emotion, action, beats', cost: 40 },
  { id: 'captions', icon: '💬', name: 'Captions', desc: 'Generate word-level subtitles with timing', cost: 15 },
  { id: 'compliance', icon: '✅', name: 'Compliance', desc: 'Broadcast loudness, gamut, accessibility', cost: 10 },
  { id: 'color-match', icon: '🎨', name: 'Color Match', desc: 'Auto-match color grades across clips', cost: 20 },
  { id: 'auto-level', icon: '🔊', name: 'Auto Level', desc: 'Normalize audio to broadcast standard', cost: 8 },
  { id: 'remove-silence', icon: '🔇', name: 'Remove Silence', desc: 'Detect and remove silent segments', cost: 12 },
  { id: 'suggest-cuts', icon: '✂️', name: 'Suggest Cuts', desc: 'AI-suggested edit points for your footage', cost: 25 },
];

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
  logo: {
    fontSize: 16,
    color: AI_TEAL,
    fontWeight: 700,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
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
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: active ? AI_TEAL : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? AI_TEAL : 'transparent'}`,
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
  tokenBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
};

// ─── Chat Tab ───────────────────────────────────────────────────────────────

function ChatTab() {
  const {
    messages, currentPlan, isProcessing, streamingText,
    addMessage, setCurrentPlan, setProcessing, deductTokens,
    geminiApiKey, appendStreamingText, clearStreamingText,
  } = useAIStore();
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentPlan, streamingText, scrollToBottom]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isProcessing) return;

    setInputValue('');
    addMessage('user', text);
    setProcessing(true);
    clearStreamingText();

    // If Gemini API is configured, use real streaming chat
    if (geminiClient.isConfigured()) {
      try {
        // Build conversation history as GeminiMessages
        const history: GeminiMessage[] = messages
          .filter((m) => m.id !== 'welcome' && m.id !== 'welcome_cleared')
          .map((m) => ({
            role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
            parts: [{ text: m.content }],
          }));
        history.push({ role: 'user', parts: [{ text }] });

        const response = await geminiClient.streamChat(
          history,
          undefined,
          'You are an AI video editing assistant for The Avid, a professional video editing application. Help users with editing tasks like trimming, splitting, color grading, audio mixing, caption generation, and more. Be concise and professional.',
          'flash',
          (chunk) => {
            appendStreamingText(chunk);
          },
        );

        const finalText = response.text;
        clearStreamingText();
        addMessage('assistant', finalText);

        if (response.usageMetadata) {
          deductTokens(response.usageMetadata.totalTokenCount ?? response.tokensUsed);
        } else {
          deductTokens(response.tokensUsed);
        }
      } catch (err: any) {
        clearStreamingText();
        addMessage('assistant', `Error: ${err.message || 'Failed to get response from Gemini.'}`);
      } finally {
        setProcessing(false);
      }
    } else {
      // Fallback: use agent engine (stub / plan-based)
      try {
        const plan = await agentEngine.executeUserIntent(text);
        setCurrentPlan(plan);
        deductTokens(plan.tokensUsed);
        addMessage('assistant', `I've created an edit plan with ${plan.steps.length} step${plan.steps.length !== 1 ? 's' : ''}. Review the steps below and approve when ready.`);
      } catch {
        addMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
      } finally {
        setProcessing(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprovePlan = async () => {
    if (!currentPlan) return;
    setProcessing(true);
    addMessage('assistant', 'Executing plan...');

    const unsub = agentEngine.subscribe((updated) => {
      setCurrentPlan(updated);
      if (updated.status === 'completed') {
        deductTokens(updated.tokensUsed);
        addMessage('assistant', `Plan completed successfully! All ${updated.steps.filter(s => s.status === 'completed').length} steps executed.`);
        setProcessing(false);
      } else if (updated.status === 'failed') {
        addMessage('assistant', 'Plan execution was cancelled or failed.');
        setProcessing(false);
      }
    });

    await agentEngine.approvePlan(currentPlan.id);
    unsub();
  };

  const handleCancelPlan = () => {
    if (!currentPlan) return;
    agentEngine.cancelPlan(currentPlan.id);
    setCurrentPlan(null);
    addMessage('assistant', 'Plan cancelled.');
  };

  const handleToggleStep = (step: AgentStep) => {
    if (!currentPlan) return;
    if (step.status === 'pending') {
      agentEngine.approveStep(currentPlan.id, step.id);
    } else if (step.status === 'approved') {
      agentEngine.cancelStep(currentPlan.id, step.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Settings toggle */}
      {!geminiClient.isConfigured() && !showSettings && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--warning, #f59e0b)', flex: 1 }}>
            No API key configured. Using offline mode.
          </span>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              background: 'transparent',
              color: 'var(--warning, #f59e0b)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Configure
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Message list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }} role="log" aria-label="Chat messages" aria-live="polite">
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-lg)',
                fontSize: 12,
                lineHeight: 1.5,
                ...(msg.role === 'user'
                  ? {
                      background: 'var(--brand)',
                      color: '#fff',
                      borderBottomRightRadius: 'var(--radius-sm)',
                    }
                  : {
                      background: 'var(--bg-raised)',
                      color: 'var(--text-primary)',
                      borderBottomLeftRadius: 'var(--radius-sm)',
                    }),
              }}
            >
              {msg.role === 'assistant' && (
                <span style={{ color: AI_TEAL, fontWeight: 600, marginRight: 4 }}>✦</span>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <div
              style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-lg)',
                fontSize: 12,
                lineHeight: 1.5,
                background: 'var(--bg-raised)',
                color: 'var(--text-primary)',
                borderBottomLeftRadius: 'var(--radius-sm)',
              }}
            >
              <span style={{ color: AI_TEAL, fontWeight: 600, marginRight: 4 }}>✦</span>
              {streamingText}
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 14,
                  background: AI_TEAL,
                  marginLeft: 2,
                  animation: 'blink 0.8s step-end infinite',
                  verticalAlign: 'text-bottom',
                }}
              />
            </div>
          </div>
        )}

        {/* Plan preview card */}
        {currentPlan && currentPlan.status === 'preview' && (
          <div
            style={{
              margin: '8px 0',
              border: `1px solid ${AI_TEAL_BORDER}`,
              borderRadius: 'var(--radius-md)',
              background: AI_TEAL_DIM,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: AI_TEAL, fontWeight: 700, fontSize: 14 }}>✦</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Edit Plan</span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  color: AI_TEAL,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {currentPlan.tokensUsed} tokens
              </span>
            </div>

            {currentPlan.steps.map((step, i) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 0',
                  borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div
                  onClick={() => handleToggleStep(step)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1.5px solid ${step.status === 'approved' || step.status === 'completed' ? AI_TEAL : step.status === 'cancelled' ? 'var(--error)' : 'var(--text-muted)'}`,
                    background: step.status === 'approved' || step.status === 'completed' ? AI_TEAL : 'transparent',
                    cursor: step.status === 'pending' || step.status === 'approved' ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                    fontSize: 10,
                    color: '#fff',
                  }}
                >
                  {(step.status === 'approved' || step.status === 'completed') && '✓'}
                  {step.status === 'cancelled' && '✕'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: step.status === 'cancelled' ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: step.status === 'cancelled' ? 'line-through' : 'none',
                    }}
                  >
                    {step.description}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {step.toolName}
                  </div>
                </div>
                <StepStatusBadge status={step.status} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleApprovePlan}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: AI_TEAL,
                  color: '#000',
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Approve All
              </button>
              <button
                onClick={handleCancelPlan}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Executing plan card */}
        {currentPlan && currentPlan.status === 'executing' && (
          <div
            style={{
              margin: '8px 0',
              border: `1px solid ${AI_TEAL_BORDER}`,
              borderRadius: 'var(--radius-md)',
              background: AI_TEAL_DIM,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: AI_TEAL, fontWeight: 700, fontSize: 14 }}>✦</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Executing...</span>
            </div>
            {currentPlan.steps.map((step) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <StepStatusBadge status={step.status} />
                <span
                  style={{
                    fontSize: 11,
                    color: step.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                  }}
                >
                  {step.description}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !streamingText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: `2px solid ${AI_TEAL}`,
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }} role="form" aria-label="Chat input">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            aria-label="AI Settings"
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: geminiClient.isConfigured() ? AI_TEAL : 'var(--text-muted)',
              fontSize: 14,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
            }}
          >
            ⚙
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask ✦ AI to edit your timeline..."
            disabled={isProcessing}
            aria-label="Chat message input"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--font-ui)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isProcessing}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: inputValue.trim() && !isProcessing ? AI_TEAL : 'var(--bg-raised)',
              color: inputValue.trim() && !isProcessing ? '#000' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: inputValue.trim() && !isProcessing ? 'pointer' : 'default',
              transition: 'all 100ms',
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Inline keyframes for spinner and blink */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { geminiApiKey, setGeminiApiKey, mcpServerUrl, setMCPServerUrl } = useAIStore();
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [mcpInput, setMcpInput] = useState(mcpServerUrl);
  const [mcpStatus, setMcpStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const handleSaveKey = () => {
    setGeminiApiKey(keyInput);
    geminiClient.setApiKey(keyInput);
  };

  const handleConnectMCP = async () => {
    if (!mcpInput.trim()) return;
    setMCPServerUrl(mcpInput);
    setMcpStatus('connecting');
    try {
      mcpClient.addServer({ url: mcpInput, name: 'user-mcp' });
      await mcpClient.connect('user-mcp');
      setMcpStatus('connected');
    } catch {
      setMcpStatus('error');
    }
  };

  const handleDisconnectMCP = () => {
    mcpClient.disconnect();
    mcpClient.removeServer('user-mcp');
    setMcpStatus('idle');
  };

  return (
    <div
      style={{
        padding: 12,
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-raised)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          AI Settings
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 2 }}
        >
          ✕
        </button>
      </div>

      {/* Gemini API Key */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
          Gemini API Key
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIza..."
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSaveKey}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: AI_TEAL,
              color: '#000',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
        {geminiClient.isConfigured() && (
          <div style={{ fontSize: 10, color: 'var(--success, #22c55e)', marginTop: 4 }}>
            API key configured
          </div>
        )}
      </div>

      {/* MCP Server */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
          MCP Server URL
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={mcpInput}
            onChange={(e) => setMcpInput(e.target.value)}
            placeholder="ws://localhost:3001"
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          {mcpStatus === 'connected' ? (
            <button
              onClick={handleDisconnectMCP}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--error, #ef4444)',
                background: 'transparent',
                color: 'var(--error, #ef4444)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnectMCP}
              disabled={mcpStatus === 'connecting'}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: AI_TEAL,
                color: '#000',
                fontSize: 10,
                fontWeight: 600,
                cursor: mcpStatus === 'connecting' ? 'default' : 'pointer',
                opacity: mcpStatus === 'connecting' ? 0.6 : 1,
              }}
            >
              {mcpStatus === 'connecting' ? '...' : 'Connect'}
            </button>
          )}
        </div>
        {mcpStatus === 'connected' && (
          <div style={{ fontSize: 10, color: 'var(--success, #22c55e)', marginTop: 4 }}>
            Connected to MCP server
          </div>
        )}
        {mcpStatus === 'error' && (
          <div style={{ fontSize: 10, color: 'var(--error, #ef4444)', marginTop: 4 }}>
            Failed to connect. Check URL and ensure server is running.
          </div>
        )}
      </div>
    </div>
  );
}

function StepStatusBadge({ status }: { status: AgentStep['status'] }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', label: 'Pending' },
    approved: { bg: 'var(--ai-accent-dim)', color: AI_TEAL, label: 'Approved' },
    executing: { bg: 'rgba(59,130,246,0.15)', color: 'var(--info)', label: 'Running' },
    completed: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success)', label: 'Done' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: 'var(--error)', label: 'Failed' },
    cancelled: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', label: 'Skipped' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm)',
        background: c.bg,
        color: c.color,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

// ─── Transcript Tab ─────────────────────────────────────────────────────────

function TranscriptTab() {
  const { transcriptSearchQuery, transcriptResults, setTranscriptSearch, setTranscriptResults } = useAIStore();
  const { setPlayhead } = useEditorStore();

  const handleSearch = useCallback(
    (query: string) => {
      setTranscriptSearch(query);
      if (query.trim()) {
        const results = transcriptEngine.phraseFind(query);
        setTranscriptResults(results);
      } else {
        setTranscriptResults([]);
      }
    },
    [setTranscriptSearch, setTranscriptResults],
  );

  const handleResultClick = (result: { startTime: number }) => {
    setPlayhead(result.startTime);
  };

  return (
    <div style={{ padding: 4 }} role="search" aria-label="Transcript search">
      <input
        type="text"
        value={transcriptSearchQuery}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search across all transcripts..."
        aria-label="Search transcripts"
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
          background: 'var(--bg-void)',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontFamily: 'var(--font-ui)',
          outline: 'none',
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />

      {transcriptResults.length === 0 && transcriptSearchQuery.trim() && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No results found for "{transcriptSearchQuery}"
        </div>
      )}

      {transcriptResults.length === 0 && !transcriptSearchQuery.trim() && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          Type a phrase to search across transcribed clips.
          <br />
          <span style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
            Demo clips "INT. OFFICE" and "Dialogue Track" have transcripts.
          </span>
        </div>
      )}

      {transcriptResults.map((result, i) => (
        <div
          key={`${result.clipId}-${result.startTime}-${i}`}
          onClick={() => handleResultClick(result)}
          role="button"
          tabIndex={0}
          aria-label={`${result.clipName}: ${result.text.slice(0, 40)}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResultClick(result); } }}
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-raised)',
            marginBottom: 4,
            cursor: 'pointer',
            transition: 'background 80ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-raised)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              {result.clipName}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: AI_TEAL,
              }}
            >
              {toTimecode(result.startTime)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4 }}>
            {highlightMatch(result.text, transcriptSearchQuery)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {toTimecode(result.startTime)} - {toTimecode(result.endTime)}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 'var(--radius-sm)',
                background: result.score > 0.95 ? 'rgba(34,197,94,0.15)' : result.score > 0.9 ? 'rgba(245,158,11,0.15)' : 'var(--bg-hover)',
                color: result.score > 0.95 ? 'var(--success)' : result.score > 0.9 ? 'var(--warning)' : 'var(--text-tertiary)',
              }}
            >
              {(result.score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: 'var(--ai-accent-dim)', color: AI_TEAL, fontWeight: 600, borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Tools Tab ──────────────────────────────────────────────────────────────

function ToolsTab() {
  const { addMessage, setActiveTab, deductTokens, setProcessing } = useAIStore();
  const [runningTool, setRunningTool] = useState<string | null>(null);

  const handleRun = async (tool: typeof AI_TOOL_CARDS[number]) => {
    setRunningTool(tool.id);
    setProcessing(true);

    // Simulate running the tool
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));

    deductTokens(tool.cost);
    setRunningTool(null);
    setProcessing(false);

    // Switch to chat and show result
    addMessage('assistant', `${tool.name} completed successfully. ${getToolResult(tool.id)}`);
    setActiveTab('chat');
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        padding: 4,
      }}
      role="list"
      aria-label="AI tools"
    >
      {AI_TOOL_CARDS.map((tool) => (
        <div
          key={tool.id}
          role="listitem"
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            transition: 'border-color 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = AI_TEAL_BORDER; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>{tool.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{tool.name}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>
            {tool.desc}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: AI_TEAL, fontFamily: 'var(--font-mono)' }}>
              ✦ {tool.cost}
            </span>
            <button
              onClick={() => handleRun(tool)}
              disabled={runningTool !== null}
              aria-label={`Run ${tool.name}`}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: runningTool === tool.id ? 'var(--bg-elevated)' : AI_TEAL,
                color: runningTool === tool.id ? 'var(--text-muted)' : '#000',
                fontSize: 10,
                fontWeight: 600,
                cursor: runningTool !== null ? 'default' : 'pointer',
              }}
            >
              {runningTool === tool.id ? '...' : 'Run'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function getToolResult(toolId: string): string {
  const results: Record<string, string> = {
    assembly: 'Generated a 2:45 rough cut from 12 source clips. Review the timeline.',
    transcription: 'Transcribed 7 clips with 98.2% average confidence. 1,247 words total.',
    'phrase-find': 'Index updated. Switch to Transcript tab to search.',
    highlights: 'Found 8 highlight moments: 3 emotional beats, 2 action peaks, 3 dialogue highlights.',
    captions: 'Generated 48 caption segments with word-level timing on SUB track.',
    compliance: 'Scan complete: Loudness OK (-23.1 LUFS), Gamut OK, 2 accessibility warnings.',
    'color-match': 'Matched color grades for 5 clips to reference clip "INT. OFFICE - DAY".',
    'auto-level': 'Normalized audio on A1 and A2 to -23 LUFS broadcast standard.',
    'remove-silence': 'Removed 4 silence segments totaling 3.2s from A1.',
    'suggest-cuts': 'Identified 6 optimal cut points on V1. Markers added to timeline.',
  };
  return results[toolId] ?? 'Operation completed.';
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export const AIAssistantPanel = memo(function AIAssistantPanel() {
  const { activeTab, setActiveTab, tokenBalance, tokenUsedSession } = useAIStore();
  const { toggleAIPanel } = useEditorStore();

  const usagePercent = tokenBalance > 0
    ? Math.min(100, (tokenUsedSession / (tokenBalance + tokenUsedSession)) * 100)
    : 100;

  return (
    <div style={S.panel} role="complementary" aria-label="AI Assistant">
      {/* Header */}
      <div style={S.header}>
        <span style={S.logo} aria-hidden="true">✦</span>
        <span style={S.title}>AI Assistant</span>
        <button onClick={toggleAIPanel} style={S.closeBtn} aria-label="Close AI Assistant">✕</button>
      </div>

      {/* Tab bar */}
      <div style={S.tabBar} role="tablist" aria-label="AI Assistant tabs">
        {([
          { key: 'chat' as const, label: '✦ Chat' },
          { key: 'transcript' as const, label: 'Transcript' },
          { key: 'tools' as const, label: 'Tools' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={S.tab(activeTab === t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            aria-controls={`ai-panel-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body} role="tabpanel" id={`ai-panel-${activeTab}`}>
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'transcript' && <TranscriptTab />}
        {activeTab === 'tools' && <ToolsTab />}
      </div>

      {/* Token bar */}
      <div style={S.tokenBar} role="status" aria-label="Token balance">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: AI_TEAL, fontWeight: 700, fontSize: 12 }} aria-hidden="true">✦</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Tokens: {tokenBalance}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {geminiClient.isConfigured() && (
            <span style={{ fontSize: 9, color: 'var(--success, #22c55e)', fontFamily: 'var(--font-mono)' }}>
              API
            </span>
          )}
          <div
            style={{
              width: 80,
              height: 4,
              borderRadius: 2,
              background: 'var(--bg-void)',
              overflow: 'hidden',
            }}
            role="meter"
            aria-valuenow={Math.round(100 - usagePercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Token usage"
          >
            <div
              style={{
                width: `${100 - usagePercent}%`,
                height: '100%',
                borderRadius: 2,
                background: AI_TEAL,
                transition: 'width 300ms',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
