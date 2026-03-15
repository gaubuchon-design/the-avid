import { describe, it, expect, beforeEach } from 'vitest';
import { useColorStore } from '../../store/color.store';

describe('color store pipeline state', () => {
  beforeEach(() => {
    useColorStore.getState().resetStore();
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it('initial state has correct defaults', () => {
    const state = useColorStore.getState();
    expect(state.sourceColorSpace).toBeNull();
    expect(state.workingColorSpace).toBe('rec709');
    expect(state.displayTransform).toBe('sdr-rec709');
    expect(state.pipelineMismatch).toBe(false);
    expect(state.pipelineAutoDetect).toBe(true);
  });

  // ── setSourceColorSpace ────────────────────────────────────────────────

  it('setSourceColorSpace updates state and computes mismatch', () => {
    useColorStore.getState().setSourceColorSpace('rec2020');
    const state = useColorStore.getState();
    expect(state.sourceColorSpace).toBe('rec2020');
    expect(state.pipelineMismatch).toBe(true);
  });

  // ── setWorkingColorSpace ───────────────────────────────────────────────

  it('setWorkingColorSpace updates state and computes mismatch', () => {
    useColorStore.getState().setSourceColorSpace('rec2020');
    useColorStore.getState().setWorkingColorSpace('rec2020');
    const state = useColorStore.getState();
    expect(state.workingColorSpace).toBe('rec2020');
    expect(state.pipelineMismatch).toBe(false);
  });

  // ── setDisplayTransform ────────────────────────────────────────────────

  it('setDisplayTransform updates state', () => {
    useColorStore.getState().setDisplayTransform('hdr-pq');
    expect(useColorStore.getState().displayTransform).toBe('hdr-pq');
  });

  // ── setPipelineAutoDetect ──────────────────────────────────────────────

  it('setPipelineAutoDetect toggles correctly', () => {
    useColorStore.getState().setPipelineAutoDetect(false);
    expect(useColorStore.getState().pipelineAutoDetect).toBe(false);

    useColorStore.getState().setPipelineAutoDetect(true);
    expect(useColorStore.getState().pipelineAutoDetect).toBe(true);
  });

  // ── computePipelineMismatch ────────────────────────────────────────────

  it('computePipelineMismatch detects when source != working', () => {
    useColorStore.setState({ sourceColorSpace: 'rec2020', workingColorSpace: 'rec709' });
    useColorStore.getState().computePipelineMismatch();
    expect(useColorStore.getState().pipelineMismatch).toBe(true);
  });

  it('mismatch is false when source is null', () => {
    useColorStore.setState({ sourceColorSpace: null, workingColorSpace: 'rec709' });
    useColorStore.getState().computePipelineMismatch();
    expect(useColorStore.getState().pipelineMismatch).toBe(false);
  });

  it('mismatch is false when source === working', () => {
    useColorStore.setState({ sourceColorSpace: 'rec709', workingColorSpace: 'rec709' });
    useColorStore.getState().computePipelineMismatch();
    expect(useColorStore.getState().pipelineMismatch).toBe(false);
  });

  it('mismatch is true when source !== working', () => {
    useColorStore.setState({ sourceColorSpace: 'dci-p3', workingColorSpace: 'rec709' });
    useColorStore.getState().computePipelineMismatch();
    expect(useColorStore.getState().pipelineMismatch).toBe(true);
  });

  // ── resetStore ─────────────────────────────────────────────────────────

  it('resetStore resets pipeline state', () => {
    useColorStore.getState().setSourceColorSpace('rec2020');
    useColorStore.getState().setWorkingColorSpace('rec2020');
    useColorStore.getState().setDisplayTransform('hdr-pq');
    useColorStore.getState().setPipelineAutoDetect(false);

    useColorStore.getState().resetStore();

    const state = useColorStore.getState();
    expect(state.sourceColorSpace).toBeNull();
    expect(state.workingColorSpace).toBe('rec709');
    expect(state.displayTransform).toBe('sdr-rec709');
    expect(state.pipelineMismatch).toBe(false);
    expect(state.pipelineAutoDetect).toBe(true);
  });
});
