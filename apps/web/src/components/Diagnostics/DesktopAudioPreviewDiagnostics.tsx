import React from 'react';
import type { DesktopMonitorConsumer } from '../../store/editor.store';
import { useEditorStore } from '../../store/editor.store';

interface DesktopAudioPreviewDiagnosticsProps {
  consumer: DesktopMonitorConsumer;
  style?: React.CSSProperties;
}

function buildTooltip(
  consumer: DesktopMonitorConsumer,
  previewRenderArtifacts: string[],
  offlinePrintRenderRequired: boolean,
): string {
  const monitorLabel = consumer === 'record-monitor' ? 'record monitor' : 'program monitor';
  const artifactLabel = previewRenderArtifacts.length === 1
    ? '1 buffered cache artifact ready'
    : `${previewRenderArtifacts.length} buffered cache artifacts ready`;
  const exportLabel = offlinePrintRenderRequired
    ? ' Export still requires an offline print-render pass for one or more buses.'
    : '';
  return `Desktop playback is using buffered audio preview on the ${monitorLabel}. ${artifactLabel}.${exportLabel}`;
}

export function DesktopAudioPreviewDiagnostics({
  consumer,
  style,
}: DesktopAudioPreviewDiagnosticsProps) {
  const status = useEditorStore((state) => state.desktopMonitorAudioPreview[consumer]);

  if (!status?.bufferedPreviewActive) {
    return null;
  }

  return (
    <span
      title={buildTooltip(consumer, status.previewRenderArtifacts, status.offlinePrintRenderRequired)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 999,
        fontSize: 10,
        lineHeight: 1.2,
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--text-primary, rgba(245, 245, 240, 0.92))',
        background: 'rgba(91, 106, 245, 0.16)',
        border: '1px solid rgba(91, 106, 245, 0.28)',
        ...style,
      }}
    >
      Buffered audio preview
    </span>
  );
}
