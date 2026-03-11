export type Severity = "info" | "warn" | "block";

export interface PolicyContext {
  toolName: string;
  permissionScope: string;
  sideEffectLevel: string;
  runId: string;
  currentStepCount: number;
  totalCostUsd: number;
}

export interface PolicyRuleResult {
  allowed: boolean;
  requiresApproval?: boolean;
  severity: Severity;
  reason: string;
}

export interface PolicyRule {
  name: string;
  evaluate(ctx: PolicyContext): Promise<PolicyRuleResult>;
}
