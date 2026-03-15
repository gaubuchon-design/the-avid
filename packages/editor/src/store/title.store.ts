// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Title Tool Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { TitleData } from '../engine/TitleRenderer';

// ─── Types ─────────────────────────────────────────────────────────────────

export type TitleType = 'static' | 'roll' | 'crawl';
export type CrawlDirection = 'left-to-right' | 'right-to-left';

export interface TitleTemplate {
  id: string;
  name: string;
  category: 'lower-third' | 'center-title' | 'end-credits' | 'full-screen' | 'crawl' | 'location' | 'custom';
  data: TitleData;
  /** Title motion type: static, rolling credits, or crawling ticker */
  titleType?: TitleType;
  /** Roll speed in pixels per frame (for roll/crawl types) */
  rollSpeed?: number;
  /** Crawl direction (for crawl type) */
  crawlDirection?: CrawlDirection;
}

export interface QuickTitleTemplate {
  id: string;
  name: string;
  style: 'name-title' | 'location' | 'quote' | 'date';
  /** Primary text field placeholder */
  primaryPlaceholder: string;
  /** Secondary text field placeholder (optional) */
  secondaryPlaceholder?: string;
}

interface TitleState {
  currentTitle: TitleData | null;
  templates: TitleTemplate[];
  isEditing: boolean;
  /** Current title motion type */
  titleType: TitleType;
  /** Roll/crawl speed in pixels per frame */
  rollSpeed: number;
  /** Crawl direction */
  crawlDirection: CrawlDirection;
  /** Whether to show safe zones on the preview */
  showSafeZones: boolean;
}

interface TitleActions {
  setCurrentTitle: (title: TitleData | null) => void;
  updateCurrentTitle: (patch: Partial<TitleData>) => void;
  updateCurrentStyle: (patch: Partial<TitleData['style']>) => void;
  updateCurrentPosition: (patch: Partial<TitleData['position']>) => void;
  loadTemplate: (templateId: string) => void;
  saveAsTemplate: (name: string, category: TitleTemplate['category']) => void;
  setEditing: (editing: boolean) => void;
  setTitleType: (type: TitleType) => void;
  setRollSpeed: (speed: number) => void;
  setCrawlDirection: (dir: CrawlDirection) => void;
  setShowSafeZones: (show: boolean) => void;
}

// ─── Quick Title Templates ─────────────────────────────────────────────────

export const QUICK_TITLE_TEMPLATES: QuickTitleTemplate[] = [
  { id: 'qt-name-title', name: 'Name + Title', style: 'name-title', primaryPlaceholder: 'Speaker Name', secondaryPlaceholder: 'Job Title / Role' },
  { id: 'qt-location', name: 'Location', style: 'location', primaryPlaceholder: 'City, Country', secondaryPlaceholder: 'Optional Details' },
  { id: 'qt-quote', name: 'Quote', style: 'quote', primaryPlaceholder: '"Enter quote here..."', secondaryPlaceholder: '— Attribution' },
  { id: 'qt-date', name: 'Date', style: 'date', primaryPlaceholder: 'March 14, 2026', secondaryPlaceholder: 'Event Name' },
];

// ─── Built-in Templates ────────────────────────────────────────────────────

let nextTemplateId = 100;

const BUILT_IN_TEMPLATES: TitleTemplate[] = [
  {
    id: 'tpl_lower-third',
    name: 'Lower Third — Standard',
    category: 'lower-third',
    titleType: 'static',
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
    id: 'tpl_lower-third-modern',
    name: 'Lower Third — Modern',
    category: 'lower-third',
    titleType: 'static',
    data: {
      text: 'Speaker Name\nSenior Producer',
      style: {
        fontFamily: 'Montserrat, system-ui, sans-serif',
        fontSize: 26,
        fontWeight: 600,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 3,
        opacity: 1,
        textAlign: 'left',
      },
      position: {
        x: 0.04,
        y: 0.80,
        width: 0.42,
        height: 0.10,
      },
      background: {
        type: 'gradient',
        gradientColors: ['rgba(109, 76, 250, 0.90)', 'rgba(109, 76, 250, 0)'],
        opacity: 0.92,
      },
      animation: {
        type: 'slide-up',
        duration: 12,
      },
    },
  },
  {
    id: 'tpl_center-title',
    name: 'Center Title',
    category: 'center-title',
    titleType: 'static',
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
    name: 'End Credits — Roll',
    category: 'end-credits',
    titleType: 'roll',
    rollSpeed: 2,
    data: {
      text: 'Directed by\nJohn Doe\n\nProduced by\nJane Smith\n\nEditor\nAlex Johnson',
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
    titleType: 'static',
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
    titleType: 'static',
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
  {
    id: 'tpl_news-ticker',
    name: 'News Ticker — Crawl',
    category: 'crawl',
    titleType: 'crawl',
    rollSpeed: 3,
    crawlDirection: 'right-to-left',
    data: {
      text: 'BREAKING NEWS: This is a crawling news ticker. Additional information appears here as it scrolls across the screen.',
      style: {
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: undefined,
        shadowBlur: 0,
        opacity: 1,
        textAlign: 'left',
      },
      position: {
        x: 0,
        y: 0.92,
        width: 1,
        height: 0.06,
      },
      background: {
        type: 'solid',
        color: '#cc0000',
        opacity: 0.95,
      },
      animation: {
        type: 'none',
        duration: 0,
      },
    },
  },
  {
    id: 'tpl_location-stamp',
    name: 'Location Stamp',
    category: 'location',
    titleType: 'static',
    data: {
      text: 'New York City\nMarch 14, 2026',
      style: {
        fontFamily: 'Futura, Avenir, system-ui, sans-serif',
        fontSize: 22,
        fontWeight: 500,
        color: '#FFFFFF',
        outlineColor: undefined,
        outlineWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 6,
        opacity: 1,
        textAlign: 'left',
      },
      position: {
        x: 0.04,
        y: 0.85,
        width: 0.35,
        height: 0.08,
      },
      background: {
        type: 'gradient',
        gradientColors: ['rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0)'],
        opacity: 0.8,
      },
      animation: {
        type: 'fade-in',
        duration: 15,
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
    titleType: 'static' as TitleType,
    rollSpeed: 2,
    crawlDirection: 'right-to-left' as CrawlDirection,
    showSafeZones: false,

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
      // Also load title type / roll / crawl settings from template
      s.titleType = template.titleType ?? 'static';
      s.rollSpeed = template.rollSpeed ?? 2;
      s.crawlDirection = template.crawlDirection ?? 'right-to-left';
    }),

    saveAsTemplate: (name, category) => set((s) => {
      if (!s.currentTitle) return;
      const newTemplate: TitleTemplate = {
        id: `tpl_custom_${nextTemplateId++}`,
        name,
        category,
        data: JSON.parse(JSON.stringify(s.currentTitle)),
        titleType: s.titleType,
        rollSpeed: s.rollSpeed,
        crawlDirection: s.crawlDirection,
      };
      s.templates.push(newTemplate);
    }),

    setEditing: (editing) => set((s) => {
      s.isEditing = editing;
    }),

    setTitleType: (type) => set((s) => {
      s.titleType = type;
    }),

    setRollSpeed: (speed) => set((s) => {
      s.rollSpeed = speed;
    }),

    setCrawlDirection: (dir) => set((s) => {
      s.crawlDirection = dir;
    }),

    setShowSafeZones: (show) => set((s) => {
      s.showSafeZones = show;
    }),
  }))
);
