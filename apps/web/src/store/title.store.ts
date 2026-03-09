// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Title Tool Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { TitleData } from '../engine/TitleRenderer';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TitleTemplate {
  id: string;
  name: string;
  category: 'lower-third' | 'center-title' | 'end-credits' | 'full-screen' | 'custom';
  data: TitleData;
}

interface TitleState {
  currentTitle: TitleData | null;
  templates: TitleTemplate[];
  isEditing: boolean;
}

interface TitleActions {
  setCurrentTitle: (title: TitleData | null) => void;
  updateCurrentTitle: (patch: Partial<TitleData>) => void;
  updateCurrentStyle: (patch: Partial<TitleData['style']>) => void;
  updateCurrentPosition: (patch: Partial<TitleData['position']>) => void;
  loadTemplate: (templateId: string) => void;
  saveAsTemplate: (name: string, category: TitleTemplate['category']) => void;
  setEditing: (editing: boolean) => void;
}

// ─── Built-in Templates ────────────────────────────────────────────────────

let nextTemplateId = 100;

const BUILT_IN_TEMPLATES: TitleTemplate[] = [
  {
    id: 'tpl_lower-third',
    name: 'Lower Third',
    category: 'lower-third',
    data: {
      text: 'Speaker Name',
      style: {
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: 28,
        fontWeight: 600,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowBlur: 4,
        opacity: 1,
        textAlign: 'left',
      },
      position: {
        x: 0.05,
        y: 0.78,
        width: 0.45,
        height: 0.12,
      },
      background: {
        type: 'gradient',
        gradientColors: ['rgba(0, 0, 0, 0.85)', 'rgba(0, 0, 0, 0)'],
        opacity: 0.9,
      },
      animation: {
        type: 'slide-up',
        duration: 15,
      },
    },
  },
  {
    id: 'tpl_center-title',
    name: 'Center Title',
    category: 'center-title',
    data: {
      text: 'Title Text',
      style: {
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: 72,
        fontWeight: 700,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 8,
        opacity: 1,
        textAlign: 'center',
      },
      position: {
        x: 0.1,
        y: 0.35,
        width: 0.8,
        height: 0.3,
      },
      background: {
        type: 'none',
      },
      animation: {
        type: 'fade-in',
        duration: 20,
      },
    },
  },
  {
    id: 'tpl_end-credits',
    name: 'End Credits Roll',
    category: 'end-credits',
    data: {
      text: 'Directed by\nJohn Doe\n\nProduced by\nJane Smith',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 36,
        fontWeight: 400,
        color: '#E0E0E0',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: undefined,
        shadowBlur: 0,
        opacity: 1,
        textAlign: 'center',
      },
      position: {
        x: 0.15,
        y: 0.2,
        width: 0.7,
        height: 0.6,
      },
      background: {
        type: 'none',
      },
      animation: {
        type: 'fade-in',
        duration: 30,
      },
    },
  },
  {
    id: 'tpl_full-screen',
    name: 'Full-Screen Title Card',
    category: 'full-screen',
    data: {
      text: 'CHAPTER ONE',
      style: {
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: 96,
        fontWeight: 800,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: undefined,
        shadowBlur: 0,
        opacity: 1,
        textAlign: 'center',
      },
      position: {
        x: 0,
        y: 0.3,
        width: 1,
        height: 0.4,
      },
      background: {
        type: 'solid',
        color: '#000000',
        opacity: 1,
      },
      animation: {
        type: 'scale-in',
        duration: 24,
      },
    },
  },
  {
    id: 'tpl_split-name-title',
    name: 'Split Name+Title',
    category: 'lower-third',
    data: {
      text: 'Alex Johnson\nSenior Producer',
      style: {
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: 24,
        fontWeight: 500,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.7)',
        shadowBlur: 3,
        opacity: 1,
        textAlign: 'left',
      },
      position: {
        x: 0.05,
        y: 0.8,
        width: 0.4,
        height: 0.1,
      },
      background: {
        type: 'gradient',
        gradientColors: ['rgba(30, 60, 120, 0.9)', 'rgba(30, 60, 120, 0)'],
        opacity: 0.85,
      },
      animation: {
        type: 'slide-up',
        duration: 12,
      },
    },
  },
];

// ─── Store ─────────────────────────────────────────────────────────────────

export const useTitleStore = create<TitleState & TitleActions>()(
  immer((set, get) => ({
    // State
    currentTitle: null,
    templates: [...BUILT_IN_TEMPLATES],
    isEditing: false,

    // Actions
    setCurrentTitle: (title) => set((s) => {
      s.currentTitle = title;
    }),

    updateCurrentTitle: (patch) => set((s) => {
      if (!s.currentTitle) return;
      Object.assign(s.currentTitle, patch);
    }),

    updateCurrentStyle: (patch) => set((s) => {
      if (!s.currentTitle) return;
      Object.assign(s.currentTitle.style, patch);
    }),

    updateCurrentPosition: (patch) => set((s) => {
      if (!s.currentTitle) return;
      Object.assign(s.currentTitle.position, patch);
    }),

    loadTemplate: (templateId) => set((s) => {
      const template = s.templates.find((t) => t.id === templateId);
      if (!template) return;
      // Deep clone the template data so mutations do not affect the stored template
      s.currentTitle = JSON.parse(JSON.stringify(template.data));
      s.isEditing = true;
    }),

    saveAsTemplate: (name, category) => set((s) => {
      if (!s.currentTitle) return;
      const newTemplate: TitleTemplate = {
        id: `tpl_custom_${nextTemplateId++}`,
        name,
        category,
        data: JSON.parse(JSON.stringify(s.currentTitle)),
      };
      s.templates.push(newTemplate);
    }),

    setEditing: (editing) => set((s) => {
      s.isEditing = editing;
    }),
  }))
);
