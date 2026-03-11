import type { PolicyRule, PolicyContext, PolicyRuleResult } from "../types.js";

const DANGEROUS_LEVELS = new Set(["external_write", "system_mutation"]);

export class DangerousActionRule implements PolicyRule {
  name = "dangerous_action";

  constructor(private dangerousLevels: Set<string> = DANGEROUS_LEVELS) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyRuleResult> {
    if (this.dangerousLevels.has(ctx.sideEffectLevel)) {
      return {
        allowed: true,
        requiresApproval: true,
        severity: "warn",
        reason: `Tool "${ctx.toolName}" has side effect level "${ctx.sideEffectLevel}" — approval required`,
      };
    }
    return { allowed: true, severity: "info", reason: "No dangerous action" };
  }
}
