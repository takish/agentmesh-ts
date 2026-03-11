import type { PolicyRule, PolicyContext, PolicyRuleResult } from "../types.js";

export class ToolAllowlistRule implements PolicyRule {
  name = "tool_allowlist";

  constructor(private allowedTools: Set<string>) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyRuleResult> {
    if (this.allowedTools.has(ctx.toolName)) {
      return { allowed: true, severity: "info", reason: "Tool is allowed" };
    }
    return {
      allowed: false,
      severity: "block",
      reason: `Tool "${ctx.toolName}" is not in the allowlist`,
    };
  }
}
