// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Effects Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { effectsEngine, EffectInstance, Keyframe } from '../engine/EffectsEngine';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EffectsState {
  clipEffects: Record<string, EffectInstance[]>;   // clipId -> effects
  selectedClipId: string | null;
  selectedEffectId: string | null;
  searchQuery: string;
  categoryFilter: string | null;
  favorites: string[];                              // definition IDs
  showKeyframes: boolean;
  currentFrame: number;
}

interface EffectsActions {
  selectClip: (clipId: string | null) => void;
  selectEffect: (effectId: string | null) => void;
  addEffect: (clipId: string, definitionId: string) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  toggleEffect: (clipId: string, effectId: string) => void;
  updateParam: (clipId: string, effectId: string, paramName: string, value: any) => void;
  addKeyframe: (clipId: string, effectId: string, keyframe: Keyframe) => void;
  removeKeyframe: (clipId: string, effectId: string, frame: number, paramName: string) => void;
  setSearch: (query: string) => void;
  setCategoryFilter: (category: string | null) => void;
  toggleFavorite: (definitionId: string) => void;
  reorderEffects: (clipId: string, newOrder: string[]) => void;
  setShowKeyframes: (show: boolean) => void;
  setCurrentFrame: (frame: number) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useEffectsStore = create<EffectsState & EffectsActions>()(
  immer((set) => ({
    // State
    clipEffects: {},
    selectedClipId: null,
    selectedEffectId: null,
    searchQuery: '',
    categoryFilter: null,
    favorites: ['blur-gaussian', 'hue-saturation', 'film-grain'],
    showKeyframes: false,
    currentFrame: 0,

    // Actions
    selectClip: (clipId) => set((s) => {
      s.selectedClipId = clipId;
      s.selectedEffectId = null;
    }),

    selectEffect: (effectId) => set((s) => {
      s.selectedEffectId = effectId;
    }),

    addEffect: (clipId, definitionId) => set((s) => {
      const instance = effectsEngine.createInstance(definitionId);
      if (!instance) return;
      effectsEngine.addEffectToClip(clipId, instance.id);
      if (!s.clipEffects[clipId]) {
        s.clipEffects[clipId] = [];
      }
      s.clipEffects[clipId].push(instance);
      s.selectedEffectId = instance.id;
    }),

    removeEffect: (clipId, effectId) => set((s) => {
      effectsEngine.removeInstance(effectId);
      if (s.clipEffects[clipId]) {
        s.clipEffects[clipId] = s.clipEffects[clipId].filter((e) => e.id !== effectId);
      }
      if (s.selectedEffectId === effectId) {
        s.selectedEffectId = null;
      }
    }),

    toggleEffect: (clipId, effectId) => set((s) => {
      const effects = s.clipEffects[clipId];
      if (!effects) return;
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        effect.enabled = !effect.enabled;
      }
    }),

    updateParam: (clipId, effectId, paramName, value) => set((s) => {
      const effects = s.clipEffects[clipId];
      if (!effects) return;
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        effect.params[paramName] = value;
        effectsEngine.updateParam(effectId, paramName, value);
      }
    }),

    addKeyframe: (clipId, effectId, keyframe) => set((s) => {
      const effects = s.clipEffects[clipId];
      if (!effects) return;
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        // Remove existing keyframe at same frame/param
        effect.keyframes = effect.keyframes.filter(
          (kf) => !(kf.frame === keyframe.frame && kf.paramName === keyframe.paramName)
        );
        effect.keyframes.push(keyframe);
        effect.keyframes.sort((a, b) => a.frame - b.frame);
        effectsEngine.addKeyframe(effectId, keyframe);
      }
    }),

    removeKeyframe: (clipId, effectId, frame, paramName) => set((s) => {
      const effects = s.clipEffects[clipId];
      if (!effects) return;
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        effect.keyframes = effect.keyframes.filter(
          (kf) => !(kf.frame === frame && kf.paramName === paramName)
        );
        effectsEngine.removeKeyframe(effectId, frame, paramName);
      }
    }),

    setSearch: (query) => set((s) => {
      s.searchQuery = query;
    }),

    setCategoryFilter: (category) => set((s) => {
      s.categoryFilter = category;
    }),

    toggleFavorite: (definitionId) => set((s) => {
      const idx = s.favorites.indexOf(definitionId);
      if (idx >= 0) {
        s.favorites.splice(idx, 1);
      } else {
        s.favorites.push(definitionId);
      }
    }),

    reorderEffects: (clipId, newOrder) => set((s) => {
      const effects = s.clipEffects[clipId];
      if (!effects) return;
      const map = new Map(effects.map((e) => [e.id, e]));
      s.clipEffects[clipId] = newOrder
        .map((id) => map.get(id))
        .filter((e): e is EffectInstance => e !== undefined);
      effectsEngine.reorderEffects(clipId, newOrder);
    }),

    setShowKeyframes: (show) => set((s) => {
      s.showKeyframes = show;
    }),

    setCurrentFrame: (frame) => set((s) => {
      s.currentFrame = frame;
    }),
  }))
);
