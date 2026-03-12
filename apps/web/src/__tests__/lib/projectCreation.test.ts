import { describe, expect, it } from 'vitest';
import { buildProjectCreationOptions } from '../../lib/projectCreation';

describe('project creation presets', () => {
  it('maps editorial workspace defaults into real project settings', () => {
    const options = buildProjectCreationOptions({
      workspace: 'filmtv',
      name: 'Short Cut',
    });

    expect(options.template).toBe('film');
    expect(options.frameRate).toBe(23.976);
    expect(options.width).toBe(1920);
    expect(options.height).toBe(1080);
    expect(options.dropFrame).toBe(false);
    expect(options.activeWorkspaceId).toBe('source-record');
    expect(options.seedContent).toBe(false);
  });

  it('lets explicit sequence choices override editorial defaults', () => {
    const options = buildProjectCreationOptions({
      workspace: 'filmtv',
      sequence: {
        fps: 25,
        width: 2048,
        height: 1080,
        dropFrame: false,
      },
    });

    expect(options.template).toBe('film');
    expect(options.frameRate).toBe(25);
    expect(options.width).toBe(2048);
    expect(options.height).toBe(1080);
    expect(options.dropFrame).toBe(false);
    expect(options.activeWorkspaceId).toBe('source-record');
  });

  it('keeps template-specific workstation defaults when a dashboard card overrides the UI workspace preset', () => {
    const options = buildProjectCreationOptions({
      template: 'podcast',
      workspace: 'filmtv',
    });

    expect(options.template).toBe('podcast');
    expect(options.frameRate).toBe(30);
    expect(options.activeWorkspaceId).toBe('audio-mixing');
    expect(options.composerLayout).toBe('source-record');
  });
});
