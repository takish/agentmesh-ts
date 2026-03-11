import { z } from "zod";

export const RunStatus = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "waiting_child_runs",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Run = z.object({
  id: z.string(),
  status: RunStatus,
  agentName: z.string(),
  goal: z.string(),
  provider: z.string(),
  model: z.string(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  totalTokensInput: z.number().int().nonnegative(),
  totalTokensOutput: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  parentRunId: z.string().nullable().default(null),
  workflowId: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Run = z.infer<typeof Run>;
