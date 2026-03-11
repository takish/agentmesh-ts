import Fastify from "fastify";
import { createDatabase, RunRepository, StepRepository, EventRepository } from "@agentmesh/trace";
import { registerRunRoutes } from "./routes/runs.js";

const PORT = parseInt(process.env.PORT ?? "3100", 10);
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/agentmesh";

async function main() {
  const app = Fastify({ logger: true });
  const db = createDatabase(DATABASE_URL);

  const runRepo = new RunRepository(db);
  const stepRepo = new StepRepository(db);
  const eventRepo = new EventRepository(db);

  registerRunRoutes(app, { runRepo, stepRepo, eventRepo });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
