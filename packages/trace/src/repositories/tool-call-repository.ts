import { eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { toolCalls } from "../schema.js";

export type ToolCallInsert = typeof toolCalls.$inferInsert;
export type ToolCallSelect = typeof toolCalls.$inferSelect;

export class ToolCallRepository {
  constructor(private db: Database) {}

  async create(toolCall: ToolCallInsert): Promise<ToolCallSelect> {
    const [result] = await this.db.insert(toolCalls).values(toolCall).returning();
    return result;
  }

  async createMany(items: ToolCallInsert[]): Promise<ToolCallSelect[]> {
    if (items.length === 0) return [];
    return this.db.insert(toolCalls).values(items).returning();
  }

  async updateStatus(id: string, status: string, outputJson: unknown, durationMs: number, finishedAt: Date): Promise<void> {
    await this.db
      .update(toolCalls)
      .set({ status, outputJson, durationMs, finishedAt })
      .where(eq(toolCalls.id, id));
  }

  async listByRunId(runId: string): Promise<ToolCallSelect[]> {
    return this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.runId, runId));
  }

  async listByStepId(stepId: string): Promise<ToolCallSelect[]> {
    return this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.stepId, stepId));
  }
}
