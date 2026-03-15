// =============================================================================
//  THE AVID — Format Settings Panel (Deliver Page Center Panel)
//  Tabbed format configuration: Video, Audio, Captions, File, Processing.
//  Inspired by DaVinci Resolve's Deliver center panel.
// =============================================================================

import React from 'react';
import { RecordMonitor } from '../RecordMonitor/RecordMonitor';
import { useDeliverStore } from '../../store/deliver.store';
import { useEditorStore } from '../../store/editor.store';
import type { SettingsTab, ExportSettings, QualityMode, LoudnessStandard } from '../../types/deliver.types';
import { FILENAME_TOKENS } from '../../types/deliver.types';

// ─── Constants ──────────────────────────────────────────────────────────────

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'captions', label: 'Captions' },
  { key: 'file', label: 'File' },
  { key: 'processing', label: 'Processing' },
];

const CODECS = [
  { value: 'h264', label: 'H.264 / AVC' },
  { value: 'h265', label: 'H.265 / HEVC' },
  { value: 'prores', label: 'Apple ProRes' },
  { value: 'dnxhd', label: 'DNxHD / DNxHR' },
  { value: 'av1', label: 'AV1' },
  { value: 'webm', label: 'VP9 / WebM' },
];

const RESOLUTIONS = [
  { w: 3840, h: 2160, label: '3840 x 2160 (4K UHD)' },
  { w: 1920, h: 1080, label: '1920 x 1080 (FHD)' },
  { w: 1280, h: 720, label: '1280 x 720 (HD)' },
  { w: 1080, h: 1920, label: '1080 x 1920 (9:16 Vertical)' },
  { w: 1080, h: 1080, label: '1080 x 1080 (1:1 Square)' },
  { w: 854, h: 480, label: '854 x 480 (SD)' },
];

const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

const AUDIO_CODECS = [
  { value: 'aac', label: 'AAC' },
  { value: 'pcm_s24le', label: 'PCM 24-bit' },
  { value: 'pcm_s16le', label: 'PCM 16-bit' },
  { value: 'opus', label: 'Opus' },
  { value: 'ac3', label: 'Dolby AC-3' },
  { value: 'eac3', label: 'Dolby E-AC-3' },
  { value: 'none', label: 'No Audio' },
];

const CONTAINERS = ['mp4', 'mov', 'mxf', 'webm', 'mkv', 'avi'];

// ─── Component ──────────────────────────────────────────────────────────────

export function FormatSettingsPanel() {
  const exportSettings = useDeliverStore((s) => s.exportSettings);
  const settingsTab = useDeliverStore((s) => s.settingsTab);
  const selectionMode = useDeliverStore((s) => s.selectionMode);
  const selectedTemplateId = useDeliverStore((s) => s.selectedTemplateId);
  const templates = useDeliverStore((s) => s.templates);

  const updateSettings = useDeliverStore((s) => s.updateExportSettings);
  const setSettingsTab = useDeliverStore((s) => s.setSettingsTab);
  const setSelectionMode = useDeliverStore((s) => s.setSelectionMode);
  const addToQueue = useDeliverStore((s) => s.addToQueue);

  const duration = useEditorStore((s) => s.duration);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleAddToQueue = () => {
    addToQueue({
      name: selectedTemplate?.name ?? `Export_${new Date().toISOString().slice(0, 10)}`,
      templateId: selectedTemplateId,
      presetId: exportSettings.videoCodec,
      priority: 'normal',
      sourceTimelineId: 'main',
      selectionMode,
      totalFrames: Math.ceil(duration * exportSettings.frameRate),
      exportSettings: { ...exportSettings },
    });
  };

  return (
    <div style={panelStyle}>
      {/* Preview monitor */}
      <div style={monitorWrapStyle}>
        <RecordMonitor />
      </div>

      {/* Selection mode */}
      <div style={selectionBarStyle}>
        <span style={selectionLabelStyle}>Render:</span>
        {(['full', 'inout', 'selected'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSelectionMode(mode)}
            style={{
              ...modeBtnStyle,
              background: selectionMode === mode ? 'var(--brand-dim)' : 'transparent',
              color: selectionMode === mode ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {mode === 'full' ? 'Entire Timeline' : mode === 'inout' ? 'In/Out Range' : 'Selected Clips'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {selectedTemplate && (
          <span style={templateBadgeStyle}>
            Template: {selectedTemplate.name}
          </span>
        )}
      </div>

      {/* Settings tabs */}
      <div style={tabBarStyle}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSettingsTab(tab.key)}
            style={{
              ...tabBtnStyle,
              borderBottom: settingsTab === tab.key ? '2px solid var(--brand)' : '2px solid transparent',
              color: settingsTab === tab.key ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={tabContentStyle}>
        {settingsTab === 'video' && <VideoTab settings={exportSettings} onChange={updateSettings} />}
        {settingsTab === 'audio' && <AudioTab settings={exportSettings} onChange={updateSettings} />}
        {settingsTab === 'captions' && <CaptionsTab settings={exportSettings} onChange={updateSettings} />}
        {settingsTab === 'file' && <FileTab settings={exportSettings} onChange={updateSettings} />}
        {settingsTab === 'processing' && <ProcessingTab settings={exportSettings} onChange={updateSettings} />}
      </div>

      {/* Add to Queue */}
      <div style={footerStyle}>
        <div style={summaryStyle}>
          <span>{exportSettings.videoCodec.toUpperCase()}</span>
          <span style={dotStyle}>·</span>
          <span>{exportSettings.resolution.width}x{exportSettings.resolution.height}</span>
          <span style={dotStyle}>·</span>
          <span>{exportSettings.frameRate}fps</span>
          <span style={dotStyle}>·</span>
          <span>{exportSettings.container.toUpperCase()}</span>
        </div>
        <button onClick={handleAddToQueue} style={queueBtnStyle}>
          Add to Render Queue
        </button>
      </div>
    </div>
  );
}

// ─── Tab Components ─────────────────────────────────────────────────────────

type OnChange = (patch: Partial<ExportSettings>) => void;

function VideoTab({ settings, onChange }: { settings: ExportSettings; onChange: OnChange }) {
  return (
    <div style={gridStyle}>
      <Field label="Codec">
        <select value={settings.videoCodec} onChange={(e) => onChange({ videoCodec: e.target.value as any })} style={selectStyle}>
          {CODECS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>

      <Field label="Resolution">
        <select
          value={`${settings.resolution.width}x${settings.resolution.height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            onChange({ resolution: { width: w ?? 1920, height: h ?? 1080 } });
          }}
          style={selectStyle}
        >
          {RESOLUTIONS.map((r) => (
            <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>{r.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Frame Rate">
        <select value={settings.frameRate} onChange={(e) => onChange({ frameRate: parseFloat(e.target.value) })} style={selectStyle}>
          {FRAME_RATES.map((f) => <option key={f} value={f}>{f} fps</option>)}
        </select>
      </Field>

      <Field label="Quality Mode">
        <select value={settings.qualityMode} onChange={(e) => onChange({ qualityMode: e.target.value as QualityMode })} style={selectStyle}>
          <option value="vbr">Variable Bitrate (VBR)</option>
          <option value="cbr">Constant Bitrate (CBR)</option>
          <option value="crf">Constant Rate Factor (CRF)</option>
        </select>
      </Field>

      <Field label="Bitrate">
        <input type="text" value={settings.bitrate} onChange={(e) => onChange({ bitrate: e.target.value })} style={inputStyle} />
      </Field>

      <Field label="Max Bitrate">
        <input type="text" value={settings.maxBitrate ?? ''} onChange={(e) => onChange({ maxBitrate: e.target.value || undefined })} style={inputStyle} placeholder="Optional" />
      </Field>

      <Field label="Profile">
        <select value={settings.profile} onChange={(e) => onChange({ profile: e.target.value })} style={selectStyle}>
          <option value="baseline">Baseline</option>
          <option value="main">Main</option>
          <option value="high">High</option>
          <option value="high10">High 10</option>
          <option value="high422">High 4:2:2</option>
        </select>
      </Field>

      <Field label="Keyframe Interval">
        <input type="number" value={settings.keyframeInterval} onChange={(e) => onChange({ keyframeInterval: parseInt(e.target.value) || 48 })} style={inputStyle} min={1} max={300} />
      </Field>

      <Field label="Encoding Speed">
        <select value={settings.encodingSpeed} onChange={(e) => onChange({ encodingSpeed: e.target.value })} style={selectStyle}>
          {['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function AudioTab({ settings, onChange }: { settings: ExportSettings; onChange: OnChange }) {
  return (
    <div style={gridStyle}>
      <Field label="Audio Codec">
        <select value={settings.audioCodec} onChange={(e) => onChange({ audioCodec: e.target.value })} style={selectStyle}>
          {AUDIO_CODECS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>

      <Field label="Sample Rate">
        <select value={settings.sampleRate} onChange={(e) => onChange({ sampleRate: parseInt(e.target.value) })} style={selectStyle}>
          <option value={44100}>44.1 kHz</option>
          <option value={48000}>48 kHz</option>
          <option value={96000}>96 kHz</option>
        </select>
      </Field>

      <Field label="Bit Depth">
        <select value={settings.bitDepth} onChange={(e) => onChange({ bitDepth: parseInt(e.target.value) })} style={selectStyle}>
          <option value={16}>16-bit</option>
          <option value={24}>24-bit</option>
          <option value={32}>32-bit float</option>
        </select>
      </Field>

      <Field label="Channels">
        <select value={settings.channels} onChange={(e) => onChange({ channels: parseInt(e.target.value) })} style={selectStyle}>
          <option value={1}>Mono (1)</option>
          <option value={2}>Stereo (2)</option>
          <option value={6}>5.1 Surround (6)</option>
          <option value={8}>7.1 Surround (8)</option>
        </select>
      </Field>

      <Field label="Audio Bitrate">
        <input type="text" value={settings.audioBitrate} onChange={(e) => onChange({ audioBitrate: e.target.value })} style={inputStyle} />
      </Field>

      <Field label="Loudness Standard">
        <select value={settings.loudnessStandard} onChange={(e) => onChange({ loudnessStandard: e.target.value as LoudnessStandard })} style={selectStyle}>
          <option value="none">None</option>
          <option value="ebu-r128">EBU R128 (-23 LUFS)</option>
          <option value="atsc-a85">ATSC A/85 (-24 LUFS)</option>
          <option value="arib-tr-b32">ARIB TR-B32</option>
        </select>
      </Field>

      {settings.loudnessStandard !== 'none' && (
        <Field label="Target LUFS">
          <input
            type="number"
            value={settings.targetLUFS ?? -23}
            onChange={(e) => onChange({ targetLUFS: parseFloat(e.target.value) })}
            style={inputStyle}
            min={-60}
            max={0}
            step={0.1}
          />
        </Field>
      )}
    </div>
  );
}

function CaptionsTab({ settings, onChange }: { settings: ExportSettings; onChange: OnChange }) {
  return (
    <div style={gridStyle}>
      <Field label="Caption Format">
        <select value={settings.captionFormat} onChange={(e) => onChange({ captionFormat: e.target.value as any })} style={selectStyle}>
          <option value="none">None</option>
          <option value="srt">SRT (SubRip)</option>
          <option value="vtt">WebVTT</option>
          <option value="scc">SCC (Scenarist)</option>
          <option value="ttml">TTML (Timed Text)</option>
        </select>
      </Field>

      <Field label="Burn-In Captions">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={settings.burnInCaptions}
            onChange={(e) => onChange({ burnInCaptions: e.target.checked })}
          />
          <span>Burn subtitles into video</span>
        </label>
      </Field>

      {settings.burnInCaptions && settings.captionStyle && (
        <>
          <Field label="Font Family">
            <input type="text" value={settings.captionStyle.fontFamily} onChange={(e) => onChange({ captionStyle: { ...settings.captionStyle!, fontFamily: e.target.value } })} style={inputStyle} />
          </Field>
          <Field label="Font Size">
            <input type="number" value={settings.captionStyle.fontSize} onChange={(e) => onChange({ captionStyle: { ...settings.captionStyle!, fontSize: parseInt(e.target.value) } })} style={inputStyle} min={8} max={72} />
          </Field>
          <Field label="Position">
            <select value={settings.captionStyle.position} onChange={(e) => onChange({ captionStyle: { ...settings.captionStyle!, position: e.target.value as any } })} style={selectStyle}>
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
              <option value="center">Center</option>
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

function FileTab({ settings, onChange }: { settings: ExportSettings; onChange: OnChange }) {
  return (
    <div style={gridStyle}>
      <Field label="Container">
        <select value={settings.container} onChange={(e) => onChange({ container: e.target.value })} style={selectStyle}>
          {CONTAINERS.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
        </select>
      </Field>

      <Field label="Output Directory">
        <input type="text" value={settings.outputDirectory} onChange={(e) => onChange({ outputDirectory: e.target.value })} style={inputStyle} />
      </Field>

      <Field label="Filename Template" wide>
        <input type="text" value={settings.filenameTemplate} onChange={(e) => onChange({ filenameTemplate: e.target.value })} style={inputStyle} />
        <div style={tokenBarStyle}>
          {FILENAME_TOKENS.map(({ token, description }) => (
            <button
              key={token}
              onClick={() => onChange({ filenameTemplate: settings.filenameTemplate + '_' + token })}
              title={description}
              style={tokenBtnStyle}
            >
              {token}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function ProcessingTab({ settings, onChange }: { settings: ExportSettings; onChange: OnChange }) {
  return (
    <div style={gridStyle}>
      <Field label="LUT Path">
        <input type="text" value={settings.lutPath ?? ''} onChange={(e) => onChange({ lutPath: e.target.value || undefined })} style={inputStyle} placeholder="Path to .cube LUT file" />
      </Field>

      <Field label="Color Space Conversion">
        <select value={settings.colorSpaceConversion ?? ''} onChange={(e) => onChange({ colorSpaceConversion: e.target.value || undefined })} style={selectStyle}>
          <option value="">None</option>
          <option value="rec709-to-rec2020">Rec.709 → Rec.2020</option>
          <option value="rec2020-to-rec709">Rec.2020 → Rec.709</option>
          <option value="srgb-to-rec709">sRGB → Rec.709</option>
        </select>
      </Field>

      <Field label="Smart Reframe">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={settings.smartReframe?.enabled ?? false}
            onChange={(e) => onChange({ smartReframe: { enabled: e.target.checked, targetAspectRatio: settings.smartReframe?.targetAspectRatio ?? '9:16' } })}
          />
          <span>Enable AI-powered reframing</span>
        </label>
      </Field>

      {settings.smartReframe?.enabled && (
        <Field label="Target Aspect Ratio">
          <select
            value={settings.smartReframe.targetAspectRatio}
            onChange={(e) => onChange({ smartReframe: { ...settings.smartReframe!, targetAspectRatio: e.target.value } })}
            style={selectStyle}
          >
            <option value="9:16">9:16 (Vertical)</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="4:5">4:5 (Portrait)</option>
            <option value="16:9">16:9 (Landscape)</option>
          </select>
        </Field>
      )}

      <Field label="Auto Crop">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={settings.autoCrop ?? false}
            onChange={(e) => onChange({ autoCrop: e.target.checked })}
          />
          <span>Remove black bars</span>
        </label>
      </Field>

      <Field label="Deinterlace">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={settings.deinterlace ?? false}
            onChange={(e) => onChange({ deinterlace: e.target.checked })}
          />
          <span>Deinterlace source video</span>
        </label>
      </Field>
    </div>
  );
}

// ─── Shared Field Component ─────────────────────────────────────────────────

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const monitorWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 200,
};

const selectionBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '4px 8px',
  alignItems: 'center',
  borderTop: '1px solid var(--border-default)',
  background: 'var(--bg-raised)',
};

const selectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginRight: 4,
};

const modeBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 9,
  fontWeight: 600,
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
};

const templateBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 8px',
  borderRadius: 3,
  background: 'var(--brand-dim)',
  color: 'var(--text-accent)',
  fontWeight: 600,
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 0',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: 'color 0.1s',
};

const tabContentStyle: React.CSSProperties = {
  padding: '8px 12px',
  overflowY: 'auto',
  maxHeight: 260,
  background: 'var(--bg-raised)',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 8,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
  marginBottom: 3,
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '3px 6px',
  fontSize: 11,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const tokenBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 3,
  flexWrap: 'wrap',
  marginTop: 4,
};

const tokenBtnStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 4px',
  borderRadius: 2,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
};

const footerStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderTop: '1px solid var(--border-default)',
  background: 'var(--bg-raised)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const summaryStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

const dotStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
};

const queueBtnStyle: React.CSSProperties = {
  padding: '6px 20px',
  fontSize: 11,
  fontWeight: 600,
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
};
