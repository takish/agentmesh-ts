import { z } from "zod";

export const StepKind = z.enum([
  "plan",
  "llm_generation",
  "tool_execution",
  "policy_check",
  "finalize",
]);
export type StepKind = z.infer<typeof StepKind>;

export const StepStatus = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatus>;

export const Usage = z.object({
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

export const Step = z.object({
  id: z.string(),
  runId: z.string(),
  index: z.number().int().nonnegative(),
  kind: StepKind,
  status: StepStatus,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().nullable().default(null),
  usage: Usage.nullable().default(null),
});
export type Step = z.infer<typeof Step>;
