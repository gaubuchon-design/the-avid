import React, {
  forwardRef,
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
  type KeyboardEvent,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptSuggestion {
  /** Unique key for the suggestion. */
  id: string;
  /** Display text shown in the suggestion list. */
  label: string;
  /** Optional description shown below the label. */
  description?: string;
  /** Value inserted when the suggestion is accepted. */
  value: string;
}

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
  /** Suggestions to show in a dropdown beneath the input. */
  suggestions?: PromptSuggestion[];
  /** Called when the text value changes (for external suggestion filtering). */
  onTextChange?: (text: string) => void;
  /** Maximum character count (displays counter when set). */
  maxLength?: number;
  /** Additional CSS class(es) to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge base and optional extra class names. */
function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Universal prompt bar for agentic editing. Provides a text input with
 * submit, optional voice trigger, processing state, suggestion dropdown,
 * character counting, and context display.
 *
 * Keyboard shortcuts:
 * - Enter: submit
 * - Shift+Enter: newline
 * - Escape: clear input or close suggestions
 * - ArrowDown/ArrowUp: navigate suggestions
 */
export const PromptBar = memo(forwardRef<HTMLDivElement, PromptBarProps>(
  function PromptBar(
    {
      onSubmit,
      onVoiceTrigger,
      placeholder = 'Describe what you want to do\u2026',
      isProcessing = false,
      disabled = false,
      contextPill,
      suggestions,
      onTextChange,
      maxLength,
      className,
    },
    ref,
  ) {
    const [text, setText] = useState('');
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const suggestionsRef = useRef<HTMLUListElement>(null);
    const liveRegionRef = useRef<HTMLDivElement>(null);

    const hasSuggestions =
      suggestions !== undefined && suggestions.length > 0;

    // Show suggestions when there are items and text is non-empty
    useEffect(() => {
      setShowSuggestions(hasSuggestions && text.length > 0);
      setActiveSuggestionIndex(-1);
    }, [hasSuggestions, text]);

    // Announce submission status to screen readers
    useEffect(() => {
      if (hasSubmitted) {
        const timer = setTimeout(() => setHasSubmitted(false), 2000);
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [hasSubmitted]);

    const announce = useCallback((message: string) => {
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = message;
      }
    }, []);

    const handleSubmit = useCallback(() => {
      const trimmed = text.trim();
      if (!trimmed || isProcessing || disabled) return;
      if (maxLength !== undefined && trimmed.length > maxLength) return;
      onSubmit(trimmed);
      setText('');
      setShowSuggestions(false);
      setHasSubmitted(true);
      announce('Prompt submitted');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, [text, isProcessing, disabled, maxLength, onSubmit, announce]);

    const acceptSuggestion = useCallback(
      (suggestion: PromptSuggestion) => {
        setText(suggestion.value);
        onTextChange?.(suggestion.value);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        announce(`Selected suggestion: ${suggestion.label}`);
        textareaRef.current?.focus();
      },
      [onTextChange, announce],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Suggestion navigation
        if (showSuggestions && suggestions && suggestions.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex((prev) => {
              const next =
                prev < suggestions.length - 1 ? prev + 1 : 0;
              return next;
            });
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex((prev) => {
              const next =
                prev > 0 ? prev - 1 : suggestions.length - 1;
              return next;
            });
            return;
          }
          if (
            e.key === 'Enter' &&
            !e.shiftKey &&
            activeSuggestionIndex >= 0
          ) {
            e.preventDefault();
            const selected = suggestions[activeSuggestionIndex];
            if (selected) {
              acceptSuggestion(selected);
            }
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
            return;
          }
        }

        // Submit on Enter (without shift)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
          return;
        }

        // Escape to clear input (when no suggestions shown)
        if (e.key === 'Escape') {
          e.preventDefault();
          if (text.length > 0) {
            setText('');
            onTextChange?.('');
            announce('Input cleared');
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
          }
        }
      },
      [
        showSuggestions,
        suggestions,
        activeSuggestionIndex,
        acceptSuggestion,
        handleSubmit,
        text,
        onTextChange,
        announce,
      ],
    );

    const handleInput = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget;
        setText(el.value);
        onTextChange?.(el.value);
        // Auto-resize textarea
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      },
      [onTextChange],
    );

    const isDisabled = disabled || isProcessing;
    const isOverLimit =
      maxLength !== undefined && text.length > maxLength;
    const canSubmit = text.trim().length > 0 && !isOverLimit;
    const suggestionListId = 'prompt-bar-suggestions';
    const activeSuggestionId =
      activeSuggestionIndex >= 0
        ? `prompt-suggestion-${activeSuggestionIndex}`
        : undefined;

    return (
      <div
        ref={ref}
        className={cx(
          'prompt-bar',
          isProcessing && 'prompt-bar--processing',
          hasSubmitted && 'prompt-bar--submitted',
          className,
        )}
        role="search"
        aria-label="Agent prompt"
      >
        {/* Live region for screen reader announcements */}
        <div
          ref={liveRegionRef}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        />

        {contextPill && (
          <span
            className="prompt-bar-context"
            aria-label={`Context: ${contextPill.label}`}
          >
            <span className="prompt-bar-context-type">
              {contextPill.type}
            </span>
            <span className="prompt-bar-context-label">
              {contextPill.label}
            </span>
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="1" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="8" y1="21" x2="16" y2="21" />
              </svg>
            </button>
          )}

          <div className="prompt-bar-input-wrap">
            <textarea
              ref={textareaRef}
              className={cx(
                'prompt-bar-input',
                isOverLimit && 'prompt-bar-input--over-limit',
              )}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (hasSuggestions && text.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay hiding to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              placeholder={placeholder}
              disabled={isDisabled}
              rows={1}
              aria-label="Prompt input"
              aria-autocomplete={hasSuggestions ? 'list' : undefined}
              aria-controls={
                showSuggestions ? suggestionListId : undefined
              }
              aria-activedescendant={activeSuggestionId}
              aria-invalid={isOverLimit || undefined}
              aria-describedby={
                maxLength !== undefined
                  ? 'prompt-bar-char-info'
                  : undefined
              }
            />

            {/* Suggestion dropdown */}
            {showSuggestions && suggestions && suggestions.length > 0 && (
              <ul
                ref={suggestionsRef}
                id={suggestionListId}
                className="prompt-bar-suggestions"
                role="listbox"
                aria-label="Suggestions"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={s.id}
                    id={`prompt-suggestion-${i}`}
                    className={cx(
                      'prompt-bar-suggestion',
                      i === activeSuggestionIndex &&
                        'prompt-bar-suggestion--active',
                    )}
                    role="option"
                    aria-selected={i === activeSuggestionIndex}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur
                      acceptSuggestion(s);
                    }}
                    onMouseEnter={() => setActiveSuggestionIndex(i)}
                  >
                    <span className="prompt-bar-suggestion-label">
                      {s.label}
                    </span>
                    {s.description && (
                      <span className="prompt-bar-suggestion-desc">
                        {s.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isProcessing ? (
            <span
              className="prompt-bar-processing"
              role="status"
              aria-label="Processing"
            >
              <svg
                className="prompt-bar-spinner"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="28"
                  strokeDashoffset="8"
                />
              </svg>
            </span>
          ) : (
            <button
              type="button"
              className={cx(
                'prompt-bar-submit',
                canSubmit && !isDisabled && 'prompt-bar-submit--ready',
              )}
              onClick={handleSubmit}
              disabled={isDisabled || !canSubmit}
              aria-label="Submit prompt"
              title="Submit (Enter)"
            >
              {/* Send arrow icon */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>

        {/* Character count */}
        {maxLength !== undefined && (
          <span
            id="prompt-bar-char-info"
            className={cx(
              'prompt-bar-char-count',
              isOverLimit && 'prompt-bar-char-count--over',
            )}
            aria-live="polite"
          >
            {text.length}/{maxLength}
          </span>
        )}
      </div>
    );
  },
));
