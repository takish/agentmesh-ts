import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  real,
} from "drizzle-orm/pg-core";

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    agentName: text("agent_name").notNull(),
    goal: text("goal").notNull(),
    status: text("status").notNull().default("queued"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_runs_status").on(table.status),
    index("idx_runs_created_at").on(table.createdAt),
    index("idx_runs_agent_name").on(table.agentName),
  ],
);

export const steps = pgTable(
  "steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    inputJson: jsonb("input_json"),
    outputJson: jsonb("output_json"),
    errorJson: jsonb("error_json"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
  },
  (table) => [
    index("idx_steps_run_id").on(table.runId),
    index("idx_steps_status").on(table.status),
  ],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepId: text("step_id"),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_events_run_id").on(table.runId),
    index("idx_events_event_type").on(table.eventType),
    index("idx_events_created_at").on(table.createdAt),
  ],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    toolName: text("tool_name").notNull(),
    inputJson: jsonb("input_json").notNull(),
    outputJson: jsonb("output_json"),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("idx_tool_calls_run_id").on(table.runId),
    index("idx_tool_calls_step_id").on(table.stepId),
    index("idx_tool_calls_tool_name").on(table.toolName),
  ],
);

export const policyDecisions = pgTable(
  "policy_decisions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepId: text("step_id"),
    ruleName: text("rule_name").notNull(),
    allowed: boolean("allowed").notNull(),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    severity: text("severity").notNull().default("info"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_policy_decisions_run_id").on(table.runId),
  ],
);
