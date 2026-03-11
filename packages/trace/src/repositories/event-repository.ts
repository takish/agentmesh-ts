import { eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { events } from "../schema.js";

export type EventInsert = typeof events.$inferInsert;
export type EventSelect = typeof events.$inferSelect;

export class EventRepository {
  constructor(private db: Database) {}

  async create(event: EventInsert): Promise<EventSelect> {
    const [result] = await this.db.insert(events).values(event).returning();
    return result;
  }

  async createMany(items: EventInsert[]): Promise<EventSelect[]> {
    if (items.length === 0) return [];
    return this.db.insert(events).values(items).returning();
  }

  async listByRunId(runId: string): Promise<EventSelect[]> {
    return this.db
      .select()
      .from(events)
      .where(eq(events.runId, runId))
      .orderBy(events.createdAt);
  }

  async listByStepId(stepId: string): Promise<EventSelect[]> {
    return this.db
      .select()
      .from(events)
      .where(eq(events.stepId, stepId))
      .orderBy(events.createdAt);
  }
}
