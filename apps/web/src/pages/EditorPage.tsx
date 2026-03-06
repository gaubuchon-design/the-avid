import { useParams } from 'react-router-dom';

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="editor">
      <div className="editor__toolbar">Toolbar — Project: {projectId}</div>
      <div className="editor__workspace">
        <aside className="editor__panel editor__panel--left">Assets</aside>
        <main className="editor__canvas">Preview Canvas</main>
        <aside className="editor__panel editor__panel--right">Inspector</aside>
      </div>
      <div className="editor__timeline">Timeline</div>
    </div>
  );
}
