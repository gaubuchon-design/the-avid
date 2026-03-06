import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Hook into native Save/Export menu events
  useEffect(() => {
    window.electronAPI?.onSave(() => {
      console.log('Native save triggered');
      // TODO: trigger project save
    });
    window.electronAPI?.onExport(async () => {
      const result = await window.electronAPI?.saveFile({
        title: 'Export Project',
        defaultPath: 'output.mp4',
        filters: [
          { name: 'Video', extensions: ['mp4', 'mov', 'webm'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'aiff'] },
        ],
      });
      if (result && !result.canceled) {
        console.log('Export to:', result.filePath);
      }
    });
    return () => {
      window.electronAPI?.removeAllListeners('menu:save');
      window.electronAPI?.removeAllListeners('menu:export');
    };
  }, []);

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#94a3b8', padding: '0.25rem 0.5rem' }}>
          ← Back
        </button>
        <span style={{ flex: 1, textAlign: 'center', color: '#94a3b8' }}>
          {decodeURIComponent(projectId || 'New Project')}
        </span>
      </div>
      <div className="editor__workspace">
        <aside className="editor__panel editor__panel--left">Assets</aside>
        <main className="editor__canvas">Preview Canvas</main>
        <aside className="editor__panel editor__panel--right">Inspector</aside>
      </div>
      <div className="editor__timeline">Timeline</div>
    </div>
  );
}
