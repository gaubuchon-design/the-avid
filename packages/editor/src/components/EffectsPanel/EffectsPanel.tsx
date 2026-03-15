// =============================================================================
//  THE AVID -- Effects, Titles & Compositing Panel
//  DaVinci Resolve Effects Browser Parity
// =============================================================================

import React, { useMemo, useCallback, useRef, useState, memo } from 'react';
import { useEffectsStore } from '../../store/effects.store';
import { useEditorStore } from '../../store/editor.store';
import { effectsEngine, EffectDefinition, EffectInstance, EffectParamDef } from '../../engine/EffectsEngine';

// -- Category Tree Structure -------------------------------------------------
// Maps the engine's flat categories into a DaVinci Resolve-style hierarchy.

interface CategoryNode {
  label: string;
  icon: string;
  /** Engine categories belonging to this node. */
  categories?: string[];
  children?: CategoryNode[];
  /** Special virtual category key (e.g. 'favorites'). */
  virtual?: string;
}

const CATEGORY_TREE: CategoryNode[] = [
  {
    label: 'Video FX',
    icon: '\u{1F3AC}',
    children: [
      { label: 'Blur', icon: '\u{1F32B}', categories: ['Blur'] },
      { label: 'Color', icon: '\u{1F3A8}', categories: ['Color'] },
      { label: 'Composite', icon: '\u{1F5C2}', categories: ['Composite', 'Keyer', 'Edge'] },
      { label: 'Stylize', icon: '\u2728', categories: ['Stylize', 'Beauty', 'Film'] },
      { label: 'Transform', icon: '\u{1F504}', categories: ['Transform', 'Distort'] },
      { label: 'Light', icon: '\u{1F4A1}', categories: ['Light'] },
      { label: 'Warp', icon: '\u{1F300}', categories: ['Warp'] },
      { label: 'Particle', icon: '\u2B50', categories: ['Particle'] },
    ],
  },
  {
    label: 'Audio FX',
    icon: '\u{1F3B5}',
    categories: ['Audio'],
  },
  {
    label: 'Transitions',
    icon: '\u{1F501}',
    categories: ['Morph'],
  },
  {
    label: 'Generators',
    icon: '\u{1F9EA}',
    categories: ['Generate'],
  },
  {
    label: 'Time',
    icon: '\u23F1',
    categories: ['Time'],
  },
  {
    label: 'Favorites',
    icon: '\u2605',
    virtual: 'favorites',
  },
];

// -- Brief descriptions for each effect (by definition id) -------------------

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  'blur-gaussian': 'Smooth, even blur in all directions. Classic soft-focus look.',
  'sharpen': 'Increase edge contrast to sharpen image detail.',
  'directional-blur': 'Motion-style blur along a specified angle.',
  'radial-blur': 'Spin or zoom blur radiating from a center point.',
  'chroma-key': 'Remove a specific color (green/blue screen) from footage.',
  'luma-key': 'Key out pixels based on luminance (brightness) values.',
  'blend-mode': 'Composite layers using standard blend modes (multiply, screen, etc.).',
  'color-balance': 'Adjust shadow, midtone, and highlight color balance.',
  'brightness-contrast': 'Simple brightness and contrast adjustment.',
  'hue-saturation': 'Shift hue, adjust saturation and lightness.',
  'curves': 'Fine-tune tonal range with per-channel curve controls.',
  'levels': 'Map input/output levels with gamma correction.',
  'color-lookup': 'Apply cinematic LUT color grades.',
  'drop-shadow': 'Add a colored shadow behind the layer.',
  'glow': 'Bloom/glow effect on bright areas.',
  'film-grain': 'Add organic film grain texture overlay.',
  'vignette': 'Darken edges for a classic vignette look.',
  'glitch': 'Digital glitch with RGB split, block corruption, and scanlines.',
  'halftone': 'Convert to halftone dot pattern (print/comic style).',
  'fluid-morph': 'Optical-flow based morphing between frames.',
  'morph-cut': 'Seamless jump-cut smoothing using motion analysis.',
  'warp-stabilizer': 'Stabilize shaky footage with motion tracking.',
  'lens-distortion': 'Barrel/pincushion lens distortion correction.',
  'turbulent-displace': 'Fractal noise-driven displacement distortion.',
  'solid-color': 'Generate a solid color fill layer.',
  'gradient': 'Generate linear or radial color gradient.',
  'noise': 'Add gaussian or uniform noise pattern.',
  'letterbox': 'Add cinematic letterbox bars at specified aspect ratio.',
  'speed-ramp': 'Variable speed with smooth ramp transitions.',
  'mirror': 'Mirror/flip the image along horizontal or vertical axis.',
  'difference-key': 'Key based on difference from a reference frame.',
  'color-range-key': 'Key out a range of hue/saturation/luminance values.',
  'linear-color-key': 'Precision linear keying with balance controls.',
  'ibk-keyer': 'Image-Based Keyer for green/blue screen compositing.',
  'light-wrap': 'Wrap background light around foreground edges for realistic composites.',
  'lens-flare': 'Simulated anamorphic lens flare with positioning.',
  'bokeh-blur': 'Out-of-focus blur with shaped bokeh highlights.',
  'light-rays': 'Volumetric light ray (god ray) effect.',
  'prism': 'Chromatic aberration / prismatic color split.',
  'particle-illusion': 'GPU-accelerated particle system (fire, smoke, sparks, rain).',
  'beauty-studio': 'Skin smoothing, blemish removal, and tone unification.',
  'film-damage': 'Simulated film scratches, dust, flicker, and gate weave.',
  'day-for-night': 'Convert daytime footage to nighttime look.',
  's-curves': 'S-shaped contrast curve for cinematic punch.',
  'edge-cleaner': 'Clean matte edges with erode, blur, and contract.',
  'matte-choker': 'Expand or contract alpha matte edges.',
  'optical-flow-slowmo': 'AI-powered slow motion via optical flow interpolation.',
  'frame-interpolation': 'Increase frame rate with motion-compensated interpolation.',
  'corner-pin': 'Four-corner perspective distortion for screen replacement.',
  'mesh-warp': 'Free-form mesh grid deformation.',
  'ripple': 'Concentric ripple distortion from a center point.',
  'wave': 'Sine/triangle/square wave displacement.',
  'twirl': 'Rotational twirl distortion around a center point.',
  'sphere': 'Spherical refraction/reflection distortion.',
};

// -- Preset data (hardcoded presets for demonstration) -----------------------

interface EffectPreset {
  name: string;
  params: Record<string, number | string | boolean>;
}

const EFFECT_PRESETS: Record<string, EffectPreset[]> = {
  'blur-gaussian': [
    { name: 'Soft Focus', params: { radius: 3, iterations: 2 } },
    { name: 'Heavy Blur', params: { radius: 25, iterations: 3 } },
    { name: 'Subtle', params: { radius: 1, iterations: 1 } },
  ],
  'brightness-contrast': [
    { name: 'Punchy', params: { brightness: 5, contrast: 30, useLegacy: false } },
    { name: 'Flat', params: { brightness: 0, contrast: -20, useLegacy: false } },
    { name: 'High Key', params: { brightness: 25, contrast: 10, useLegacy: false } },
  ],
  'hue-saturation': [
    { name: 'Desaturate', params: { hue: 0, saturation: -80, lightness: 0, colorize: false } },
    { name: 'Warm Boost', params: { hue: 10, saturation: 25, lightness: 5, colorize: false } },
    { name: 'Teal Shift', params: { hue: -30, saturation: 15, lightness: 0, colorize: false } },
  ],
  'color-lookup': [
    { name: 'Teal & Orange', params: { lut: 'teal-orange', intensity: 100 } },
    { name: 'Warm Sunset', params: { lut: 'warm-sunset', intensity: 80 } },
    { name: 'Bleach Bypass', params: { lut: 'bleach-bypass', intensity: 70 } },
  ],
  'film-grain': [
    { name: 'Subtle 16mm', params: { amount: 12, size: 1.2, softness: 60, animated: true } },
    { name: 'Heavy 8mm', params: { amount: 45, size: 2.5, softness: 30, animated: true } },
    { name: 'Static Noise', params: { amount: 20, size: 1, softness: 50, animated: false } },
  ],
  'glitch': [
    { name: 'Subtle VHS', params: { amount: 15, blockSize: 40, rgbSplit: 2, scanlines: true, animated: true } },
    { name: 'Corrupted', params: { amount: 60, blockSize: 15, rgbSplit: 12, scanlines: true, animated: true } },
    { name: 'Digital Error', params: { amount: 35, blockSize: 8, rgbSplit: 6, scanlines: false, animated: true } },
  ],
  'vignette': [
    { name: 'Cinematic', params: { amount: 40, midpoint: 45, roundness: 50, feather: 60 } },
    { name: 'Tunnel', params: { amount: 75, midpoint: 30, roundness: 80, feather: 40 } },
    { name: 'Light', params: { amount: 20, midpoint: 60, roundness: 50, feather: 70 } },
  ],
  'chroma-key': [
    { name: 'Green Screen', params: { keyColor: '#00ff00', tolerance: 40, softness: 10, spillSuppression: 50 } },
    { name: 'Blue Screen', params: { keyColor: '#0000ff', tolerance: 35, softness: 15, spillSuppression: 55 } },
  ],
  'drop-shadow': [
    { name: 'Soft Shadow', params: { color: '#000000', opacity: 50, angle: 135, distance: 8, blur: 12 } },
    { name: 'Hard Shadow', params: { color: '#000000', opacity: 85, angle: 135, distance: 4, blur: 1 } },
  ],
  'particle-illusion': [
    { name: 'Campfire', params: { emitterType: 'fire', birthRate: 80, lifetime: 1.5, velocity: 60, gravity: -30, particleSize: 8, color: '#ff6600' } },
    { name: 'Snowfall', params: { emitterType: 'snow', birthRate: 200, lifetime: 5, velocity: 30, gravity: 20, particleSize: 3, color: '#ffffff' } },
    { name: 'Sparks', params: { emitterType: 'spark', birthRate: 120, lifetime: 0.8, velocity: 200, gravity: 50, particleSize: 2, color: '#ffdd44' } },
  ],
};

// -- Category color map ------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  Blur: '#3b82f6',
  Color: '#f59e0b',
  Composite: '#22c55e',
  Keyer: '#22c55e',
  Edge: '#22c55e',
  Stylize: '#a855f7',
  Beauty: '#a855f7',
  Film: '#a855f7',
  Transform: '#ef4444',
  Distort: '#ef4444',
  Generate: '#06b6d4',
  Audio: '#ec4899',
  Morph: '#8b5cf6',
  Light: '#eab308',
  Warp: '#f97316',
  Particle: '#f43f5e',
  Time: '#14b8a6',
};

// -- Collect all engine categories that belong to a tree node ----------------

function collectCategories(node: CategoryNode): string[] {
  const cats: string[] = [];
  if (node.categories) cats.push(...node.categories);
  if (node.children) {
    for (const child of node.children) {
      cats.push(...collectCategories(child));
    }
  }
  return cats;
}

// =============================================================================
//  Inline Styles
// =============================================================================

const S = {
  root: {
    display: 'flex',
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    minHeight: 0,
  } as React.CSSProperties,

  // -- Category Sidebar (left) ------------------------------------------------
  sidebar: {
    width: 180,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--border-default)',
    overflow: 'hidden',
    minHeight: 0,
    background: 'var(--bg-void)',
  } as React.CSSProperties,
  sidebarHeader: {
    padding: '8px 10px 6px',
    fontFamily: 'var(--font-display)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1.4px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  } as React.CSSProperties,
  sidebarTree: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: '4px 0',
  } as React.CSSProperties,
  treeNode: (isSelected: boolean, depth: number) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: `3px 8px 3px ${8 + depth * 14}px`,
    cursor: 'pointer',
    fontSize: '11px',
    color: isSelected ? 'var(--brand-bright)' : 'var(--text-secondary)',
    background: isSelected ? 'var(--brand-dim, rgba(59,130,246,0.1))' : 'transparent',
    borderLeft: isSelected ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'background 75ms, color 75ms',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties),
  treeChevron: (expanded: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 12,
    height: 12,
    fontSize: '7px',
    color: 'var(--text-muted)',
    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 120ms',
    flexShrink: 0,
  } as React.CSSProperties),
  treeIcon: {
    fontSize: '11px',
    flexShrink: 0,
    width: 14,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  treeLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  treeCount: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    flexShrink: 0,
  } as React.CSSProperties,

  // -- Center browser panel ---------------------------------------------------
  browser: {
    width: 260,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--border-default)',
    overflow: 'hidden',
    minHeight: 0,
    background: 'var(--bg-surface)',
  } as React.CSSProperties,
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  } as React.CSSProperties,
  searchIcon: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  } as React.CSSProperties,
  searchInput: {
    flex: 1,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--text-primary)',
    fontSize: '11px',
    padding: '5px 8px',
    outline: 'none',
  } as React.CSSProperties,
  searchClear: {
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '0 2px',
    flexShrink: 0,
  } as React.CSSProperties,
  browserInfo: {
    padding: '3px 10px',
    fontSize: '9px',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  effectList: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  } as React.CSSProperties,
  // -- Effect Card -----------------------------------------------------------
  effectCard: (isHovered: boolean) => ({
    display: 'flex',
    alignItems: 'stretch',
    gap: '0',
    padding: '0',
    cursor: 'pointer',
    background: isHovered ? 'var(--bg-raised)' : 'transparent',
    borderBottom: '1px solid var(--border-default)',
    transition: 'background 75ms',
    position: 'relative' as const,
  } as React.CSSProperties),
  effectCardDragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    flexShrink: 0,
    cursor: 'grab',
    color: 'var(--text-muted)',
    fontSize: '9px',
    opacity: 0.5,
    borderRight: '1px solid var(--border-default)',
  } as React.CSSProperties,
  effectCardBody: {
    flex: 1,
    padding: '6px 8px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as React.CSSProperties,
  effectCardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  effectCardIcon: (color: string) => ({
    width: 22,
    height: 22,
    borderRadius: 'var(--radius-sm, 4px)',
    background: `${color}18`,
    border: `1px solid ${color}30`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: color,
    flexShrink: 0,
  } as React.CSSProperties),
  effectCardName: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  effectCardDesc: {
    fontSize: '9.5px',
    color: 'var(--text-muted)',
    lineHeight: '1.3',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  effectCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 6px',
    flexShrink: 0,
  } as React.CSSProperties,
  starBtn: (isFav: boolean) => ({
    fontSize: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: isFav ? '#fbbf24' : 'var(--text-muted)',
    flexShrink: 0,
    padding: '2px',
    lineHeight: 1,
    transition: 'color 100ms',
  } as React.CSSProperties),
  catBadge: (cat: string) => {
    const c = CATEGORY_COLORS[cat] || 'var(--text-muted)';
    return {
      fontSize: '7.5px',
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      padding: '1px 4px',
      borderRadius: '3px',
      background: `${c}22`,
      color: c,
      flexShrink: 0,
    } as React.CSSProperties;
  },
  applyBtn: {
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 100ms',
  } as React.CSSProperties,

  // -- Preset sub-items ------------------------------------------------------
  presetRow: (isHovered: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 8px 3px 50px',
    cursor: 'pointer',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: isHovered ? 'var(--bg-raised)' : 'var(--bg-void)',
    borderBottom: '1px solid var(--border-default)',
    transition: 'background 75ms',
  } as React.CSSProperties),
  presetIcon: {
    fontSize: '8px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  } as React.CSSProperties,
  presetName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  // -- Tooltip (effect preview on hover) ------------------------------------
  tooltip: {
    position: 'fixed' as const,
    zIndex: 10000,
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 4px)',
    padding: '8px 10px',
    maxWidth: 260,
    pointerEvents: 'none' as const,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  } as React.CSSProperties,
  tooltipTitle: {
    fontWeight: 700,
    fontSize: '11px',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  } as React.CSSProperties,
  tooltipDesc: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '6px',
  } as React.CSSProperties,
  tooltipParamList: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.5',
  } as React.CSSProperties,
  tooltipParamLabel: {
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  // -- Right panel (controls) ------------------------------------------------
  controls: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minHeight: 0,
    minWidth: 0,
  } as React.CSSProperties,
  controlsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    height: '32px',
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  } as React.CSSProperties,
  controlsTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  appliedList: {
    borderBottom: '1px solid var(--border-default)',
    maxHeight: 180,
    overflowY: 'auto' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  appliedItem: (isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    cursor: 'pointer',
    background: isSelected ? 'var(--brand-dim, rgba(59,130,246,0.1))' : 'transparent',
    borderBottom: '1px solid var(--border-default)',
    transition: 'background 75ms',
  } as React.CSSProperties),
  dragHandle: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    cursor: 'grab',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  toggleSwitch: (enabled: boolean) => ({
    width: 22,
    height: 12,
    borderRadius: 6,
    background: enabled ? 'var(--brand)' : 'var(--bg-void)',
    border: `1px solid ${enabled ? 'var(--brand)' : 'var(--border-default)'}`,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'all 150ms',
  } as React.CSSProperties),
  toggleDot: (enabled: boolean) => ({
    position: 'absolute' as const,
    top: 1,
    left: enabled ? 11 : 1,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: enabled ? '#fff' : 'var(--text-muted)',
    transition: 'all 150ms',
  } as React.CSSProperties),
  appliedName: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  deleteBtn: {
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '0 2px',
    transition: 'color 100ms',
  } as React.CSSProperties,
  paramSection: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '10px 12px',
  } as React.CSSProperties,
  paramRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  } as React.CSSProperties,
  paramLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    minWidth: 65,
    flexShrink: 0,
  } as React.CSSProperties,
  paramValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    minWidth: 40,
    textAlign: 'right' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  paramSlider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  } as React.CSSProperties,
  paramInput: {
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-xs, 2px)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    padding: '2px 5px',
    outline: 'none',
    width: 50,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  colorInput: {
    width: 24,
    height: 18,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-xs, 2px)',
    padding: 0,
    cursor: 'pointer',
    background: 'none',
  } as React.CSSProperties,
  keyframeDiamond: (active: boolean) => ({
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: active ? 'var(--warning-text)' : 'var(--text-muted)',
    flexShrink: 0,
    padding: 0,
    transition: 'color 100ms',
  } as React.CSSProperties),
  kfBar: {
    height: 32,
    background: 'var(--bg-raised)',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 8px',
    flexShrink: 0,
  } as React.CSSProperties,
  kfTimeline: {
    flex: 1,
    height: 14,
    background: 'var(--bg-void)',
    borderRadius: 'var(--radius-xs, 2px)',
    border: '1px solid var(--border-default)',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  kfDiamond: (position: number) => ({
    position: 'absolute' as const,
    top: '50%',
    left: `${position}%`,
    transform: 'translate(-50%, -50%) rotate(45deg)',
    width: 6,
    height: 6,
    background: 'var(--warning-text)',
    borderRadius: 1,
  } as React.CSSProperties),
  kfNavBtn: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'var(--bg-raised)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-xs, 2px)',
    fontSize: '8px',
    cursor: 'pointer',
  } as React.CSSProperties,
  emptyMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
    padding: 20,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: '8px',
  } as React.CSSProperties,
};

// =============================================================================
//  Category Icon Map (text-based, for the effect card thumbnails)
// =============================================================================

const CATEGORY_ICONS: Record<string, string> = {
  Blur: '\u{1F32B}',
  Color: '\u{1F3A8}',
  Composite: '\u{1F5C2}',
  Keyer: '\u{1F511}',
  Edge: '\u2702',
  Stylize: '\u2728',
  Beauty: '\u2728',
  Film: '\u{1F3AC}',
  Transform: '\u{1F504}',
  Distort: '\u{1F504}',
  Generate: '\u{1F9EA}',
  Audio: '\u{1F3B5}',
  Morph: '\u{1F501}',
  Light: '\u{1F4A1}',
  Warp: '\u{1F300}',
  Particle: '\u2B50',
  Time: '\u23F1',
};

// =============================================================================
//  Category Sidebar Tree
// =============================================================================

interface TreeNodeProps {
  node: CategoryNode;
  depth: number;
  selectedNode: CategoryNode | null;
  onSelect: (node: CategoryNode) => void;
  definitions: EffectDefinition[];
  favorites: string[];
}

const TreeNodeItem = memo(function TreeNodeItem({
  node,
  depth,
  selectedNode,
  onSelect,
  definitions,
  favorites,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!node.children && node.children.length > 0;

  const count = useMemo(() => {
    if (node.virtual === 'favorites') {
      return favorites.length;
    }
    const cats = collectCategories(node);
    return definitions.filter((d) => cats.includes(d.category)).length;
  }, [node, definitions, favorites]);

  const isSelected = selectedNode === node;

  const handleClick = useCallback(() => {
    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
    onSelect(node);
  }, [hasChildren, node, onSelect]);

  return (
    <>
      <div
        style={S.treeNode(isSelected, depth)}
        onClick={handleClick}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {hasChildren ? (
          <span style={S.treeChevron(expanded)}>{'\u25B6'}</span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={S.treeIcon}>{node.icon}</span>
        <span style={S.treeLabel}>{node.label}</span>
        <span style={S.treeCount}>{count}</span>
      </div>
      {hasChildren && expanded && node.children!.map((child) => (
        <TreeNodeItem
          key={child.label}
          node={child}
          depth={depth + 1}
          selectedNode={selectedNode}
          onSelect={onSelect}
          definitions={definitions}
          favorites={favorites}
        />
      ))}
    </>
  );
});

const CategorySidebar = memo(function CategorySidebar({
  selectedNode,
  onSelectNode,
  definitions,
  favorites,
}: {
  selectedNode: CategoryNode | null;
  onSelectNode: (node: CategoryNode | null) => void;
  definitions: EffectDefinition[];
  favorites: string[];
}) {
  return (
    <div style={S.sidebar} role="tree" aria-label="Effect categories">
      <div style={S.sidebarHeader}>Categories</div>
      <div style={S.sidebarTree}>
        {/* "All" root node */}
        <div
          style={S.treeNode(selectedNode === null, 0)}
          onClick={() => onSelectNode(null)}
          role="treeitem"
          aria-selected={selectedNode === null}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectNode(null);
            }
          }}
        >
          <span style={{ width: 12, flexShrink: 0 }} />
          <span style={S.treeIcon}>{'\u{1F4C2}'}</span>
          <span style={S.treeLabel}>All Effects</span>
          <span style={S.treeCount}>{definitions.length}</span>
        </div>

        {CATEGORY_TREE.map((node) => (
          <TreeNodeItem
            key={node.label}
            node={node}
            depth={0}
            selectedNode={selectedNode}
            onSelect={onSelectNode}
            definitions={definitions}
            favorites={favorites}
          />
        ))}
      </div>
    </div>
  );
});

// =============================================================================
//  Effect Preview Tooltip
// =============================================================================

interface TooltipState {
  def: EffectDefinition;
  x: number;
  y: number;
}

const EffectTooltip = memo(function EffectTooltip({ tooltip }: { tooltip: TooltipState }) {
  const { def, x, y } = tooltip;
  const desc = EFFECT_DESCRIPTIONS[def.id] || '';
  const presets = EFFECT_PRESETS[def.id];

  // Position the tooltip to avoid going off screen
  const top = Math.min(y, window.innerHeight - 200);
  const left = x + 16;

  return (
    <div
      style={{
        ...S.tooltip,
        top,
        left: Math.min(left, window.innerWidth - 280),
      }}
    >
      <div style={S.tooltipTitle}>{def.name}</div>
      {desc && <div style={S.tooltipDesc}>{desc}</div>}
      <div style={S.tooltipParamList}>
        <div style={{ marginBottom: 3, color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 600 }}>
          Parameters:
        </div>
        {def.params.slice(0, 6).map((p) => (
          <div key={p.name}>
            <span style={S.tooltipParamLabel}>{p.name}</span>
            {' '}
            <span style={{ color: 'var(--text-muted)' }}>
              ({p.type}{p.min !== undefined ? ` ${p.min}..${p.max}` : ''}{p.unit ? ` ${p.unit}` : ''})
            </span>
          </div>
        ))}
        {def.params.length > 6 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            +{def.params.length - 6} more...
          </div>
        )}
        {presets && presets.length > 0 && (
          <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 600 }}>
            Presets: {presets.map((p) => p.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
});

// =============================================================================
//  Effect Card
// =============================================================================

interface EffectCardProps {
  def: EffectDefinition;
  isFavorite: boolean;
  selectedClipId: string | null;
  onToggleFavorite: (id: string) => void;
  onApply: (defId: string) => void;
  onApplyPreset: (defId: string, preset: EffectPreset) => void;
  onHover: (def: EffectDefinition | null, e?: React.MouseEvent) => void;
  showPresets: boolean;
  onTogglePresets: (defId: string) => void;
}

const EffectCard = memo(function EffectCard({
  def,
  isFavorite,
  selectedClipId,
  onToggleFavorite,
  onApply,
  onApplyPreset,
  onHover,
  showPresets,
  onTogglePresets,
}: EffectCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const color = CATEGORY_COLORS[def.category] || '#888';
  const icon = CATEGORY_ICONS[def.category] || '\u2699';
  const presets = EFFECT_PRESETS[def.id];
  const hasPresets = presets && presets.length > 0;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/x-effect-id', def.id);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [def.id]
  );

  return (
    <>
      <div
        style={S.effectCard(isHovered)}
        onMouseEnter={(e) => { setIsHovered(true); onHover(def, e); }}
        onMouseMove={(e) => { onHover(def, e); }}
        onMouseLeave={() => { setIsHovered(false); onHover(null); }}
        onDoubleClick={() => onApply(def.id)}
        title={selectedClipId ? 'Double-click or click Apply to add to clip' : 'Select a clip first'}
        draggable
        onDragStart={handleDragStart}
      >
        {/* Drag handle */}
        <div style={S.effectCardDragHandle} aria-hidden="true">
          {'\u2630'}
        </div>

        {/* Body */}
        <div style={S.effectCardBody}>
          <div style={S.effectCardTop}>
            <div style={S.effectCardIcon(color)}>
              <span>{icon}</span>
            </div>
            <span style={S.effectCardName}>{def.name}</span>
            <span style={S.catBadge(def.category)}>{def.category}</span>
          </div>
          {EFFECT_DESCRIPTIONS[def.id] && (
            <div style={S.effectCardDesc}>{EFFECT_DESCRIPTIONS[def.id]}</div>
          )}
        </div>

        {/* Actions */}
        <div style={S.effectCardActions}>
          {hasPresets && (
            <button
              style={{
                fontSize: '9px',
                background: showPresets ? 'var(--brand-dim, rgba(59,130,246,0.1))' : 'none',
                border: 'none',
                cursor: 'pointer',
                color: showPresets ? 'var(--brand-bright)' : 'var(--text-muted)',
                padding: '2px 4px',
                borderRadius: '3px',
                transition: 'color 100ms',
              }}
              onClick={(e) => { e.stopPropagation(); onTogglePresets(def.id); }}
              title="Show presets"
              aria-label={`${showPresets ? 'Hide' : 'Show'} presets for ${def.name}`}
            >
              {'\u{1F4CB}'}
            </button>
          )}
          <button
            style={S.starBtn(isFavorite)}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(def.id); }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isFavorite ? `Remove ${def.name} from favorites` : `Add ${def.name} to favorites`}
            aria-pressed={isFavorite}
          >
            {isFavorite ? '\u2605' : '\u2606'}
          </button>
          {selectedClipId && (
            <button
              style={S.applyBtn}
              onClick={(e) => { e.stopPropagation(); onApply(def.id); }}
              title={`Apply ${def.name} to selected clip`}
              aria-label={`Apply ${def.name}`}
            >
              +ADD
            </button>
          )}
        </div>
      </div>

      {/* Presets sub-list */}
      {showPresets && hasPresets && presets!.map((preset) => (
        <PresetRow
          key={preset.name}
          preset={preset}
          defId={def.id}
          selectedClipId={selectedClipId}
          onApply={onApplyPreset}
        />
      ))}
    </>
  );
});

// =============================================================================
//  Preset Row
// =============================================================================

const PresetRow = memo(function PresetRow({
  preset,
  defId,
  selectedClipId,
  onApply,
}: {
  preset: EffectPreset;
  defId: string;
  selectedClipId: string | null;
  onApply: (defId: string, preset: EffectPreset) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={S.presetRow(isHovered)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={() => { if (selectedClipId) onApply(defId, preset); }}
      title={selectedClipId ? `Double-click to apply "${preset.name}" preset` : 'Select a clip first'}
    >
      <span style={S.presetIcon}>{'\u25B8'}</span>
      <span style={S.presetName}>{preset.name}</span>
      {selectedClipId && (
        <button
          style={{
            ...S.applyBtn,
            fontSize: '7px',
            padding: '1px 5px',
          }}
          onClick={(e) => { e.stopPropagation(); onApply(defId, preset); }}
          title={`Apply preset "${preset.name}"`}
          aria-label={`Apply preset ${preset.name}`}
        >
          APPLY
        </button>
      )}
    </div>
  );
});

// =============================================================================
//  Effect Browser (center panel)
// =============================================================================

const AUDIO_EFFECT_CATEGORIES = new Set(['Audio']);

const EffectBrowser = memo(function EffectBrowser({
  selectedNode,
  definitions,
  favorites,
}: {
  selectedNode: CategoryNode | null;
  definitions: EffectDefinition[];
  favorites: string[];
}) {
  const {
    searchQuery,
    setSearch,
    toggleFavorite,
    selectedClipId,
    addEffect,
    updateParam,
  } = useEffectsStore();

  const tracks = useEditorStore((s) => s.tracks);

  // Determine the track type of the currently selected clip so we can filter
  // effects appropriately (audio effects for audio tracks, video effects for video tracks).
  const selectedClipTrackType = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      if (track.clips.some((c) => c.id === selectedClipId)) {
        return track.type;
      }
    }
    return null;
  }, [selectedClipId, tracks]);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [expandedPresets, setExpandedPresets] = useState<Set<string>>(new Set());
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine which engine categories are selected
  const activeCats = useMemo<string[] | null>(() => {
    if (!selectedNode) return null; // All
    if (selectedNode.virtual === 'favorites') return null; // handled separately
    return collectCategories(selectedNode);
  }, [selectedNode]);

  const isFavoritesView = selectedNode?.virtual === 'favorites';

  // Filter definitions
  const filtered = useMemo(() => {
    let list = definitions;

    // Track-type filter: only show effects appropriate for the selected clip's track type.
    // Audio tracks only see Audio effects; video/effect/graphic tracks only see non-Audio effects.
    if (selectedClipTrackType === 'AUDIO') {
      list = list.filter((d) => AUDIO_EFFECT_CATEGORIES.has(d.category));
    } else if (selectedClipTrackType && selectedClipTrackType !== 'SUBTITLE') {
      list = list.filter((d) => !AUDIO_EFFECT_CATEGORIES.has(d.category));
    }

    // Category filter
    if (isFavoritesView) {
      list = list.filter((d) => favorites.includes(d.id));
    } else if (activeCats) {
      list = list.filter((d) => activeCats.includes(d.category));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          (EFFECT_DESCRIPTIONS[d.id] || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [definitions, activeCats, isFavoritesView, favorites, searchQuery, selectedClipTrackType]);

  const handleApply = useCallback(
    (defId: string) => {
      if (selectedClipId) {
        addEffect(selectedClipId, defId);
      }
    },
    [selectedClipId, addEffect]
  );

  const handleApplyPreset = useCallback(
    (defId: string, preset: EffectPreset) => {
      if (!selectedClipId) return;
      addEffect(selectedClipId, defId);
      // The newly added effect becomes selectedEffectId via the store.
      // We need to apply preset params to it. The addEffect sets selectedEffectId.
      // We'll apply params in a microtask so the store has updated.
      setTimeout(() => {
        const state = useEffectsStore.getState();
        const clipFx = state.clipEffects[selectedClipId];
        if (!clipFx || clipFx.length === 0) return;
        const lastFx = clipFx[clipFx.length - 1];
        if (!lastFx || lastFx.definitionId !== defId) return;
        for (const [paramName, value] of Object.entries(preset.params)) {
          updateParam(selectedClipId, lastFx.id, paramName, value);
        }
      }, 0);
    },
    [selectedClipId, addEffect, updateParam]
  );

  const handleHover = useCallback(
    (def: EffectDefinition | null, e?: React.MouseEvent) => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      if (def && e) {
        tooltipTimerRef.current = setTimeout(() => {
          setTooltip({ def, x: e.clientX, y: e.clientY });
        }, 400);
      } else {
        setTooltip(null);
      }
    },
    []
  );

  const handleTogglePresets = useCallback((defId: string) => {
    setExpandedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(defId)) {
        next.delete(defId);
      } else {
        next.add(defId);
      }
      return next;
    });
  }, []);

  // Label for the browser info bar
  const infoLabel = useMemo(() => {
    if (isFavoritesView) return 'Favorites';
    if (!selectedNode) return 'All Effects';
    return selectedNode.label;
  }, [selectedNode, isFavoritesView]);

  return (
    <div style={S.browser} role="region" aria-label="Effects browser">
      {/* Search bar */}
      <div style={S.searchBar}>
        <span style={S.searchIcon} aria-hidden="true">{'\u{1F50D}'}</span>
        <input
          type="text"
          placeholder="Search effects..."
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          style={S.searchInput}
          aria-label="Search effects"
        />
        {searchQuery && (
          <button
            style={S.searchClear}
            onClick={() => setSearch('')}
            aria-label="Clear search"
            title="Clear search"
          >
            {'\u2715'}
          </button>
        )}
      </div>

      {/* Info bar */}
      <div style={S.browserInfo}>
        <span>{infoLabel}</span>
        <span>{filtered.length} effect{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Effect list */}
      <div style={S.effectList} role="listbox" aria-label="Available effects">
        {filtered.map((def) => (
          <EffectCard
            key={def.id}
            def={def}
            isFavorite={favorites.includes(def.id)}
            selectedClipId={selectedClipId}
            onToggleFavorite={toggleFavorite}
            onApply={handleApply}
            onApplyPreset={handleApplyPreset}
            onHover={handleHover}
            showPresets={expandedPresets.has(def.id)}
            onTogglePresets={handleTogglePresets}
          />
        ))}
        {filtered.length === 0 && (
          <div style={S.emptyMessage} role="status">
            {isFavoritesView
              ? 'No favorites yet. Star effects to add them here.'
              : searchQuery
                ? 'No effects match your search.'
                : 'No effects in this category.'}
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && <EffectTooltip tooltip={tooltip} />}
    </div>
  );
});

// =============================================================================
//  Applied Effects List (right panel)
// =============================================================================

function AppliedEffectsList() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    selectEffect,
    toggleEffect,
    removeEffect,
    reorderEffects,
  } = useEffectsStore();

  const effects = selectedClipId ? (clipEffects[selectedClipId] || []) : [];

  const dragIdx = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;

    if (selectedClipId) {
      const newOrder = effects.map((fx) => fx.id);
      const [moved] = newOrder.splice(dragIdx.current, 1);
      newOrder.splice(idx, 0, moved!);
      reorderEffects(selectedClipId, newOrder);
      dragIdx.current = idx;
    }
  }, [effects, selectedClipId, reorderEffects]);

  if (effects.length === 0) {
    return (
      <div style={{ ...S.appliedList, padding: '10px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {selectedClipId ? 'No effects applied. Browse and add effects from the left panel.' : ''}
        </div>
      </div>
    );
  }

  return (
    <div style={S.appliedList}>
      {effects.map((fx, idx) => {
        const def = effectsEngine.getDefinition(fx.definitionId);
        const color = def ? (CATEGORY_COLORS[def.category] || '#888') : '#888';
        return (
          <div
            key={fx.id}
            style={S.appliedItem(selectedEffectId === fx.id)}
            onClick={() => selectEffect(fx.id)}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
          >
            <span style={S.dragHandle} title="Drag to reorder">{'\u2630'}</span>
            <div
              style={S.toggleSwitch(fx.enabled)}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedClipId) toggleEffect(selectedClipId, fx.id);
              }}
              role="switch"
              aria-checked={fx.enabled}
              aria-label={`Toggle ${def?.name || fx.definitionId}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (selectedClipId) toggleEffect(selectedClipId, fx.id);
                }
              }}
            >
              <div style={S.toggleDot(fx.enabled)} />
            </div>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span style={S.appliedName}>{def?.name || fx.definitionId}</span>
            <button
              style={S.deleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedClipId) removeEffect(selectedClipId, fx.id);
              }}
              title="Remove effect"
              aria-label={`Remove ${def?.name || fx.definitionId}`}
            >
              {'\u2715'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
//  Parameter Controls
// =============================================================================

const NumberParam = memo(function NumberParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: number;
  onChange: (v: number) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  const displayValue = typeof value === 'number' ? value.toFixed(paramDef.step && paramDef.step < 1 ? 1 : 0) : value;
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <input
        type="range"
        className="range-slider"
        min={paramDef.min ?? 0}
        max={paramDef.max ?? 100}
        step={paramDef.step ?? 1}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={S.paramSlider}
        aria-label={paramDef.name}
        aria-valuetext={`${displayValue}${paramDef.unit ?? ''}`}
      />
      <span style={S.paramValue} aria-hidden="true">
        {displayValue}
        {paramDef.unit ? paramDef.unit : ''}
      </span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
        aria-label={`${paramDef.name} keyframe: ${hasKeyframe ? 'active' : 'none'}`}
        aria-pressed={hasKeyframe}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
});

const ColorParam = memo(function ColorParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: string;
  onChange: (v: string) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={S.colorInput}
        aria-label={paramDef.name}
      />
      <span style={S.paramValue} aria-hidden="true">{value}</span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
        aria-label={`${paramDef.name} keyframe: ${hasKeyframe ? 'active' : 'none'}`}
        aria-pressed={hasKeyframe}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
});

const BooleanParam = memo(function BooleanParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: boolean;
  onChange: (v: boolean) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <div
        style={S.toggleSwitch(value)}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={paramDef.name}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!value); } }}
      >
        <div style={S.toggleDot(value)} />
      </div>
      <span style={{ ...S.paramValue, flex: 1 }} aria-hidden="true">{value ? 'On' : 'Off'}</span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
        aria-label={`${paramDef.name} keyframe: ${hasKeyframe ? 'active' : 'none'}`}
        aria-pressed={hasKeyframe}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
});

const SelectParam = memo(function SelectParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: string;
  onChange: (v: string) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={paramDef.name}
        style={{
          flex: 1,
          background: 'var(--bg-void)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xs, 2px)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          padding: '2px 4px',
          outline: 'none',
        }}
      >
        {(paramDef.options || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
        aria-label={`${paramDef.name} keyframe: ${hasKeyframe ? 'active' : 'none'}`}
        aria-pressed={hasKeyframe}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
});

function ParameterControls() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    updateParam,
    addKeyframe,
    removeKeyframe,
    currentFrame,
  } = useEffectsStore();

  if (!selectedClipId || !selectedEffectId) {
    return null;
  }

  const effects = clipEffects[selectedClipId] || [];
  const effect = effects.find((e) => e.id === selectedEffectId);
  if (!effect) return null;

  const def = effectsEngine.getDefinition(effect.definitionId);
  if (!def) return null;

  const handleToggleKeyframe = (paramName: string, currentValue: number | string | boolean) => {
    if (!selectedClipId || !selectedEffectId) return;
    const hasKf = effect.keyframes.some(
      (kf) => kf.frame === currentFrame && kf.paramName === paramName
    );
    if (hasKf) {
      removeKeyframe(selectedClipId, selectedEffectId, currentFrame, paramName);
    } else {
      addKeyframe(selectedClipId, selectedEffectId, {
        frame: currentFrame,
        paramName,
        value: currentValue,
        interpolation: 'linear',
      });
    }
  };

  // Check if there are presets for this effect
  const presets = EFFECT_PRESETS[effect.definitionId];

  return (
    <div style={S.paramSection}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={S.sectionTitle}>{def.name} Parameters</div>
      </div>

      {/* Preset quick-apply buttons */}
      {presets && presets.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '3px',
          marginBottom: '8px',
          paddingBottom: '6px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <span style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-muted)',
            alignSelf: 'center',
            marginRight: 2,
          }}>
            Presets:
          </span>
          {presets.map((preset) => (
            <button
              key={preset.name}
              style={{
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '9px',
                fontWeight: 500,
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                background: 'var(--bg-void)',
                color: 'var(--text-secondary)',
                transition: 'all 100ms',
              }}
              onClick={() => {
                for (const [paramName, value] of Object.entries(preset.params)) {
                  updateParam(selectedClipId, selectedEffectId, paramName, value);
                }
              }}
              title={`Apply preset: ${preset.name}`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {def.params.map((paramDef) => {
        const value = effect.params[paramDef.name] ?? paramDef.default;
        const hasKf = effect.keyframes.some(
          (kf) => kf.frame === currentFrame && kf.paramName === paramDef.name
        );

        const onUpdate = (v: number | string | boolean) => {
          if (selectedClipId && selectedEffectId) {
            updateParam(selectedClipId, selectedEffectId, paramDef.name, v);
          }
        };

        const onToggleKf = () => handleToggleKeyframe(paramDef.name, value);

        switch (paramDef.type) {
          case 'number':
            return (
              <NumberParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as number}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'color':
            return (
              <ColorParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as string}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'boolean':
            return (
              <BooleanParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as boolean}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'select':
            return (
              <SelectParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as string}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// =============================================================================
//  Keyframe Bar
// =============================================================================

function KeyframeBar() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    showKeyframes,
    currentFrame,
    setCurrentFrame,
  } = useEffectsStore();

  if (!showKeyframes || !selectedClipId || !selectedEffectId) return null;

  const effects = clipEffects[selectedClipId] || [];
  const effect = effects.find((e) => e.id === selectedEffectId);
  if (!effect || effect.keyframes.length === 0) return null;

  const keyframes = effect.keyframes;
  const maxFrame = Math.max(...keyframes.map((kf) => kf.frame), 100);

  // Navigate between keyframes
  const sortedFrames = [...new Set(keyframes.map((kf) => kf.frame))].sort((a, b) => a - b);

  const goPrev = () => {
    const prev = sortedFrames.filter((f) => f < currentFrame);
    if (prev.length > 0) setCurrentFrame(prev[prev.length - 1]!);
  };

  const goNext = () => {
    const next = sortedFrames.filter((f) => f > currentFrame);
    if (next.length > 0) setCurrentFrame(next[0]!);
  };

  return (
    <div style={S.kfBar}>
      <button style={S.kfNavBtn} onClick={goPrev} title="Previous keyframe">
        {'\u25C0'}
      </button>
      <div style={S.kfTimeline}>
        {keyframes.map((kf, i) => (
          <div
            key={`${kf.frame}-${kf.paramName}-${i}`}
            style={S.kfDiamond((kf.frame / maxFrame) * 100)}
            title={`Frame ${kf.frame}: ${kf.paramName}`}
          />
        ))}
        {/* Current frame indicator */}
        <div style={{
          position: 'absolute' as const,
          top: 0,
          bottom: 0,
          left: `${(currentFrame / maxFrame) * 100}%`,
          width: 1,
          background: 'var(--brand)',
          pointerEvents: 'none' as const,
        }} />
      </div>
      <button style={S.kfNavBtn} onClick={goNext} title="Next keyframe">
        {'\u25B6'}
      </button>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        color: 'var(--text-muted)',
        minWidth: 30,
        textAlign: 'right' as const,
      }}>
        F{currentFrame}
      </span>
    </div>
  );
}

// =============================================================================
//  Main EffectsPanel Component
// =============================================================================

export function EffectsPanel() {
  const { selectedClipId, selectClip, showKeyframes, setShowKeyframes, favorites } = useEffectsStore();
  const { selectedClipIds, tracks } = useEditorStore();

  // Category tree selection state
  const [selectedNode, setSelectedNode] = useState<CategoryNode | null>(null);

  const definitions = useMemo(() => effectsEngine.getDefinitions(), []);

  // Sync selected clip from editor store
  const editorSelectedClipId = selectedClipIds.length > 0 ? selectedClipIds[0] : null;

  React.useEffect(() => {
    if (editorSelectedClipId !== selectedClipId) {
      selectClip(editorSelectedClipId!);
    }
  }, [editorSelectedClipId, selectedClipId, selectClip]);

  // Get clip info
  const clip = editorSelectedClipId
    ? tracks.flatMap((t) => t.clips).find((c) => c.id === editorSelectedClipId)
    : null;

  const controlsContent = clip ? (
    <>
      <div style={S.controlsHeader}>
        <span style={S.controlsTitle}>Applied Effects</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          maxWidth: 120,
        }}>
          {clip.name}
        </span>
        <button
          style={{
            ...S.kfNavBtn,
            background: showKeyframes ? 'var(--brand-dim, rgba(59,130,246,0.1))' : 'var(--bg-raised)',
            color: showKeyframes ? 'var(--brand-bright)' : 'var(--text-secondary)',
            fontSize: '9px',
            width: 22,
            height: 18,
          }}
          onClick={() => setShowKeyframes(!showKeyframes)}
          title="Toggle keyframe bar"
          aria-label={showKeyframes ? 'Hide keyframe bar' : 'Show keyframe bar'}
          aria-pressed={showKeyframes}
        >
          {'\u25C6'}
        </button>
      </div>
      <AppliedEffectsList />
      <ParameterControls />
      <KeyframeBar />
    </>
  ) : (
    <>
      <div style={S.controlsHeader}>
        <span style={S.controlsTitle}>Effects</span>
      </div>
      <div style={S.emptyMessage}>
        Select a clip to view and edit effects
      </div>
    </>
  );

  return (
    <div style={S.root} role="region" aria-label="Effects Panel">
      <CategorySidebar
        selectedNode={selectedNode}
        onSelectNode={setSelectedNode}
        definitions={definitions}
        favorites={favorites}
      />
      <EffectBrowser
        selectedNode={selectedNode}
        definitions={definitions}
        favorites={favorites}
      />
      <div style={S.controls}>
        {controlsContent}
      </div>
    </div>
  );
}
