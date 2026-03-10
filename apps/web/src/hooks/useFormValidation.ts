// =============================================================================
//  THE AVID -- Form Validation Hook
//  Client-side validation, inline errors, and duplicate submission prevention.
// =============================================================================

import { useState, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ValidationRule<T> = {
  /** Validation function returning an error message or null/undefined if valid. */
  validate: (value: T) => string | null | undefined;
};

export type FieldValidators<T extends Record<string, unknown>> = {
  [K in keyof T]?: ValidationRule<T[K]>[];
};

export interface UseFormValidationReturn<T extends Record<string, unknown>> {
  /** Current field errors (empty string means no error). */
  errors: Partial<Record<keyof T, string>>;
  /** Tracks which fields have been touched/blurred. */
  touched: Partial<Record<keyof T, boolean>>;
  /** Whether the form is currently submitting. */
  isSubmitting: boolean;
  /** Mark a field as touched (typically called on blur). */
  touchField: (field: keyof T) => void;
  /** Validate a single field. Returns the error message or null. */
  validateField: (field: keyof T, value: T[keyof T]) => string | null;
  /** Validate all fields. Returns true if all pass. */
  validateAll: (values: T) => boolean;
  /** Submit handler that validates all fields and prevents duplicate submissions. */
  handleSubmit: (values: T, onSubmit: (values: T) => Promise<void> | void) => Promise<void>;
  /** Reset all errors and touched state. */
  reset: () => void;
  /** Whether any field currently has an error. */
  hasErrors: boolean;
  /** The submit error (if the onSubmit function threw). */
  submitError: string | null;
  /** Clear the submit error. */
  clearSubmitError: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Form validation hook providing field-level validation, touched tracking,
 * and duplicate submission prevention.
 *
 * @param validators - Map of field names to arrays of validation rules
 * @returns Validation state and helper functions
 *
 * @example
 * ```tsx
 * const { errors, touched, touchField, handleSubmit, isSubmitting } = useFormValidation({
 *   email: [
 *     { validate: (v) => !v ? 'Email is required' : null },
 *     { validate: (v) => !v.includes('@') ? 'Invalid email' : null },
 *   ],
 *   password: [
 *     { validate: (v) => !v ? 'Password is required' : null },
 *     { validate: (v) => v.length < 6 ? 'Must be at least 6 characters' : null },
 *   ],
 * });
 * ```
 */
export function useFormValidation<T extends Record<string, unknown>>(
  validators: FieldValidators<T>,
): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const touchField = useCallback((field: keyof T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validateField = useCallback(
    (field: keyof T, value: T[keyof T]): string | null => {
      const rules = validators[field];
      if (!rules) return null;

      for (const rule of rules) {
        const error = rule.validate(value);
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
          return error;
        }
      }

      // Clear field error
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return null;
    },
    [validators],
  );

  const validateAll = useCallback(
    (values: T): boolean => {
      const newErrors: Partial<Record<keyof T, string>> = {};
      let isValid = true;

      for (const field of Object.keys(validators) as Array<keyof T>) {
        const rules = validators[field];
        if (!rules) continue;

        for (const rule of rules) {
          const error = rule.validate(values[field]);
          if (error) {
            newErrors[field] = error;
            isValid = false;
            break;
          }
        }
      }

      setErrors(newErrors);

      // Touch all fields on validation
      const allTouched: Partial<Record<keyof T, boolean>> = {};
      for (const field of Object.keys(validators) as Array<keyof T>) {
        allTouched[field] = true;
      }
      setTouched(allTouched);

      return isValid;
    },
    [validators],
  );

  const handleSubmit = useCallback(
    async (values: T, onSubmit: (values: T) => Promise<void> | void): Promise<void> => {
      // Prevent duplicate submissions
      if (submittingRef.current) return;

      setSubmitError(null);

      if (!validateAll(values)) return;

      submittingRef.current = true;
      setIsSubmitting(true);

      try {
        await onSubmit(values);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Submission failed';
        setSubmitError(message);
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [validateAll],
  );

  const reset = useCallback(() => {
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setSubmitError(null);
    submittingRef.current = false;
  }, []);

  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  const hasErrors = Object.keys(errors).length > 0;

  return {
    errors,
    touched,
    isSubmitting,
    touchField,
    validateField,
    validateAll,
    handleSubmit,
    reset,
    hasErrors,
    submitError,
    clearSubmitError,
  };
}

// ─── Common Validators ──────────────────────────────────────────────────────

export const commonValidators = {
  required: (fieldLabel: string): ValidationRule<unknown> => ({
    validate: (value) => {
      if (value === null || value === undefined) return `${fieldLabel} is required`;
      if (typeof value === 'string' && !value.trim()) return `${fieldLabel} is required`;
      return null;
    },
  }),

  email: (): ValidationRule<string> => ({
    validate: (value) => {
      if (!value) return null; // Skip if empty (use required for that)
      if (!value.includes('@') || !value.includes('.')) return 'Please enter a valid email address';
      return null;
    },
  }),

  minLength: (min: number, fieldLabel?: string): ValidationRule<string> => ({
    validate: (value) => {
      if (!value) return null;
      if (value.length < min)
        return `${fieldLabel ?? 'Field'} must be at least ${min} characters`;
      return null;
    },
  }),

  maxLength: (max: number, fieldLabel?: string): ValidationRule<string> => ({
    validate: (value) => {
      if (!value) return null;
      if (value.length > max)
        return `${fieldLabel ?? 'Field'} must be at most ${max} characters`;
      return null;
    },
  }),

  match: (otherValue: () => string, fieldLabel: string): ValidationRule<string> => ({
    validate: (value) => {
      if (!value) return null;
      if (value !== otherValue()) return `${fieldLabel} do not match`;
      return null;
    },
  }),

  /** Validate a numeric value is within range, handling NaN/Infinity. */
  numericRange: (min: number, max: number, fieldLabel?: string): ValidationRule<number> => ({
    validate: (value) => {
      if (!Number.isFinite(value)) return `${fieldLabel ?? 'Value'} must be a valid number`;
      if (value < min || value > max)
        return `${fieldLabel ?? 'Value'} must be between ${min} and ${max}`;
      return null;
    },
  }),
};
