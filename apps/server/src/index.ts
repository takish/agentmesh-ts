import Fastify from "fastify";
import { createDatabase, RunRepository, StepRepository, EventRepository } from "@agentmesh/trace";
import { registerRunRoutes } from "./routes/runs.js";

const PORT = parseInt(process.env.PORT ?? "3100", 10);
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/agentmesh";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

async function main() {
  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
    },
    requestIdHeader: "x-request-id",
    genReqId: () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  });

  const db = createDatabase(DATABASE_URL);

  const runRepo = new RunRepository(db);
  const stepRepo = new StepRepository(db);
  const eventRepo = new EventRepository(db);

  registerRunRoutes(app, { runRepo, stepRepo, eventRepo });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  for (const signal of signals) {
    process.on(signal, () => {
      app.log.info({ signal }, "Received signal, shutting down gracefully...");
      void app.close().then(() => {
        app.log.info("Server closed");
        process.exit(0);
      }).catch((err: unknown) => {
        app.log.error({ err }, "Error during shutdown");
        process.exit(1);
      });
    });
  }

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`AgentMesh server ready on port ${PORT}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
