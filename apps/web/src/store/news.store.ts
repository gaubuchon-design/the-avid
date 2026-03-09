// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — News Store (N-07)
//  Zustand + Immer store for newsroom workflow state: NRCS connection,
//  rundown management, breaking alerts, playout, and supers queue.
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  NRCSConnection,
  NRCSConnectionStatus,
  NRCSSystemType,
  RundownState,
  RundownEvent,
  StoryStatus,
  BreakingNewsAlert,
  BreakingNewsPriority,
  PlayoutDestination,
  PlayoutJob,
  PlayoutJobStatus,
  SupersData,
  CGTemplate,
} from '@mcua/core';

// ─── Demo Data ─────────────────────────────────────────────────────────────

const DEMO_RUNDOWN_STORIES: RundownEvent[] = [
  {
    id: 'story-001',
    storyId: 'story-001',
    slugline: 'CITY COUNCIL VOTES ON BUDGET',
    scriptText: 'The city council voted late Tuesday to approve a revised budget for fiscal year 2026. {{SUPER: Mayor Jane Torres, City of Portland}} The mayor called it a bipartisan achievement.',
    targetDuration: 90,
    actualDuration: 87,
    assignedEditorId: 'editor-1',
    assignedEditorName: 'Sarah K.',
    mediaItems: [
      { id: 'mi-1', slug: 'council-wide', type: 'VIDEO', duration: 45, status: 'IN_TIMELINE' },
      { id: 'mi-2', slug: 'mayor-sot', type: 'VIDEO', duration: 22, status: 'AVAILABLE' },
    ],
    status: 'IN_EDIT',
    sortOrder: 0,
    pageNumber: 'A1',
    segment: 'A Block',
    presenter: 'Anchor 1',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    locaterText: 'LIVE - City Hall',
  },
  {
    id: 'story-002',
    storyId: 'story-002',
    slugline: 'WEATHER SEVERE STORM WARNING',
    scriptText: 'A severe thunderstorm warning has been issued for the metro area through Wednesday morning. {{SUPER: Meteorologist David Chen, Storm Team 5}} Expect heavy rain and possible flooding in low-lying areas.',
    targetDuration: 60,
    actualDuration: undefined,
    assignedEditorId: 'editor-2',
    assignedEditorName: 'Marcus T.',
    mediaItems: [
      { id: 'mi-3', slug: 'radar-loop', type: 'VIDEO', duration: 15, status: 'AVAILABLE' },
    ],
    status: 'UNASSIGNED',
    sortOrder: 1,
    pageNumber: 'A2',
    segment: 'A Block',
    presenter: 'Anchor 2',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'story-003',
    storyId: 'story-003',
    slugline: 'BREAKING: HIGHWAY PILEUP I-405',
    scriptText: 'A multi-vehicle pileup on I-405 has shut down all northbound lanes near exit 14. {{SUPER: Officer Kim Nguyen, State Police}} First responders are on scene. {{LOCATION: I-405 Northbound}}',
    targetDuration: 120,
    actualDuration: 115,
    assignedEditorId: 'editor-1',
    assignedEditorName: 'Sarah K.',
    mediaItems: [
      { id: 'mi-4', slug: 'chopper-live', type: 'VIDEO', duration: 60, status: 'IN_TIMELINE' },
      { id: 'mi-5', slug: 'officer-sot', type: 'VIDEO', duration: 18, status: 'AVAILABLE' },
      { id: 'mi-6', slug: 'map-graphic', type: 'GRAPHIC', duration: 10, status: 'AVAILABLE' },
    ],
    status: 'READY',
    sortOrder: 2,
    pageNumber: 'B1',
    segment: 'B Block',
    presenter: 'Anchor 1',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    backTime: '18:12:30',
  },
  {
    id: 'story-004',
    storyId: 'story-004',
    slugline: 'TECH COMPANY LAYOFFS',
    scriptText: 'Local tech giant Nexacore announced it will lay off 1,200 employees, roughly 15% of its workforce. {{SUPER: CEO Amanda Roberts, Nexacore Inc.}} The CEO cited shifting market conditions.',
    targetDuration: 75,
    actualDuration: 78,
    assignedEditorId: undefined,
    assignedEditorName: undefined,
    mediaItems: [
      { id: 'mi-7', slug: 'hq-exterior', type: 'VIDEO', duration: 12, status: 'AVAILABLE' },
    ],
    status: 'UNASSIGNED',
    sortOrder: 3,
    pageNumber: 'B2',
    segment: 'B Block',
    presenter: 'Anchor 2',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    id: 'story-005',
    storyId: 'story-005',
    slugline: 'HIGH SCHOOL STATE CHAMPIONSHIP',
    scriptText: 'Lincoln High defeated Roosevelt 28-21 in overtime to claim the state championship. {{SUPER: Coach Mike Patel, Lincoln High}} The winning touchdown came with 12 seconds left.',
    targetDuration: 45,
    actualDuration: 43,
    assignedEditorId: 'editor-2',
    assignedEditorName: 'Marcus T.',
    mediaItems: [
      { id: 'mi-8', slug: 'highlights', type: 'VIDEO', duration: 30, status: 'IN_TIMELINE' },
    ],
    status: 'AIRED',
    sortOrder: 4,
    pageNumber: 'C1',
    segment: 'C Block',
    presenter: 'Sports Anchor',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'story-006',
    storyId: 'story-006',
    slugline: 'KILLED: PARADE STORY',
    scriptText: 'Story killed - parade postponed due to weather.',
    targetDuration: 30,
    actualDuration: undefined,
    assignedEditorId: undefined,
    mediaItems: [],
    status: 'KILLED',
    sortOrder: 5,
    pageNumber: 'C2',
    segment: 'C Block',
    lastModifiedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

const DEMO_RUNDOWN: RundownState = {
  id: 'rundown-evening-news',
  name: 'Evening News 6PM',
  showDate: new Date().toISOString().slice(0, 10),
  stories: DEMO_RUNDOWN_STORIES,
  activeStoryId: 'story-001',
  lastSyncAt: new Date().toISOString(),
};

const DEMO_BREAKING_ALERTS: BreakingNewsAlert[] = [
  {
    id: 'alert-001',
    storyId: 'story-003',
    priority: 'BREAKING',
    alertTime: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    message: 'BREAKING: HIGHWAY PILEUP I-405 - Multiple vehicles involved',
    acknowledged: false,
  },
];

const DEMO_PLAYOUT_DESTINATIONS: PlayoutDestination[] = [
  {
    id: 'dest-airspeed',
    name: 'AirSpeed Primary',
    type: 'AIRSPEED',
    host: 'airspeed-01.newsroom.local',
    port: 21,
    path: '/media/incoming',
    filenamePattern: '{slug}_{date}_{time}.{ext}',
    format: 'MXF_DNXHD',
    protocol: 'FTP',
    isDefault: true,
  },
  {
    id: 'dest-vizark',
    name: 'Viz Ark Archive',
    type: 'VIZ_ARK',
    host: 'vizark.newsroom.local',
    port: 21,
    path: '/archive/stories',
    filenamePattern: '{storyId}_{slug}.{ext}',
    format: 'MXF_DNXHD',
    protocol: 'FTP',
    isDefault: false,
  },
];

// ─── State ─────────────────────────────────────────────────────────────────

interface NewsState {
  // NRCS Connection
  nrcsConnection: NRCSConnection | null;

  // Rundowns
  rundowns: RundownState[];
  activeRundownId: string | null;
  activeStoryId: string | null;

  // Breaking News
  breakingAlerts: BreakingNewsAlert[];

  // Story Timers (storyId -> elapsed seconds)
  storyTimers: Record<string, number>;

  // Playout
  playoutDestinations: PlayoutDestination[];
  playoutJobs: PlayoutJob[];

  // Supers
  supersQueue: SupersData[];
  cgTemplates: CGTemplate[];

  // Polling
  isPolling: boolean;
  pollIntervalMs: number;
  lastError: string | null;

  // UI
  showRundownPanel: boolean;
  showStoryScriptPanel: boolean;
  showBreakingBanner: boolean;
  rundownFilter: 'all' | StoryStatus;
}

interface NewsActions {
  // NRCS Connection
  setNRCSConnection: (connection: NRCSConnection | null) => void;
  setConnectionStatus: (status: NRCSConnectionStatus) => void;

  // Rundowns
  setRundowns: (rundowns: RundownState[]) => void;
  updateRundown: (rundown: RundownState) => void;
  setActiveRundown: (rundownId: string | null) => void;
  setActiveStory: (storyId: string | null) => void;

  // Stories
  updateStory: (rundownId: string, story: RundownEvent) => void;
  insertStory: (rundownId: string, story: RundownEvent, afterStoryId?: string) => void;
  deleteStory: (rundownId: string, storyId: string) => void;
  moveStory: (rundownId: string, storyId: string, newIndex: number) => void;
  setStoryStatus: (storyId: string, status: StoryStatus) => void;

  // Breaking
  addBreakingAlert: (alert: BreakingNewsAlert) => void;
  acknowledgeAlert: (alertId: string) => void;
  acknowledgeAllAlerts: () => void;
  dismissAlert: (alertId: string) => void;

  // Story Timers
  updateStoryTimer: (storyId: string, seconds: number) => void;
  resetStoryTimer: (storyId: string) => void;

  // Playout
  setPlayoutDestinations: (destinations: PlayoutDestination[]) => void;
  addPlayoutJob: (job: PlayoutJob) => void;
  updatePlayoutJob: (jobId: string, patch: Partial<PlayoutJob>) => void;

  // Supers
  addSupers: (supers: SupersData) => void;
  removeSupers: (supersId: string) => void;
  clearSupersQueue: () => void;
  setCGTemplates: (templates: CGTemplate[]) => void;

  // Polling
  setPolling: (active: boolean) => void;
  setPollInterval: (ms: number) => void;
  setLastError: (error: string | null) => void;

  // UI
  toggleRundownPanel: () => void;
  toggleStoryScriptPanel: () => void;
  setShowBreakingBanner: (show: boolean) => void;
  setRundownFilter: (filter: 'all' | StoryStatus) => void;

  // Computed helpers (non-mutating)
  getActiveRundown: () => RundownState | null;
  getActiveStory: () => RundownEvent | null;
  getStoriesByStatus: (status: StoryStatus) => RundownEvent[];
  getUnacknowledgedAlerts: () => BreakingNewsAlert[];
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useNewsStore = create<NewsState & NewsActions>()(
  immer((set, get) => ({
    // Initial state
    nrcsConnection: {
      id: 'demo-nrcs',
      type: 'INEWS' as NRCSSystemType,
      host: 'inews.newsroom.local',
      port: 10540,
      credentials: { username: 'editor', password: '' },
      status: 'CONNECTED' as NRCSConnectionStatus,
      lastConnectedAt: new Date().toISOString(),
    },
    rundowns: [DEMO_RUNDOWN],
    activeRundownId: DEMO_RUNDOWN.id,
    activeStoryId: 'story-001',
    breakingAlerts: DEMO_BREAKING_ALERTS,
    storyTimers: {
      'story-001': 87,
      'story-003': 115,
      'story-005': 43,
    },
    playoutDestinations: DEMO_PLAYOUT_DESTINATIONS,
    playoutJobs: [],
    supersQueue: [],
    cgTemplates: [],
    isPolling: true,
    pollIntervalMs: 10_000,
    lastError: null,
    showRundownPanel: true,
    showStoryScriptPanel: true,
    showBreakingBanner: true,
    rundownFilter: 'all',

    // ─── Actions ─────────────────────────────────────────────────────

    setNRCSConnection: (connection) => set((s) => {
      s.nrcsConnection = connection;
    }),

    setConnectionStatus: (status) => set((s) => {
      if (s.nrcsConnection) {
        s.nrcsConnection.status = status;
        if (status === 'CONNECTED') {
          s.nrcsConnection.lastConnectedAt = new Date().toISOString();
        }
      }
    }),

    setRundowns: (rundowns) => set((s) => {
      s.rundowns = rundowns;
    }),

    updateRundown: (rundown) => set((s) => {
      const idx = s.rundowns.findIndex((r) => r.id === rundown.id);
      if (idx >= 0) {
        s.rundowns[idx] = rundown;
      } else {
        s.rundowns.push(rundown);
      }
    }),

    setActiveRundown: (rundownId) => set((s) => {
      s.activeRundownId = rundownId;
    }),

    setActiveStory: (storyId) => set((s) => {
      s.activeStoryId = storyId;
    }),

    updateStory: (rundownId, story) => set((s) => {
      const rundown = s.rundowns.find((r) => r.id === rundownId);
      if (!rundown) return;
      const idx = rundown.stories.findIndex((st) => st.storyId === story.storyId);
      if (idx >= 0) {
        rundown.stories[idx] = story;
      }
    }),

    insertStory: (rundownId, story, afterStoryId) => set((s) => {
      const rundown = s.rundowns.find((r) => r.id === rundownId);
      if (!rundown) return;
      if (!afterStoryId) {
        rundown.stories.unshift(story);
      } else {
        const idx = rundown.stories.findIndex((st) => st.storyId === afterStoryId);
        if (idx >= 0) {
          rundown.stories.splice(idx + 1, 0, story);
        } else {
          rundown.stories.push(story);
        }
      }
      // Recompute sort orders
      rundown.stories.forEach((st, i) => { st.sortOrder = i; });
    }),

    deleteStory: (rundownId, storyId) => set((s) => {
      const rundown = s.rundowns.find((r) => r.id === rundownId);
      if (!rundown) return;
      rundown.stories = rundown.stories.filter((st) => st.storyId !== storyId);
      rundown.stories.forEach((st, i) => { st.sortOrder = i; });
      if (s.activeStoryId === storyId) {
        s.activeStoryId = null;
      }
    }),

    moveStory: (rundownId, storyId, newIndex) => set((s) => {
      const rundown = s.rundowns.find((r) => r.id === rundownId);
      if (!rundown) return;
      const idx = rundown.stories.findIndex((st) => st.storyId === storyId);
      if (idx < 0) return;
      const [story] = rundown.stories.splice(idx, 1);
      rundown.stories.splice(newIndex, 0, story);
      rundown.stories.forEach((st, i) => { st.sortOrder = i; });
    }),

    setStoryStatus: (storyId, status) => set((s) => {
      for (const rundown of s.rundowns) {
        const story = rundown.stories.find((st) => st.storyId === storyId);
        if (story) {
          story.status = status;
          story.lastModifiedAt = new Date().toISOString();
          return;
        }
      }
    }),

    addBreakingAlert: (alert) => set((s) => {
      s.breakingAlerts.unshift(alert);
      s.showBreakingBanner = true;
    }),

    acknowledgeAlert: (alertId) => set((s) => {
      const alert = s.breakingAlerts.find((a) => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
      }
    }),

    acknowledgeAllAlerts: () => set((s) => {
      for (const alert of s.breakingAlerts) {
        alert.acknowledged = true;
      }
    }),

    dismissAlert: (alertId) => set((s) => {
      s.breakingAlerts = s.breakingAlerts.filter((a) => a.id !== alertId);
      if (s.breakingAlerts.filter((a) => !a.acknowledged).length === 0) {
        s.showBreakingBanner = false;
      }
    }),

    updateStoryTimer: (storyId, seconds) => set((s) => {
      s.storyTimers[storyId] = seconds;
    }),

    resetStoryTimer: (storyId) => set((s) => {
      delete s.storyTimers[storyId];
    }),

    setPlayoutDestinations: (destinations) => set((s) => {
      s.playoutDestinations = destinations;
    }),

    addPlayoutJob: (job) => set((s) => {
      s.playoutJobs.unshift(job);
    }),

    updatePlayoutJob: (jobId, patch) => set((s) => {
      const job = s.playoutJobs.find((j) => j.id === jobId);
      if (job) {
        Object.assign(job, patch);
      }
    }),

    addSupers: (supers) => set((s) => {
      s.supersQueue.push(supers);
    }),

    removeSupers: (supersId) => set((s) => {
      s.supersQueue = s.supersQueue.filter((s2) => s2.id !== supersId);
    }),

    clearSupersQueue: () => set((s) => {
      s.supersQueue = [];
    }),

    setCGTemplates: (templates) => set((s) => {
      s.cgTemplates = templates;
    }),

    setPolling: (active) => set((s) => {
      s.isPolling = active;
    }),

    setPollInterval: (ms) => set((s) => {
      s.pollIntervalMs = Math.max(1000, ms);
    }),

    setLastError: (error) => set((s) => {
      s.lastError = error;
    }),

    toggleRundownPanel: () => set((s) => {
      s.showRundownPanel = !s.showRundownPanel;
    }),

    toggleStoryScriptPanel: () => set((s) => {
      s.showStoryScriptPanel = !s.showStoryScriptPanel;
    }),

    setShowBreakingBanner: (show) => set((s) => {
      s.showBreakingBanner = show;
    }),

    setRundownFilter: (filter) => set((s) => {
      s.rundownFilter = filter;
    }),

    // ─── Computed Helpers ──────────────────────────────────────────

    getActiveRundown: () => {
      const state = get();
      return state.rundowns.find((r) => r.id === state.activeRundownId) ?? null;
    },

    getActiveStory: () => {
      const state = get();
      const rundown = state.rundowns.find((r) => r.id === state.activeRundownId);
      if (!rundown) return null;
      return rundown.stories.find((s) => s.storyId === state.activeStoryId) ?? null;
    },

    getStoriesByStatus: (status) => {
      const state = get();
      const rundown = state.rundowns.find((r) => r.id === state.activeRundownId);
      if (!rundown) return [];
      return rundown.stories.filter((s) => s.status === status);
    },

    getUnacknowledgedAlerts: () => {
      return get().breakingAlerts.filter((a) => !a.acknowledged);
    },
  })),
);
