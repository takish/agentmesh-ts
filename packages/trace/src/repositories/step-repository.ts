import { eq, and } from "drizzle-orm";
import type { Database } from "../db.js";
import { steps } from "../schema.js";

export type StepInsert = typeof steps.$inferInsert;
export type StepSelect = typeof steps.$inferSelect;

export class StepRepository {
  constructor(private db: Database) {}

  async create(step: StepInsert): Promise<StepSelect> {
    const [result] = await this.db.insert(steps).values(step).returning();
    return result;
  }

  async findById(id: string): Promise<StepSelect | undefined> {
    const [result] = await this.db.select().from(steps).where(eq(steps.id, id));
    return result;
  }

  async updateStatus(id: string, status: string, finishedAt?: Date): Promise<void> {
    await this.db
      .update(steps)
      .set({ status, finishedAt: finishedAt ?? null })
      .where(eq(steps.id, id));
  }

  async updateUsage(
    id: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
  ): Promise<void> {
    await this.db
      .update(steps)
      .set({ inputTokens, outputTokens, costUsd })
      .where(eq(steps.id, id));
  }

  async listByRunId(runId: string): Promise<StepSelect[]> {
    return this.db
      .select()
      .from(steps)
      .where(eq(steps.runId, runId))
      .orderBy(steps.stepIndex);
  }

  async findByRunIdAndIndex(runId: string, stepIndex: number): Promise<StepSelect | undefined> {
    const [result] = await this.db
      .select()
      .from(steps)
      .where(and(eq(steps.runId, runId), eq(steps.stepIndex, stepIndex)));
    return result;
  }
}
