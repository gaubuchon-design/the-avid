import { describe, expect, it } from 'vitest';
import { isLegacyExportPageParam, resolveEditorPageParam, resolveWorkspaceParam } from '../../lib/editorUrlState';

describe('editorUrlState', () => {
  it('resolves supported editor pages', () => {
    expect(resolveEditorPageParam('media')).toBe('media');
    expect(resolveEditorPageParam('edit')).toBe('edit');
  });

  it('resolves all valid editor pages', () => {
    expect(resolveEditorPageParam('cut')).toBe('cut');
    expect(resolveEditorPageParam('vfx')).toBe('vfx');
    expect(resolveEditorPageParam('color')).toBe('color');
    expect(resolveEditorPageParam('protools')).toBe('protools');
    expect(resolveEditorPageParam('deliver')).toBe('deliver');
  });

  it('falls back to edit for unsupported pages', () => {
    expect(resolveEditorPageParam(null)).toBe('edit');
    expect(resolveEditorPageParam('admin')).toBe('edit');
    expect(resolveEditorPageParam('fusion')).toBe('edit');
  });

  it('flags legacy export links for export-panel handoff', () => {
    expect(isLegacyExportPageParam('export')).toBe(true);
    expect(isLegacyExportPageParam('deliver')).toBe(false);
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
