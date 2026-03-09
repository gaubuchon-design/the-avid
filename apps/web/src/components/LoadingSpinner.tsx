export function LoadingSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: '2px solid var(--border-subtle)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      {label}
    </div>
  );
}
