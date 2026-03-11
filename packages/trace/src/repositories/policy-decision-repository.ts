import { eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { policyDecisions } from "../schema.js";

export type PolicyDecisionInsert = typeof policyDecisions.$inferInsert;
export type PolicyDecisionSelect = typeof policyDecisions.$inferSelect;

export class PolicyDecisionRepository {
  constructor(private db: Database) {}

  async create(decision: PolicyDecisionInsert): Promise<PolicyDecisionSelect> {
    const [result] = await this.db.insert(policyDecisions).values(decision).returning();
    return result;
  }

  async createMany(items: PolicyDecisionInsert[]): Promise<PolicyDecisionSelect[]> {
    if (items.length === 0) return [];
    return this.db.insert(policyDecisions).values(items).returning();
  }

  async listByRunId(runId: string): Promise<PolicyDecisionSelect[]> {
    return this.db
      .select()
      .from(policyDecisions)
      .where(eq(policyDecisions.runId, runId))
      .orderBy(policyDecisions.createdAt);
  }
}
