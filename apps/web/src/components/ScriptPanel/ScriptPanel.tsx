// ─── Script Panel ───────────────────────────────────────────────────────────
// Script editor with scene breakdown sidebar and AI "Script to Cut" feature.
// Allows importing/editing scripts and breaking them down into scenes with
// corresponding timeline timecodes.

import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { useAIStore } from '../../store/ai.store';
import { toTimecode } from '../../lib/timecode';

// ─── Constants ──────────────────────────────────────────────────────────────

const AI_TEAL = 'var(--ai-accent)';
const AI_TEAL_DIM = 'var(--ai-accent-dim)';

// ─── Demo script ────────────────────────────────────────────────────────────

const DEMO_SCRIPT = `INT. OFFICE - DAY

A modern open-plan office. Morning light streams through floor-to-ceiling windows. SARAH (30s) sits at her desk, reviewing documents.

SARAH
We need to talk about the project deadline.

MARCUS (O.S.)
I know. It's tomorrow.

Marcus enters from the hallway, coffee in hand. He pulls up a chair.

SARAH
Can we get it done in time?

MARCUS
If we work together, absolutely. Let's start with the opening.

EXT. ROOFTOP - SUNSET

Sarah and Marcus stand on the building rooftop. The city skyline stretches behind them, bathed in golden light.

SARAH
Look at that sunset. Perfect for the opening sequence.

MARCUS
We should use the wide shot first. Then cut to the close-up for the reaction.

INT. HALLWAY - NIGHT

A dimly lit corridor. Emergency lights cast long shadows. Sarah walks cautiously, checking her phone.

SARAH
That's a wrap on scene one. Moving on to the hallway sequence.

MARCUS (V.O.)
Watch the lighting in this take. The shadows are perfect.`;

// ─── Scene parsing ──────────────────────────────────────────────────────────

interface SceneBreakdown {
  id: string;
  heading: string;
  startLine: number;
  estimatedTimecode: string;
  estimatedSeconds: number;
}

function parseScenes(text: string): SceneBreakdown[] {
  const lines = text.split('\n');
  const scenes: SceneBreakdown[] = [];
  const scenePattern = /^(INT\.|EXT\.|I\/E\.)\s+.+/i;

  // Map to editor clips for timecode estimation
  const clipTimes: Record<string, number> = {
    'INT. OFFICE': 0,
    'EXT. ROOFTOP': 10,
    'INT. HALLWAY': 23,
  };

  lines.forEach((line, idx) => {
    if (scenePattern.test(line.trim())) {
      const heading = line.trim();
      // Try to match to a known clip time
      let seconds = 0;
      for (const [key, time] of Object.entries(clipTimes)) {
        if (heading.toUpperCase().includes(key)) {
          seconds = time;
          break;
        }
      }
      // If no match, estimate based on scene count
      if (seconds === 0 && scenes.length > 0) {
        const lastScene = scenes[scenes.length - 1];
        seconds = lastScene!.estimatedSeconds! + 10;
      }

      scenes.push({
        id: `scene_${scenes.length + 1}`,
        heading,
        startLine: idx + 1,
        estimatedTimecode: toTimecode(seconds),
        estimatedSeconds: seconds,
      });
    }
  });

  return scenes;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ScriptPanel() {
  const [scriptText, setScriptText] = useState(DEMO_SCRIPT);
  const [scenes, setScenes] = useState<SceneBreakdown[]>(() => parseScenes(DEMO_SCRIPT));
  const [isGenerating, setIsGenerating] = useState(false);
  const { setPlayhead } = useEditorStore();
  const { addMessage, setActiveTab: setAITab, deductTokens } = useAIStore();

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setScriptText(text);
    setScenes(parseScenes(text));
  }, []);

  const handleImportScript = useCallback(() => {
    // In production this would open a file picker.
    // For demo, reset to the demo script.
    setScriptText(DEMO_SCRIPT);
    setScenes(parseScenes(DEMO_SCRIPT));
  }, []);

  const handleClear = useCallback(() => {
    setScriptText('');
    setScenes([]);
  }, []);

  const handleScriptToCut = useCallback(async () => {
    if (!scriptText.trim()) return;
    setIsGenerating(true);

    // Simulate AI processing
    await new Promise(r => setTimeout(r, 1200));

    deductTokens(50);
    addMessage(
      'assistant',
      '✦ Script-to-Cut complete! I\'ve analyzed 3 scenes and matched them to your timeline clips. Scene headings have been aligned with INT. OFFICE (0:00), EXT. ROOFTOP (0:10), and INT. HALLWAY (0:23).',
    );
    setAITab('chat');
    setIsGenerating(false);
  }, [scriptText, deductTokens, addMessage, setAITab]);

  const handleSceneClick = useCallback(
    (scene: SceneBreakdown) => {
      setPlayhead(scene.estimatedSeconds);
    },
    [setPlayhead],
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--bg-surface)',
        fontFamily: 'var(--font-ui)',
        color: 'var(--text-primary)',
        fontSize: 12,
      }}
    >
      {/* Main script area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13, marginRight: 'auto' }}>Script</span>
          <button
            onClick={handleImportScript}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-raised)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Import Script
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-raised)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
          <button
            onClick={handleScriptToCut}
            disabled={isGenerating || !scriptText.trim()}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: isGenerating ? 'var(--bg-elevated)' : AI_TEAL,
              color: isGenerating ? 'var(--text-muted)' : '#000',
              fontSize: 11,
              fontWeight: 600,
              cursor: isGenerating ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>✦</span>
            {isGenerating ? 'Generating...' : 'Script to Cut'}
          </button>
        </div>

        {/* Editor area */}
        <textarea
          value={scriptText}
          onChange={handleTextChange}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            padding: '16px 20px',
            background: 'var(--bg-void)',
            color: 'var(--text-primary)',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.7,
            letterSpacing: '0.01em',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Scene breakdown sidebar */}
      <div
        style={{
          width: 160,
          borderLeft: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 10px',
            borderBottom: '1px solid var(--border-default)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
          }}
        >
          SCENES ({scenes.length})
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
          {scenes.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>
              No scenes detected. Write or import a script with scene headings (INT./EXT.).
            </div>
          )}
          {scenes.map((scene, i) => (
            <div
              key={scene.id}
              onClick={() => handleSceneClick(scene)}
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                marginBottom: 2,
                background: 'transparent',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-raised)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 'var(--radius-sm)',
                    background: AI_TEAL_DIM,
                    color: AI_TEAL,
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: AI_TEAL,
                  }}
                >
                  {scene.estimatedTimecode}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {scene.heading}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                Line {scene.startLine}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
