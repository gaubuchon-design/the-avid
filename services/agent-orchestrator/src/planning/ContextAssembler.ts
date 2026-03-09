/**
 * @module ContextAssembler
 * @description Builds prompt context from various editing-state sources so the
 * LLM has a concise, relevant view of the user's current editing session.
 */

import type { AgentContext, ToolDefinition } from '../types';

/**
 * Assembles textual context summaries from structured editing state.
 *
 * The assembled text is injected into the Gemini system prompt alongside the
 * user intent so the plan generator can produce contextually relevant steps.
 */
export class ContextAssembler {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Build a concise text summary of the current editing context suitable for
   * inclusion in a prompt.
   *
   * @param context - Structured editing context snapshot.
   * @returns A newline-delimited text block.
   */
  assemble(context: AgentContext): string {
    const sections: string[] = [];

    sections.push(`Project: ${context.projectId}`);

    if (context.sequenceId) {
      sections.push(`Active sequence: ${context.sequenceId}`);
    }

    if (context.binIds && context.binIds.length > 0) {
      sections.push(`Visible bins: ${context.binIds.join(', ')}`);
    }

    if (context.selectedClipIds && context.selectedClipIds.length > 0) {
      sections.push(`Selected clips: ${context.selectedClipIds.join(', ')}`);
    }

    if (context.playheadTime !== undefined) {
      sections.push(`Playhead position: ${this.formatTimecode(context.playheadTime)}`);
    }

    if (context.searchQuery) {
      sections.push(`Active search: "${context.searchQuery}"`);
    }

    if (context.transcriptContext) {
      const truncated = this.truncateToFit(context.transcriptContext, 500);
      sections.push(`Transcript context:\n${truncated}`);
    }

    return sections.join('\n');
  }

  /**
   * Format tool definitions into a concise text block suitable for a prompt.
   *
   * @param tools - Array of tool definitions.
   * @returns Formatted tool listing.
   */
  assembleToolContext(tools: ToolDefinition[]): string {
    if (tools.length === 0) {
      return 'No tools available.';
    }

    const lines = tools.map((tool) => {
      const params = Object.entries(tool.parameters)
        .map(([name, param]) => {
          const req = param.required ? ' (required)' : '';
          return `    - ${name}: ${param.type}${req} — ${param.description}`;
        })
        .join('\n');

      return `- ${tool.name}: ${tool.description}\n  Adapter: ${tool.adapter} | Cost: ~${tool.tokenCost} tokens | Confirmation: ${tool.requiresConfirmation ? 'yes' : 'no'}\n  Parameters:\n${params}`;
    });

    return `Available tools (${tools.length}):\n${lines.join('\n\n')}`;
  }

  /**
   * Rough token count estimate.
   *
   * Uses the common heuristic of ~0.75 words per token for English text.
   *
   * @param text - Input text.
   * @returns Estimated token count.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return Math.ceil(wordCount / 0.75);
  }

  /**
   * Truncate text to fit within a maximum token budget.
   *
   * @param text     - Input text.
   * @param maxTokens - Maximum allowed tokens.
   * @returns Truncated text with an ellipsis marker if shortened.
   */
  truncateToFit(text: string, maxTokens: number): string {
    if (!text) return '';

    const estimatedTokens = this.estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // Approximate words for the target token count
    const targetWords = Math.floor(maxTokens * 0.75);
    const words = text.split(/\s+/);
    return words.slice(0, targetWords).join(' ') + ' [...]';
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Format seconds into a human-readable timecode string (HH:MM:SS.ff).
   *
   * @param seconds - Time in seconds.
   * @returns Formatted timecode.
   */
  private formatTimecode(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.round((seconds % 1) * 30); // Assume 30fps for frame display

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
  }
}
