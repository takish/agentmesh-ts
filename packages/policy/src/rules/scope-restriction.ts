import type { PolicyRule, PolicyContext, PolicyRuleResult } from "../types.js";

export class ScopeRestrictionRule implements PolicyRule {
  name = "scope_restriction";

  constructor(private allowedScopes: Set<string>) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyRuleResult> {
    if (this.allowedScopes.has(ctx.permissionScope)) {
      return { allowed: true, severity: "info", reason: "Scope is allowed" };
    }
    return {
      allowed: false,
      severity: "block",
      reason: `Scope "${ctx.permissionScope}" is not permitted`,
    };
  }
}
