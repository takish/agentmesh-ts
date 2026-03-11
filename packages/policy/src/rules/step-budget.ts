import type { PolicyRule, PolicyContext, PolicyRuleResult } from "../types.js";

export class StepBudgetRule implements PolicyRule {
  name = "step_budget";

  constructor(private maxSteps: number) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyRuleResult> {
    if (ctx.currentStepCount < this.maxSteps) {
      return { allowed: true, severity: "info", reason: "Within step budget" };
    }
    return {
      allowed: false,
      severity: "block",
      reason: `Step budget exceeded: ${ctx.currentStepCount} >= ${this.maxSteps}`,
    };
  }
}
