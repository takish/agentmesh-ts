import { z } from "zod";

export const RuleResult = z.object({
  ruleName: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
});
export type RuleResult = z.infer<typeof RuleResult>;

export const PolicyDecision = z.object({
  allowed: z.boolean(),
  ruleResults: z.array(RuleResult),
  requiresApproval: z.boolean(),
  reason: z.string().optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecision>;
