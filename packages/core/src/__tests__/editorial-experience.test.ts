import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_EDITORIAL_WORKSPACE_IDS,
  coerceWorkspaceForSurface,
  getEditorialSurfaceContract,
  listProjectTemplatesForSurface,
  listSurfaceWorkspaces,
  resolveEditorialSurfaceFromPlatform,
} from '../editorial-experience';

describe('editorial experience contract', () => {
  it('exposes workstation contracts for desktop and browser plus a companion mobile contract', () => {
    expect(getEditorialSurfaceContract('desktop').role).toBe('workstation');
    expect(getEditorialSurfaceContract('browser').role).toBe('workstation');
    expect(getEditorialSurfaceContract('mobile').role).toBe('companion');
  });

  it('keeps desktop on all built-in workspaces and withholds them from mobile', () => {
    expect(listSurfaceWorkspaces('desktop')).toEqual([...BUILT_IN_EDITORIAL_WORKSPACE_IDS]);
    expect(listSurfaceWorkspaces('mobile')).toEqual([]);
  });

  it('coerces unknown or unsupported workspaces back to the surface default', () => {
    expect(coerceWorkspaceForSurface('browser', 'source-record')).toBe('source-record');
    expect(coerceWorkspaceForSurface('mobile', 'audio-mixing')).toBe('source-record');
    expect(coerceWorkspaceForSurface('desktop', 'unknown-workspace')).toBe('source-record');
  });

  it('maps deployment platforms onto editorial surfaces', () => {
    expect(resolveEditorialSurfaceFromPlatform('desktop-mac')).toBe('desktop');
    expect(resolveEditorialSurfaceFromPlatform('desktop-windows')).toBe('desktop');
    expect(resolveEditorialSurfaceFromPlatform('mobile-ios')).toBe('mobile');
    expect(resolveEditorialSurfaceFromPlatform('mobile-android')).toBe('mobile');
    expect(resolveEditorialSurfaceFromPlatform('web')).toBe('browser');
  });

  it('exposes editorial template sets per surface', () => {
    expect(listProjectTemplatesForSurface('desktop')).toContain('commercial');
    expect(listProjectTemplatesForSurface('mobile')).not.toContain('commercial');
  });
});
