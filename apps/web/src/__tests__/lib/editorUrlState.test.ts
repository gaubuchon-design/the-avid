import { describe, expect, it } from 'vitest';
import { resolveEditorPageParam, resolveWorkspaceParam } from '../../lib/editorUrlState';

describe('editorUrlState', () => {
  it('resolves supported editor pages', () => {
    expect(resolveEditorPageParam('media')).toBe('media');
    expect(resolveEditorPageParam('deliver')).toBe('deliver');
  });

  it('falls back to edit for unsupported pages', () => {
    expect(resolveEditorPageParam(null)).toBe('edit');
    expect(resolveEditorPageParam('admin')).toBe('edit');
  });

  it('resolves supported workspaces', () => {
    expect(resolveWorkspaceParam('sports')).toBe('sports');
    expect(resolveWorkspaceParam('marketing')).toBe('marketing');
  });

  it('falls back to film/tv for unsupported workspaces', () => {
    expect(resolveWorkspaceParam(null)).toBe('filmtv');
    expect(resolveWorkspaceParam('newsroom')).toBe('filmtv');
  });
});
