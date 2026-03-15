// =============================================================================
//  THE AVID — Template Editor Modal (Deliver Page)
//  Create and edit custom publishing templates with multi-step workflows.
// =============================================================================

import React, { useState } from 'react';
import { useDeliverStore } from '../../store/deliver.store';
import type {
  TemplateCategory,
  TemplateStepType,
  TemplateStep,
  StepFailureAction,
  WorkerType,
} from '../../types/deliver.types';

// ─── Constants ──────────────────────────────────────────────────────────────

const STEP_TYPES: { value: TemplateStepType; label: string }[] = [
  { value: 'encode', label: 'Encode' },
  { value: 'transcode', label: 'Transcode' },
  { value: 'upload', label: 'Upload' },
  { value: 'validate', label: 'Validate' },
  { value: 'metadata', label: 'Metadata' },
  { value: 'reframe', label: 'Reframe' },
  { value: 'caption', label: 'Caption' },
  { value: 'qc', label: 'QC Check' },
  { value: 'package', label: 'Package' },
  { value: 'watermark', label: 'Watermark' },
  { value: 'loudness', label: 'Loudness' },
  { value: 'checksum', label: 'Checksum' },
];

const WORKER_TYPES: { value: WorkerType; label: string }[] = [
  { value: 'render', label: 'Render' },
  { value: 'ingest', label: 'Ingest' },
  { value: 'transcribe', label: 'Transcribe' },
  { value: 'metadata', label: 'Metadata' },
];

const CATEGORIES: TemplateCategory[] = ['social', 'broadcast', 'archive', 'streaming', 'interchange', 'custom'];

// ─── Component ──────────────────────────────────────────────────────────────

export function TemplateEditor() {
  const showEditor = useDeliverStore((s) => s.showTemplateEditor);
  const setShowEditor = useDeliverStore((s) => s.setShowTemplateEditor);
  const createTemplate = useDeliverStore((s) => s.createCustomTemplate);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<Omit<TemplateStep, 'id'>[]>([]);

  if (!showEditor) return null;

  const addStep = () => {
    setSteps([...steps, {
      order: steps.length + 1,
      type: 'encode',
      label: 'New Step',
      workerType: 'render',
      config: {},
      failureAction: 'abort',
      optional: false,
    }]);
  };

  const updateStep = (idx: number, patch: Partial<Omit<TemplateStep, 'id'>>) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const copy = [...steps];
    [copy[idx], copy[newIdx]] = [copy[newIdx]!, copy[idx]!];
    setSteps(copy.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    createTemplate({
      name: name.trim(),
      category,
      icon: category,
      description: description.trim(),
      isBuiltIn: false,
      steps: steps.map((s, i) => ({ ...s, id: `step_custom_${Date.now()}_${i}` })),
      presetOverrides: {},
    });
    // Reset and close
    setName('');
    setCategory('custom');
    setDescription('');
    setSteps([]);
    setShowEditor(false);
  };

  return (
    <div style={overlayStyle} onClick={() => setShowEditor(false)}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={modalHeaderStyle}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Create Custom Template</span>
          <button onClick={() => setShowEditor(false)} style={closeBtnStyle}>✕</button>
        </div>

        {/* Form */}
        <div style={modalBodyStyle}>
          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="My Custom Template" />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} style={selectStyle}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Brief description of this template" />
          </div>

          {/* Steps */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={labelStyle}>Workflow Steps</label>
              <button onClick={addStep} style={addStepBtnStyle}>+ Add Step</button>
            </div>

            {steps.length === 0 && (
              <div style={emptyStepsStyle}>No steps added yet. Click "+ Add Step" to begin.</div>
            )}

            {steps.map((step, idx) => (
              <div key={idx} style={stepRowStyle}>
                <span style={stepOrderStyle}>{idx + 1}</span>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <select value={step.type} onChange={(e) => updateStep(idx, { type: e.target.value as TemplateStepType })} style={stepSelectStyle}>
                    {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    value={step.label}
                    onChange={(e) => updateStep(idx, { label: e.target.value })}
                    style={stepInputStyle}
                    placeholder="Step label"
                  />
                  <select value={step.workerType} onChange={(e) => updateStep(idx, { workerType: e.target.value as WorkerType })} style={stepSelectStyle}>
                    {WORKER_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
                <div style={stepActionsStyle}>
                  <select
                    value={step.failureAction}
                    onChange={(e) => updateStep(idx, { failureAction: e.target.value as StepFailureAction })}
                    style={{ ...stepSelectStyle, width: 60 }}
                    title="On failure"
                  >
                    <option value="abort">Abort</option>
                    <option value="retry">Retry</option>
                    <option value="skip">Skip</option>
                  </select>
                  <label style={optionalLabelStyle} title="Optional step">
                    <input
                      type="checkbox"
                      checked={step.optional}
                      onChange={(e) => updateStep(idx, { optional: e.target.checked })}
                    />
                    <span style={{ fontSize: 8 }}>Opt</span>
                  </label>
                  {idx > 0 && <button onClick={() => moveStep(idx, -1)} style={stepBtn}>↑</button>}
                  {idx < steps.length - 1 && <button onClick={() => moveStep(idx, 1)} style={stepBtn}>↓</button>}
                  <button onClick={() => removeStep(idx)} style={{ ...stepBtn, color: 'var(--error)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={modalFooterStyle}>
          <button onClick={() => setShowEditor(false)} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} style={{ ...saveBtnStyle, opacity: name.trim() ? 1 : 0.5 }}>
            Create Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  width: 600,
  maxHeight: '80vh',
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--text-primary)',
};

const closeBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
};

const modalBodyStyle: React.CSSProperties = {
  padding: 16,
  overflowY: 'auto',
  flex: 1,
};

const modalFooterStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid var(--border-default)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
  marginBottom: 3,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 11,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle };

const addStepBtnStyle: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 10px',
  borderRadius: 3,
  border: '1px solid var(--brand)',
  background: 'var(--brand-dim)',
  color: 'var(--text-accent)',
  cursor: 'pointer',
  fontWeight: 600,
};

const emptyStepsStyle: React.CSSProperties = {
  padding: 16,
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: 11,
  background: 'var(--bg-overlay)',
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--border-subtle)',
};

const stepRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  background: 'var(--bg-raised)',
  borderRadius: 3,
  marginBottom: 3,
  border: '1px solid var(--border-subtle)',
};

const stepOrderStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const stepSelectStyle: React.CSSProperties = {
  padding: '2px 4px',
  fontSize: 10,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 2,
  color: 'var(--text-primary)',
  outline: 'none',
};

const stepInputStyle: React.CSSProperties = { ...stepSelectStyle };

const stepActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 3,
  alignItems: 'center',
  flexShrink: 0,
};

const optionalLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  cursor: 'pointer',
  color: 'var(--text-tertiary)',
};

const stepBtn: React.CSSProperties = {
  width: 16,
  height: 16,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 9,
  padding: 0,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 11,
  background: 'transparent',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '6px 20px',
  fontSize: 11,
  fontWeight: 600,
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
