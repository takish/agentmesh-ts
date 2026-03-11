import type { PolicyRule, PolicyContext, PolicyRuleResult } from "../types.js";

export class CostBudgetRule implements PolicyRule {
  name = "cost_budget";

  constructor(private maxCostUsd: number) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyRuleResult> {
    if (ctx.totalCostUsd < this.maxCostUsd) {
      return { allowed: true, severity: "info", reason: "Within cost budget" };
    }
    return {
      allowed: false,
      severity: "block",
      reason: `Cost budget exceeded: $${ctx.totalCostUsd.toFixed(4)} >= $${this.maxCostUsd.toFixed(4)}`,
    };
  }
}
