// =============================================================================
//  Alpha Import Dialog
//  Shown when importing media with detected alpha channel. Lets the user
//  choose how to interpret the alpha (straight, premultiplied, ignore, auto).
// =============================================================================

import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { AlphaMode } from '../../store/editor.store';

const ALPHA_OPTIONS: { mode: AlphaMode; label: string; description: string }[] = [
  {
    mode: 'auto',
    label: 'Auto Detect',
    description: 'Automatically determine alpha interpretation based on file format and metadata.',
  },
  {
    mode: 'premultiplied',
    label: 'Premultiplied (Matted)',
    description: 'RGB values are pre-multiplied by alpha. Standard for After Effects, Motion, and most compositing apps.',
  },
  {
    mode: 'straight',
    label: 'Straight (Unmatted)',
    description: 'RGB values are independent of alpha. Common in 3D renders and some image editors.',
  },
  {
    mode: 'ignore',
    label: 'Ignore Alpha',
    description: 'Treat the media as fully opaque, discarding the alpha channel entirely.',
  },
];

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#1e1e2e',
  border: '1px solid #313244',
  borderRadius: 12,
  padding: 24,
  width: 480,
  maxWidth: '90vw',
  color: '#cdd6f4',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 4,
  color: '#cdd6f4',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6c7086',
  marginBottom: 20,
};

const optionStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid ${selected ? '#89b4fa' : '#313244'}`,
  backgroundColor: selected ? 'rgba(137, 180, 250, 0.08)' : 'transparent',
  cursor: 'pointer',
  marginBottom: 8,
  transition: 'all 0.15s ease',
});

const radioStyle = (selected: boolean): React.CSSProperties => ({
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: `2px solid ${selected ? '#89b4fa' : '#585b70'}`,
  backgroundColor: selected ? '#89b4fa' : 'transparent',
  flexShrink: 0,
  marginTop: 2,
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const radioDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: '#1e1e2e',
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#cdd6f4',
};

const descStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6c7086',
  marginTop: 2,
  lineHeight: 1.4,
};

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 16,
  fontSize: 13,
  color: '#a6adc8',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 20,
};

const btnBase: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const btnCancel: React.CSSProperties = {
  ...btnBase,
  backgroundColor: '#313244',
  color: '#cdd6f4',
};

const btnApply: React.CSSProperties = {
  ...btnBase,
  backgroundColor: '#89b4fa',
  color: '#1e1e2e',
};

export const AlphaImportDialog: React.FC = () => {
  const show = useEditorStore((s) => s.showAlphaImportDialog);
  const assetId = useEditorStore((s) => s.alphaDialogAssetId);
  const resolve = useEditorStore((s) => s.resolveAlphaImportDialog);
  const cancel = useEditorStore((s) => s.cancelAlphaImportDialog);

  const [selectedMode, setSelectedMode] = useState<AlphaMode>('auto');
  const [_rememberForType, setRememberForType] = useState(false);

  const handleApply = useCallback(() => {
    resolve(selectedMode);
    setSelectedMode('auto');
  }, [selectedMode, resolve]);

  const handleCancel = useCallback(() => {
    cancel();
    setSelectedMode('auto');
  }, [cancel]);

  if (!show || !assetId) return null;

  return (
    <div style={overlayStyle} onClick={handleCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>Alpha Channel Detected</div>
        <div style={subtitleStyle}>
          This media contains an alpha channel. Choose how to interpret it:
        </div>

        {ALPHA_OPTIONS.map((opt) => (
          <div
            key={opt.mode}
            style={optionStyle(selectedMode === opt.mode)}
            onClick={() => setSelectedMode(opt.mode)}
          >
            <div style={radioStyle(selectedMode === opt.mode)}>
              {selectedMode === opt.mode && <div style={radioDotStyle} />}
            </div>
            <div>
              <div style={labelStyle}>{opt.label}</div>
              <div style={descStyle}>{opt.description}</div>
            </div>
          </div>
        ))}

        <label style={checkboxRow}>
          <input
            type="checkbox"
            onChange={(e) => setRememberForType(e.target.checked)}
          />
          Remember this choice for this file type
        </label>

        <div style={footerStyle}>
          <button style={btnCancel} onClick={handleCancel}>
            Cancel
          </button>
          <button style={btnApply} onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
