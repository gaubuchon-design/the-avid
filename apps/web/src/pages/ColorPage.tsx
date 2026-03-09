// =============================================================================
//  THE AVID -- Color Page (DaVinci Resolve-Style Layout)
//  Scopes, viewer, gallery, color controls, node graph strip, timeline.
// =============================================================================

import React from 'react';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { ColorPanel } from '../components/ColorPanel/ColorPanel';
import { ScopesPanel } from '../components/ColorPanel/ScopesPanel';
import { NodeGraph } from '../components/ColorPanel/NodeGraph';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { useColorStore } from '../store/color.store';

export function ColorPage() {
  const looks = useColorStore((s) => s.looks);
  const stills = useColorStore((s) => s.stills);
  const saveLook = useColorStore((s) => s.saveLook);
  const loadLook = useColorStore((s) => s.loadLook);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top section: Scopes + Monitor + Gallery */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Scopes panel (left) */}
        <div style={{
          width: 280,
          flexShrink: 0,
          borderRight: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <ScopesPanel />
        </div>

        {/* Record Monitor (center) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <RecordMonitor />
        </div>

        {/* Gallery + Looks (right) */}
        <div style={{
          width: 180,
          flexShrink: 0,
          borderLeft: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Gallery header */}
          <div style={{
            padding: '4px 8px',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Gallery</span>
            <button
              onClick={() => saveLook(`Look ${looks.length + 1}`)}
              aria-label="Save current look"
              style={{
                padding: '1px 6px',
                fontSize: 8,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: 2,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              + Save
            </button>
          </div>

          {/* Stills + Looks list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Stills */}
            <div style={{ padding: '2px 4px' }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', padding: '2px 4px', textTransform: 'uppercase' }}>
                Stills
              </div>
              {stills.length === 0 ? (
                <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 9 }}>
                  Right-click viewer to grab
                </div>
              ) : (
                stills.map((s) => (
                  <div key={s.id} style={{
                    padding: '3px 6px',
                    fontSize: 9,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: 2,
                  }}>
                    {s.name}
                  </div>
                ))
              )}
            </div>

            {/* Looks */}
            <div style={{ padding: '2px 4px', borderTop: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', padding: '2px 4px', textTransform: 'uppercase' }}>
                Looks
              </div>
              {looks.length === 0 ? (
                <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 9 }}>
                  No saved looks
                </div>
              ) : (
                looks.map((l) => (
                  <div
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadLook(l.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadLook(l.id); } }}
                    style={{
                      padding: '3px 6px',
                      fontSize: 9,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      borderRadius: 2,
                    }}
                  >
                    {l.name}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Color Grading Controls */}
      <div style={{
        height: 220,
        flexShrink: 0,
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <ColorPanel />
      </div>

      {/* Node Graph Strip */}
      <div style={{
        height: 64,
        flexShrink: 0,
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
      }}>
        <NodeGraph />
      </div>

      {/* Compact Timeline Strip */}
      <div style={{
        height: 72,
        flexShrink: 0,
        borderTop: '1px solid var(--border-default)',
      }}>
        <TimelinePanel />
      </div>
    </div>
  );
}
