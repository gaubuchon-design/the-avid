import React, { forwardRef, useState, useRef, useCallback, type KeyboardEvent } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptBarProps {
  /** Called with the submitted text when the user presses Enter or clicks submit. */
  onSubmit: (text: string) => void;
  /** Optional callback to trigger voice input mode. */
  onVoiceTrigger?: () => void;
  /** Placeholder text for the input field. */
  placeholder?: string;
  /** Displays a loading spinner and disables input when true. */
  isProcessing?: boolean;
  /** Disables the entire prompt bar. */
  disabled?: boolean;
  /** Displays a context pill next to the input. */
  contextPill?: { type: string; label: string };
  /** Additional CSS class(es) to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge base and optional extra class names. */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Universal prompt bar for agentic editing. Provides a text input with
 * submit, optional voice trigger, processing state, and context display.
 *
 * Keyboard shortcuts:
 * - Enter: submit
 * - Shift+Enter: newline
 */
export const PromptBar = forwardRef<HTMLDivElement, PromptBarProps>(
  function PromptBar(
    {
      onSubmit,
      onVoiceTrigger,
      placeholder = 'Describe what you want to do\u2026',
      isProcessing = false,
      disabled = false,
      contextPill,
      className,
    },
    ref,
  ) {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = useCallback(() => {
      const trimmed = text.trim();
      if (!trimmed || isProcessing || disabled) return;
      onSubmit(trimmed);
      setText('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, [text, isProcessing, disabled, onSubmit]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit],
    );

    const handleInput = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget;
        setText(el.value);
        // Auto-resize textarea
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      },
      [],
    );

    const isDisabled = disabled || isProcessing;

    return (
      <div ref={ref} className={cx('prompt-bar', className)} role="search" aria-label="Agent prompt">
        {contextPill && (
          <span className="prompt-bar-context" aria-label={`Context: ${contextPill.label}`}>
            <span className="prompt-bar-context-type">{contextPill.type}</span>
            <span className="prompt-bar-context-label">{contextPill.label}</span>
          </span>
        )}

        <div className="prompt-bar-input-row">
          {onVoiceTrigger && (
            <button
              type="button"
              className="prompt-bar-voice"
              onClick={onVoiceTrigger}
              disabled={isDisabled}
              aria-label="Voice input"
              title="Voice input"
            >
              {/* Microphone icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="1" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="8" y1="21" x2="16" y2="21" />
              </svg>
            </button>
          )}

          <textarea
            ref={textareaRef}
            className="prompt-bar-input"
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            aria-label="Prompt input"
          />

          {isProcessing ? (
            <span className="prompt-bar-processing" role="status" aria-label="Processing">
              <svg className="prompt-bar-spinner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
              </svg>
            </span>
          ) : (
            <button
              type="button"
              className="prompt-bar-submit"
              onClick={handleSubmit}
              disabled={isDisabled || !text.trim()}
              aria-label="Submit prompt"
              title="Submit (Enter)"
            >
              {/* Send arrow icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  },
);
