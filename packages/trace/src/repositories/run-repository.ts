import { eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { runs } from "../schema.js";

export type RunInsert = typeof runs.$inferInsert;
export type RunSelect = typeof runs.$inferSelect;

export class RunRepository {
  constructor(private db: Database) {}

  async create(run: RunInsert): Promise<RunSelect> {
    const [result] = await this.db.insert(runs).values(run).returning();
    return result;
  }

  async findById(id: string): Promise<RunSelect | undefined> {
    const [result] = await this.db.select().from(runs).where(eq(runs.id, id));
    return result;
  }

  async updateStatus(id: string, status: string, finishedAt?: Date): Promise<void> {
    await this.db
      .update(runs)
      .set({ status, finishedAt: finishedAt ?? null })
      .where(eq(runs.id, id));
  }

  async updateTokensAndCost(
    id: string,
    totalInputTokens: number,
    totalOutputTokens: number,
    estimatedCostUsd: number,
  ): Promise<void> {
    await this.db
      .update(runs)
      .set({ totalInputTokens, totalOutputTokens, estimatedCostUsd })
      .where(eq(runs.id, id));
  }

  async listByStatus(status: string, limit = 50): Promise<RunSelect[]> {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.status, status))
      .orderBy(runs.createdAt)
      .limit(limit);
  }

  async listRecent(limit = 50): Promise<RunSelect[]> {
    return this.db
      .select()
      .from(runs)
      .orderBy(runs.createdAt)
      .limit(limit);
  }
}
