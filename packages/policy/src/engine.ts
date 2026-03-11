import type { PolicyDecision, RuleResult } from "@agentmesh/core";
import type { PolicyRule, PolicyContext } from "./types.js";

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  async evaluate(ctx: PolicyContext): Promise<PolicyDecision> {
    const ruleResults: RuleResult[] = [];
    let allowed = true;
    let requiresApproval = false;
    const reasons: string[] = [];

    for (const rule of this.rules) {
      const result = await rule.evaluate(ctx);
      ruleResults.push({
        ruleName: rule.name,
        allowed: result.allowed,
        reason: result.reason,
      });

      if (!result.allowed) {
        allowed = false;
        reasons.push(result.reason);
      }
      if (result.requiresApproval) {
        requiresApproval = true;
      }
    }

    return {
      allowed,
      ruleResults,
      requiresApproval,
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    };
  }
}
