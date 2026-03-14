import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaDatabaseEngine } from '../../engine/MediaDatabaseEngine';
import { mediaProbeEngine } from '../../engine/MediaProbeEngine';
import { useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

function makeFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  } as Record<number | 'length' | 'item', File | number | ((index: number) => File | null)>;

  files.forEach((file, index) => {
    fileList[index] = file;
  });

  return fileList as unknown as FileList;
}

describe('blank project ingest', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a first import bin for blank projects and records that bin in the media index', async () => {
    vi.spyOn(mediaProbeEngine, 'extract').mockResolvedValue({
      duration: 4,
      width: 1920,
      height: 1080,
      fps: 23.976,
      codec: 'ProRes',
      colorSpace: 'bt709',
      hasAlpha: false,
      audioChannels: 2,
      audioChannelLayout: 'stereo',
      sampleRate: 48000,
      fileSize: 4,
      startTimecode: '01:00:00:00',
      bitDepth: 10,
      mimeType: 'video/quicktime',
    });
    vi.spyOn(mediaDatabaseEngine, 'init').mockResolvedValue();
    const addEntrySpy = vi.spyOn(mediaDatabaseEngine, 'addEntry').mockResolvedValue();

    useEditorStore.setState({
      bins: [],
      selectedBinId: null,
      activeBinAssets: [],
      ingestProgress: {},
    });

    const file = new File(['test'], 'first-clip.mov', { type: 'video/quicktime' });
    useEditorStore.getState().importMediaFiles(makeFileList([file]));

    const state = useEditorStore.getState();
    expect(state.bins).toHaveLength(1);
    expect(state.selectedBinId).toBe(state.bins[0]!.id);
    expect(state.bins[0]!.name).toBe('Imported Media');
    expect(state.bins[0]!.assets.map((asset) => asset.name)).toEqual(['first-clip.mov']);
    expect(state.activeBinAssets.map((asset) => asset.name)).toEqual(['first-clip.mov']);

    await vi.waitFor(() => {
      expect(addEntrySpy).toHaveBeenCalledWith(expect.objectContaining({
        fileName: 'first-clip.mov',
        binId: state.bins[0]!.id,
      }));
    });
  });
});
