import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectMediaPaths, resolveImportSourcePaths } from '../mediaPipeline';

describe('createProjectMediaPaths', () => {
  it('includes a thumbnail cache directory for generated poster frames', () => {
    const paths = createProjectMediaPaths('/tmp/test-project');

    expect(paths.thumbnailsPath).toBe('/tmp/test-project/media/thumbnails');
  });
});

describe('resolveImportSourcePaths', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it('expands dropped directories and keeps unsupported files for explicit classification', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'avid-ingest-'));
    tempDirs.push(tempRoot);

    const cardFolder = path.join(tempRoot, 'CameraCard');
    const nestedFolder = path.join(cardFolder, 'A001');
    await mkdir(nestedFolder, { recursive: true });

    const videoPath = path.join(nestedFolder, 'clip-a.mov');
    const audioPath = path.join(cardFolder, 'mix.wav');
    const unsupportedPath = path.join(cardFolder, 'notes.txt');
    await writeFile(videoPath, 'video');
    await writeFile(audioPath, 'audio');
    await writeFile(unsupportedPath, 'notes');

    const resolved = await resolveImportSourcePaths([cardFolder, videoPath, unsupportedPath]);

    expect(resolved).toEqual([videoPath, audioPath, unsupportedPath]);
  });
});
