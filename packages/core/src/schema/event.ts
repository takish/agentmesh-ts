import { z } from "zod";

export const EventType = z.enum([
  "run.created",
  "run.started",
  "step.started",
  "llm.called",
  "llm.responded",
  "tool.requested",
  "tool.completed",
  "policy.checked",
  "step.failed",
  "run.completed",
]);
export type EventType = z.infer<typeof EventType>;

export const ExecutionEvent = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string().nullable().default(null),
  eventType: EventType,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});
export type ExecutionEvent = z.infer<typeof ExecutionEvent>;
