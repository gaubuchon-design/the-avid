// =============================================================================
//  THE AVID -- Color Page (DaVinci Resolve-Style Layout)
//  Scopes, viewer, gallery, color controls, node graph strip, timeline.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { ColorPanel } from '../components/ColorPanel/ColorPanel';
import { ScopesPanel } from '../components/ColorPanel/ScopesPanel';
import { NodeGraph } from '../components/ColorPanel/NodeGraph';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { useColorStore } from '../store/color.store';

function ColorPageSkeleton() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-hidden="true" role="status" aria-label="Loading color page">
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)' }} />
        <div style={{ width: 180, flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)', padding: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 24, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 6, width: '90%' }} />
          ))}
        </div>
      </div>
      <div style={{ height: 220, flexShrink: 0, borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
      <div style={{ height: 64, flexShrink: 0, borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
      <div style={{ height: 72, flexShrink: 0, borderTop: '1px solid var(--border-default)' }} />
    </div>
  );
}

export function ColorPage() {
  const looks = useColorStore((s) => s.looks);
  const stills = useColorStore((s) => s.stills);
  const saveLook = useColorStore((s) => s.saveLook);
  const loadLook = useColorStore((s) => s.loadLook);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveLook = useCallback(() => {
    const lookCount = Array.isArray(looks) ? looks.length : 0;
    saveLook(`Look ${lookCount + 1}`);
  }, [looks, saveLook]);

  if (!isReady) {
    return <ColorPageSkeleton />;
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      role="region"
      aria-label="Color Grading Page"
    >
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
        }} role="region" aria-label="Video scopes">
          <ScopesPanel />
        </div>

        {/* Record Monitor (center) */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          role="region"
          aria-label="Color grading monitor"
        >
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
        }} role="region" aria-label="Gallery and saved looks">
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
              onClick={handleSaveLook}
              aria-label="Save current look to gallery"
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
                <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 9 }} role="status">
                  Right-click viewer to grab
                </div>
              ) : (
                <div role="listbox" aria-label="Saved stills">
                  {stills.map((s) => (
                    <div key={s.id} role="option" tabIndex={0} style={{
                      padding: '3px 6px',
                      fontSize: 9,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      borderRadius: 2,
                    }}>
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Looks */}
            <div style={{ padding: '2px 4px', borderTop: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', padding: '2px 4px', textTransform: 'uppercase' }}>
                Looks
              </div>
              {looks.length === 0 ? (
                <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 9 }} role="status">
                  No saved looks
                </div>
              ) : (
                <div role="listbox" aria-label="Saved looks">
                  {looks.map((l) => (
                    <div
                      key={l.id}
                      role="option"
                      tabIndex={0}
                      onClick={() => loadLook(l.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadLook(l.id); } }}
                      aria-label={`Apply look: ${l.name}`}
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
                  ))}
                </div>
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
      }} role="region" aria-label="Color grading controls">
        <ColorPanel />
      </div>

      {/* Node Graph Strip */}
      <div style={{
        height: 64,
        flexShrink: 0,
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
      }} role="region" aria-label="Color node graph">
        <NodeGraph />
      </div>

      {/* Compact Timeline Strip */}
      <div style={{
        height: 72,
        flexShrink: 0,
        borderTop: '1px solid var(--border-default)',
      }} role="region" aria-label="Color page timeline">
        <TimelinePanel />
      </div>
    </div>
  );
}
