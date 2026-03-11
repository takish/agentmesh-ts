import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RunRepository, StepRepository, EventRepository } from "@agentmesh/trace";

const CreateRunBody = z.object({
  agentName: z.string(),
  goal: z.string(),
  provider: z.string(),
  model: z.string(),
  allowedTools: z.array(z.string()).optional(),
  policy: z
    .object({
      maxSteps: z.number().int().positive().optional(),
      maxCostUsd: z.number().positive().optional(),
    })
    .optional(),
});

const ListRunsQuery = z.object({
  status: z.string().optional(),
  workflowId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const IdParams = z.object({
  id: z.string().min(1),
});

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${ts}_${rand}`;
}

export function registerRunRoutes(
  app: FastifyInstance,
  deps: {
    runRepo: RunRepository;
    stepRepo: StepRepository;
    eventRepo: EventRepository;
  },
) {
  const { runRepo, stepRepo, eventRepo } = deps;

  // POST /api/runs — Create run
  app.post("/api/runs", async (req, reply) => {
    const parsed = CreateRunBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.issues });
    }
    const body = parsed.data;
    const run = await runRepo.create({
      id: generateId(),
      agentName: body.agentName,
      goal: body.goal,
      status: "queued",
      provider: body.provider,
      model: body.model,
      metadataJson: { allowedTools: body.allowedTools, policy: body.policy },
    });
    return reply.status(201).send(run);
  });

  // GET /api/runs — List runs
  app.get("/api/runs", async (req, reply) => {
    const parsed = ListRunsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query", details: parsed.error.issues });
    }
    const { status, workflowId, limit } = parsed.data;
    let runs;
    if (workflowId) {
      runs = await runRepo.listByWorkflowId(workflowId, limit);
    } else if (status) {
      runs = await runRepo.listByStatus(status, limit);
    } else {
      runs = await runRepo.listRecent(limit);
    }
    return reply.send(runs);
  });

  // GET /api/runs/:id — Run detail
  app.get("/api/runs/:id", async (req, reply) => {
    const parsed = IdParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid params", details: parsed.error.issues });
    }
    const run = await runRepo.findById(parsed.data.id);
    if (!run) return reply.status(404).send({ error: "Run not found" });

    const steps = await stepRepo.listByRunId(parsed.data.id);
    return reply.send({ ...run, steps });
  });

  // GET /api/runs/:id/events — Run events
  app.get("/api/runs/:id/events", async (req, reply) => {
    const parsed = IdParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid params", details: parsed.error.issues });
    }
    const run = await runRepo.findById(parsed.data.id);
    if (!run) return reply.status(404).send({ error: "Run not found" });

    const events = await eventRepo.listByRunId(parsed.data.id);
    return reply.send(events);
  });

  // GET /api/runs/:id/children — Child runs
  app.get("/api/runs/:id/children", async (req, reply) => {
    const parsed = IdParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid params", details: parsed.error.issues });
    }
    const run = await runRepo.findById(parsed.data.id);
    if (!run) return reply.status(404).send({ error: "Run not found" });

    const children = await runRepo.listByParentId(parsed.data.id);
    return reply.send(children);
  });

  // POST /api/runs/:id/approve — Approve run
  app.post("/api/runs/:id/approve", async (req, reply) => {
    const parsed = IdParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid params", details: parsed.error.issues });
    }
    const run = await runRepo.findById(parsed.data.id);
    if (!run) return reply.status(404).send({ error: "Run not found" });
    if (run.status !== "waiting_approval") {
      return reply.status(409).send({ error: `Cannot approve run in status: ${run.status}` });
    }
    await runRepo.updateStatus(parsed.data.id, "running");
    return reply.send({ id: parsed.data.id, status: "running" });
  });

  // POST /api/runs/:id/cancel — Cancel run
  app.post("/api/runs/:id/cancel", async (req, reply) => {
    const parsed = IdParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid params", details: parsed.error.issues });
    }
    const run = await runRepo.findById(parsed.data.id);
    if (!run) return reply.status(404).send({ error: "Run not found" });
    const cancellable = ["queued", "running", "waiting_approval"];
    if (!cancellable.includes(run.status)) {
      return reply.status(409).send({ error: `Cannot cancel run in status: ${run.status}` });
    }
    await runRepo.updateStatus(parsed.data.id, "cancelled", new Date());
    return reply.send({ id: parsed.data.id, status: "cancelled" });
  });
}
