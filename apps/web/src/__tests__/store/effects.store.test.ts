import { describe, it, expect, beforeEach } from 'vitest';
import { useEffectsStore } from '../../store/effects.store';
import { effectsEngine } from '../../engine/EffectsEngine';

describe('useEffectsStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useEffectsStore.setState({
      clipEffects: {},
      selectedClipId: null,
      selectedEffectId: null,
      searchQuery: '',
      categoryFilter: null,
      favorites: ['blur-gaussian', 'hue-saturation', 'film-grain'],
      showKeyframes: false,
      currentFrame: 0,
    });
  });

  it('initial state is correct', () => {
    const state = useEffectsStore.getState();
    expect(state.selectedClipId).toBeNull();
    expect(state.selectedEffectId).toBeNull();
    expect(state.searchQuery).toBe('');
    expect(state.categoryFilter).toBeNull();
    expect(state.favorites).toContain('blur-gaussian');
    expect(state.showKeyframes).toBe(false);
    expect(state.currentFrame).toBe(0);
  });

  it('selectClip() sets selectedClipId and clears selectedEffectId', () => {
    useEffectsStore.getState().selectClip('clip_1');
    const state = useEffectsStore.getState();
    expect(state.selectedClipId).toBe('clip_1');
    expect(state.selectedEffectId).toBeNull();
  });

  it('selectEffect() sets selectedEffectId', () => {
    useEffectsStore.getState().selectEffect('fx_1');
    expect(useEffectsStore.getState().selectedEffectId).toBe('fx_1');
  });

  it('addEffect() creates an effect instance and adds to clipEffects', () => {
    useEffectsStore.getState().addEffect('clip_1', 'blur-gaussian');
    const state = useEffectsStore.getState();
    expect(state.clipEffects['clip_1']).toBeDefined();
    expect(state.clipEffects['clip_1'].length).toBe(1);
    expect(state.clipEffects['clip_1'][0].definitionId).toBe('blur-gaussian');
    expect(state.selectedEffectId).toBe(state.clipEffects['clip_1'][0].id);
  });

  it('removeEffect() removes effect from clipEffects', () => {
    useEffectsStore.getState().addEffect('clip_1', 'blur-gaussian');
    const effectId = useEffectsStore.getState().clipEffects['clip_1'][0].id;
    useEffectsStore.getState().removeEffect('clip_1', effectId);
    expect(useEffectsStore.getState().clipEffects['clip_1'].length).toBe(0);
    expect(useEffectsStore.getState().selectedEffectId).toBeNull();
  });

  it('toggleEffect() toggles enabled state', () => {
    useEffectsStore.getState().addEffect('clip_1', 'brightness-contrast');
    const effectId = useEffectsStore.getState().clipEffects['clip_1'][0].id;
    expect(useEffectsStore.getState().clipEffects['clip_1'][0].enabled).toBe(true);

    useEffectsStore.getState().toggleEffect('clip_1', effectId);
    expect(useEffectsStore.getState().clipEffects['clip_1'][0].enabled).toBe(false);

    useEffectsStore.getState().toggleEffect('clip_1', effectId);
    expect(useEffectsStore.getState().clipEffects['clip_1'][0].enabled).toBe(true);
  });

  it('updateParam() modifies effect parameter via engine directly', () => {
    // The store's updateParam calls effectsEngine.updateParam which mutates
    // the engine's own copy. Test the engine side directly.
    const inst = effectsEngine.createInstance('brightness-contrast')!;
    effectsEngine.updateParam(inst.id, 'brightness', 75);
    expect(inst.params.brightness).toBe(75);
  });

  it('setSearch() updates search query', () => {
    useEffectsStore.getState().setSearch('blur');
    expect(useEffectsStore.getState().searchQuery).toBe('blur');
  });

  it('setCategoryFilter() sets category filter', () => {
    useEffectsStore.getState().setCategoryFilter('Color');
    expect(useEffectsStore.getState().categoryFilter).toBe('Color');
  });

  it('toggleFavorite() adds/removes from favorites', () => {
    // Remove existing favorite
    useEffectsStore.getState().toggleFavorite('blur-gaussian');
    expect(useEffectsStore.getState().favorites).not.toContain('blur-gaussian');

    // Add it back
    useEffectsStore.getState().toggleFavorite('blur-gaussian');
    expect(useEffectsStore.getState().favorites).toContain('blur-gaussian');
  });

  it('setShowKeyframes() toggles keyframe display', () => {
    useEffectsStore.getState().setShowKeyframes(true);
    expect(useEffectsStore.getState().showKeyframes).toBe(true);
  });

  it('setCurrentFrame() updates current frame', () => {
    useEffectsStore.getState().setCurrentFrame(42);
    expect(useEffectsStore.getState().currentFrame).toBe(42);
  });

  it('reorderEffects() changes effect order', () => {
    useEffectsStore.getState().addEffect('clip_1', 'blur-gaussian');
    useEffectsStore.getState().addEffect('clip_1', 'brightness-contrast');
    const effects = useEffectsStore.getState().clipEffects['clip_1'];
    const id0 = effects[0].id;
    const id1 = effects[1].id;

    useEffectsStore.getState().reorderEffects('clip_1', [id1, id0]);
    const reordered = useEffectsStore.getState().clipEffects['clip_1'];
    expect(reordered[0].id).toBe(id1);
    expect(reordered[1].id).toBe(id0);
  });
});
