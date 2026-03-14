// ─── AI Store ───────────────────────────────────────────────────────────────
// Zustand store for AI assistant state: chat messages, agent plans,
// transcript search, token accounting, and API configuration.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AgentPlan } from '../ai/AgentEngine';
import type { PhraseFindResult } from '../lib/transcriptWorkbench';
import { getStoreDevtoolsOptions } from '../lib/runtimeEnvironment';

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
  error: string | null;
  tokenBalance: number;
  tokenUsedSession: number;
  activeTab: 'chat' | 'transcript' | 'tools';
  transcriptSearchQuery: string;
  transcriptResults: PhraseFindResult[];
  geminiApiKey: string;
  mcpServerUrl: string;
  streamingText: string;
}

interface AIActions {
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  setCurrentPlan: (plan: AgentPlan | null) => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  deductTokens: (amount: number) => void;
  setActiveTab: (tab: 'chat' | 'transcript' | 'tools') => void;
  setTranscriptSearch: (query: string) => void;
  setTranscriptResults: (results: PhraseFindResult[]) => void;
  clearChat: () => void;
  setGeminiApiKey: (key: string) => void;
  setMCPServerUrl: (url: string) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (chunk: string) => void;
  clearStreamingText: () => void;
  resetStore: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm your AI editing assistant. I can help you trim clips, remove silence, generate captions, create rough cuts, and much more. What would you like to do?",
  timestamp: Date.now() - 60000,
};

const INITIAL_STATE: AIState = {
  messages: [WELCOME_MESSAGE],
  currentPlan: null,
  isProcessing: false,
  error: null,
  tokenBalance: 487,
  tokenUsedSession: 0,
  activeTab: 'chat',
  transcriptSearchQuery: '',
  transcriptResults: [],
  geminiApiKey: '',
  mcpServerUrl: '',
  streamingText: '',
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAIStore = create<AIState & AIActions>()(
  devtools(
    immer((set) => ({
      // Initial state
      ...INITIAL_STATE,

      // Actions
      addMessage: (role, content) =>
        set(
          (s) => {
            s.messages.push({
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              role,
              content,
              timestamp: Date.now(),
            });
            s.error = null;
          },
          false,
          'ai/addMessage'
        ),

      setCurrentPlan: (plan) =>
        set(
          (s) => {
            s.currentPlan = plan;
          },
          false,
          'ai/setCurrentPlan'
        ),

      setProcessing: (processing) =>
        set(
          (s) => {
            s.isProcessing = processing;
            if (processing) {
              s.error = null;
            }
          },
          false,
          'ai/setProcessing'
        ),

      setError: (error) =>
        set(
          (s) => {
            s.error = error;
            s.isProcessing = false;
          },
          false,
          'ai/setError'
        ),

      deductTokens: (amount) =>
        set(
          (s) => {
            s.tokenBalance = Math.max(0, s.tokenBalance - amount);
            s.tokenUsedSession += amount;
          },
          false,
          'ai/deductTokens'
        ),

      setActiveTab: (tab) =>
        set(
          (s) => {
            s.activeTab = tab;
          },
          false,
          'ai/setActiveTab'
        ),

      setTranscriptSearch: (query) =>
        set(
          (s) => {
            s.transcriptSearchQuery = query;
          },
          false,
          'ai/setTranscriptSearch'
        ),

      setTranscriptResults: (results) =>
        set(
          (s) => {
            s.transcriptResults = results;
          },
          false,
          'ai/setTranscriptResults'
        ),

      clearChat: () =>
        set(
          (s) => {
            s.messages = [
              {
                id: 'welcome_cleared',
                role: 'assistant',
                content: 'Chat cleared. How can I help you?',
                timestamp: Date.now(),
              },
            ];
            s.currentPlan = null;
            s.error = null;
            s.streamingText = '';
          },
          false,
          'ai/clearChat'
        ),

      setGeminiApiKey: (key) =>
        set(
          (s) => {
            s.geminiApiKey = key;
          },
          false,
          'ai/setGeminiApiKey'
        ),

      setMCPServerUrl: (url) =>
        set(
          (s) => {
            s.mcpServerUrl = url;
          },
          false,
          'ai/setMCPServerUrl'
        ),

      setStreamingText: (text) =>
        set(
          (s) => {
            s.streamingText = text;
          },
          false,
          'ai/setStreamingText'
        ),

      appendStreamingText: (chunk) =>
        set(
          (s) => {
            s.streamingText += chunk;
          },
          false,
          'ai/appendStreamingText'
        ),

      clearStreamingText: () =>
        set(
          (s) => {
            s.streamingText = '';
          },
          false,
          'ai/clearStreamingText'
        ),

      resetStore: () =>
        set(
          () => ({
            ...INITIAL_STATE,
            messages: [
              {
                ...WELCOME_MESSAGE,
                id: `welcome_${Date.now()}`,
                timestamp: Date.now(),
              },
            ],
          }),
          true,
          'ai/resetStore'
        ),
    })),
    getStoreDevtoolsOptions('AIStore')
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

export const selectAIMessages = (state: AIState & AIActions) => state.messages;
export const selectAICurrentPlan = (state: AIState & AIActions) => state.currentPlan;
export const selectAIIsProcessing = (state: AIState & AIActions) => state.isProcessing;
export const selectAIError = (state: AIState & AIActions) => state.error;
export const selectAITokenBalance = (state: AIState & AIActions) => state.tokenBalance;
export const selectAITokenUsedSession = (state: AIState & AIActions) => state.tokenUsedSession;
export const selectAIActiveTab = (state: AIState & AIActions) => state.activeTab;
export const selectTranscriptSearchQuery = (state: AIState & AIActions) =>
  state.transcriptSearchQuery;
export const selectTranscriptResults = (state: AIState & AIActions) => state.transcriptResults;
export const selectAIStreamingText = (state: AIState & AIActions) => state.streamingText;
export const selectHasTokens = (state: AIState & AIActions) => state.tokenBalance > 0;
export const selectAIMessageCount = (state: AIState & AIActions) => state.messages.length;
export const selectAIIsConfigured = (state: AIState & AIActions) =>
  state.geminiApiKey.length > 0 || state.mcpServerUrl.length > 0;
