import { describe, expect, it } from 'vitest';

import { isLegacyExportPageParam, resolveEditorPageParam, resolveWorkspaceParam } from '../../lib/editorUrlState';

describe('editorUrlState', () => {
  it('resolves supported editor pages', () => {
    expect(resolveEditorPageParam('media')).toBe('media');
    expect(resolveEditorPageParam('edit')).toBe('edit');
    expect(resolveEditorPageParam('ai')).toBe('ai');
    expect(resolveEditorPageParam('admin')).toBe('admin');
    expect(resolveEditorPageParam('vfx')).toBe('vfx');
  });

  it('falls back to edit for unsupported pages', () => {
    expect(resolveEditorPageParam(null)).toBe('edit');
    expect(resolveEditorPageParam('admin')).toBe('admin');
    expect(resolveEditorPageParam('deliver')).toBe('edit');
  });

  it('flags legacy deliver links for export-panel handoff', () => {
    expect(isLegacyExportPageParam('deliver')).toBe(true);
    expect(isLegacyExportPageParam('edit')).toBe(false);
  });

  it('resolves supported workspaces', () => {
    expect(resolveWorkspaceParam('filmtv')).toBe('filmtv');
  });

  it('falls back to film/tv for unsupported workspaces', () => {
    expect(resolveWorkspaceParam(null)).toBe('filmtv');
    expect(resolveWorkspaceParam('sports')).toBe('filmtv');
    expect(resolveWorkspaceParam('newsroom')).toBe('filmtv');
  });
});
