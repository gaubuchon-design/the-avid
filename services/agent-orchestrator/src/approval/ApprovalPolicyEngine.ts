/**
 * @module ApprovalPolicyEngine
 * @description Evaluates approval policies to determine whether a given plan
 * step can be auto-executed or requires explicit user confirmation.
 *
 * The engine combines a static {@link ApprovalPolicy} with a list of
 * configurable {@link PolicyRule}s. Rules are evaluated first; if no rule
 * matches, the engine falls back to the policy-level settings.
 */

import type { AgentPlan, AgentStep, ApprovalPolicy } from '../types';
import { DEFAULT_RULES, type PolicyRule } from './PolicyRules';

// ---------------------------------------------------------------------------
// ApprovalPolicyEngine
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a plan step should be auto-approved, require manual
 * approval, or be blocked.
 */
export class ApprovalPolicyEngine {
  private readonly policy: ApprovalPolicy;
  private readonly rules: PolicyRule[];

  /**
   * @param defaultPolicy - Override the built-in default policy.
   * @param rules         - Override the built-in default rules.
   */
  constructor(defaultPolicy?: ApprovalPolicy, rules?: PolicyRule[]) {
    this.policy = defaultPolicy ?? this.getDefaultPolicy();
    this.rules = rules ?? [...DEFAULT_RULES];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Determine whether a step can be auto-approved without user interaction.
   *
   * @param step - The step to evaluate.
   * @param plan - The parent plan (used for token budget checks).
   * @returns `true` if the step may execute automatically.
   */
  shouldAutoApprove(step: AgentStep, plan: AgentPlan): boolean {
    // Dry-run mode never actually executes
    if (plan.approvalPolicy.mode === 'dry-run') {
      return false;
    }

    // Manual mode always requires explicit approval
    if (plan.approvalPolicy.mode === 'manual') {
      return false;
    }

    // Auto-approve mode — check rules and policy
    if (plan.approvalPolicy.mode === 'auto-approve') {
      // Hard require-approval list always wins
      if (plan.approvalPolicy.requireApprovalFor.includes(step.toolName)) {
        return false;
      }

      // Token budget check
      if (plan.tokensUsed >= plan.approvalPolicy.maxAutoTokens) {
        return false;
      }

      // Check configurable rules
      const ruleResult = this.evaluateRules(step);
      if (ruleResult === 'require-approval' || ruleResult === 'block') {
        return false;
      }

      // Explicitly allowed auto-tools
      if (plan.approvalPolicy.allowedAutoTools.includes(step.toolName)) {
        return true;
      }

      // If a rule explicitly approved it, allow
      if (ruleResult === 'approve') {
        return true;
      }

      // Default: require approval for unknown tools
      return false;
    }

    return false;
  }

  /**
   * Determine whether a step requires explicit user approval.
   *
   * This is the inverse of {@link shouldAutoApprove} but also returns `true`
   * for blocked steps (which cannot proceed at all).
   *
   * @param step - The step to evaluate.
   * @returns `true` if the step needs explicit approval or is blocked.
   */
  requiresApproval(step: AgentStep): boolean {
    // Check the require-approval list on the policy
    if (this.policy.requireApprovalFor.includes(step.toolName)) {
      return true;
    }

    // Check rules
    const ruleResult = this.evaluateRules(step);
    if (ruleResult === 'require-approval' || ruleResult === 'block') {
      return true;
    }

    // If the tool is not on the auto-approve list, it requires approval
    if (!this.policy.allowedAutoTools.includes(step.toolName)) {
      // Check if any rule explicitly approved it
      if (ruleResult === 'approve') {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Validate an approval policy for correctness.
   *
   * @param policy - The policy to validate.
   * @returns Validation result with any error messages.
   */
  validatePolicy(policy: ApprovalPolicy): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Mode must be valid
    const validModes: readonly string[] = ['manual', 'auto-approve', 'dry-run'];
    if (!validModes.includes(policy.mode)) {
      errors.push(`Invalid approval mode: "${policy.mode}". Must be one of: ${validModes.join(', ')}.`);
    }

    // Max auto tokens must be non-negative
    if (policy.maxAutoTokens < 0) {
      errors.push(`maxAutoTokens must be non-negative, got ${policy.maxAutoTokens}.`);
    }

    // Tools in requireApprovalFor should not also be in allowedAutoTools
    const overlap = policy.requireApprovalFor.filter((t) =>
      policy.allowedAutoTools.includes(t),
    );
    if (overlap.length > 0) {
      errors.push(
        `Tools cannot be in both allowedAutoTools and requireApprovalFor: ${overlap.join(', ')}.`,
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get the default approval policy.
   *
   * Default: manual mode, no auto-approved tools, destructive operations
   * always require approval, 100-token auto budget.
   *
   * @returns The default {@link ApprovalPolicy}.
   */
  getDefaultPolicy(): ApprovalPolicy {
    return {
      mode: 'manual',
      allowedAutoTools: [],
      requireApprovalFor: [
        'extract',
        'lift',
        'split_clip',
        'overwrite',
        'ripple_trim',
        'export_sequence',
      ],
      maxAutoTokens: 100,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Evaluate the rule chain against a step.
   *
   * @param step - The step to evaluate.
   * @returns The action from the first matching rule, or `null` if none match.
   */
  private evaluateRules(step: AgentStep): 'approve' | 'require-approval' | 'block' | null {
    for (const rule of this.rules) {
      try {
        if (rule.condition(step)) {
          return rule.action;
        }
      } catch {
        // If a rule throws, skip it rather than blocking the pipeline
        console.warn(`[ApprovalPolicyEngine] Rule "${rule.name}" threw an error, skipping.`);
      }
    }
    return null;
  }
}
