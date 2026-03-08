// ─── AI Store ───────────────────────────────────────────────────────────────
// Zustand store for AI assistant state: chat messages, agent plans,
// transcript search, token accounting, and API configuration.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AgentPlan } from '../ai/AgentEngine';
import type { PhraseSearchResult } from '../ai/TranscriptEngine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AIState {
  messages: ChatMessage[];
  currentPlan: AgentPlan | null;
  isProcessing: boolean;
  tokenBalance: number;
  tokenUsedSession: number;
  activeTab: 'chat' | 'transcript' | 'tools';
  transcriptSearchQuery: string;
  transcriptResults: PhraseSearchResult[];
  geminiApiKey: string;
  mcpServerUrl: string;
  streamingText: string;
}

interface AIActions {
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  setCurrentPlan: (plan: AgentPlan | null) => void;
  setProcessing: (processing: boolean) => void;
  deductTokens: (amount: number) => void;
  setActiveTab: (tab: 'chat' | 'transcript' | 'tools') => void;
  setTranscriptSearch: (query: string) => void;
  setTranscriptResults: (results: PhraseSearchResult[]) => void;
  clearChat: () => void;
  setGeminiApiKey: (key: string) => void;
  setMCPServerUrl: (url: string) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (chunk: string) => void;
  clearStreamingText: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAIStore = create<AIState & AIActions>()(
  immer((set) => ({
    // Initial state
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Hello! I\'m your AI editing assistant. I can help you trim clips, remove silence, generate captions, create rough cuts, and much more. What would you like to do?',
        timestamp: Date.now() - 60000,
      },
    ],
    currentPlan: null,
    isProcessing: false,
    tokenBalance: 487,
    tokenUsedSession: 0,
    activeTab: 'chat',
    transcriptSearchQuery: '',
    transcriptResults: [],
    geminiApiKey: '',
    mcpServerUrl: '',
    streamingText: '',

    // Actions
    addMessage: (role, content) => set((s) => {
      s.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role,
        content,
        timestamp: Date.now(),
      });
    }),

    setCurrentPlan: (plan) => set((s) => {
      s.currentPlan = plan;
    }),

    setProcessing: (processing) => set((s) => {
      s.isProcessing = processing;
    }),

    deductTokens: (amount) => set((s) => {
      s.tokenBalance = Math.max(0, s.tokenBalance - amount);
      s.tokenUsedSession += amount;
    }),

    setActiveTab: (tab) => set((s) => {
      s.activeTab = tab;
    }),

    setTranscriptSearch: (query) => set((s) => {
      s.transcriptSearchQuery = query;
    }),

    setTranscriptResults: (results) => set((s) => {
      s.transcriptResults = results;
    }),

    clearChat: () => set((s) => {
      s.messages = [{
        id: 'welcome_cleared',
        role: 'assistant',
        content: 'Chat cleared. How can I help you?',
        timestamp: Date.now(),
      }];
      s.currentPlan = null;
    }),

    setGeminiApiKey: (key) => set((s) => {
      s.geminiApiKey = key;
    }),

    setMCPServerUrl: (url) => set((s) => {
      s.mcpServerUrl = url;
    }),

    setStreamingText: (text) => set((s) => {
      s.streamingText = text;
    }),

    appendStreamingText: (chunk) => set((s) => {
      s.streamingText += chunk;
    }),

    clearStreamingText: () => set((s) => {
      s.streamingText = '';
    }),
  }))
);
