import { z } from "zod";

export const ToolCallStatus = z.enum(["pending", "running", "succeeded", "failed"]);
export type ToolCallStatus = z.infer<typeof ToolCallStatus>;

export const ToolCall = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  status: ToolCallStatus,
  durationMs: z.number().int().nonnegative().nullable().default(null),
});
export type ToolCall = z.infer<typeof ToolCall>;
