import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerRunRoutes } from "../routes/runs.js";

function createMockRepos() {
  return {
    runRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      updateTokensAndCost: vi.fn(),
      listByStatus: vi.fn(),
      listRecent: vi.fn(),
    },
    stepRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      updateUsage: vi.fn(),
      listByRunId: vi.fn(),
      findByRunIdAndIndex: vi.fn(),
    },
    eventRepo: {
      create: vi.fn(),
      createMany: vi.fn(),
      listByRunId: vi.fn(),
      listByStepId: vi.fn(),
    },
  };
}

type MockRepos = ReturnType<typeof createMockRepos>;

function buildApp(deps: MockRepos) {
  const app = Fastify();
  registerRunRoutes(app, deps as unknown as Parameters<typeof registerRunRoutes>[1]);
  return app;
}

const fakeRun = {
  id: "run_abc123",
  agentName: "test-agent",
  goal: "Test goal",
  status: "queued",
  provider: "openai",
  model: "gpt-4o",
  metadataJson: {},
  createdAt: new Date("2025-01-01"),
  finishedAt: null,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  estimatedCostUsd: 0,
};

describe("POST /api/runs", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("creates a run and returns 201", async () => {
    deps.runRepo.create.mockResolvedValue(fakeRun);
    const app = buildApp(deps);

    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        agentName: "test-agent",
        goal: "Test goal",
        provider: "openai",
        model: "gpt-4o",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ agentName: "test-agent", status: "queued" });
    expect(deps.runRepo.create).toHaveBeenCalledOnce();
  });

  it("returns 400 for invalid body", async () => {
    const app = buildApp(deps);

    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { agentName: "test" }, // missing required fields
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty("error", "Validation failed");
  });

  it("accepts optional allowedTools and policy", async () => {
    deps.runRepo.create.mockResolvedValue(fakeRun);
    const app = buildApp(deps);

    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        agentName: "test-agent",
        goal: "Test goal",
        provider: "openai",
        model: "gpt-4o",
        allowedTools: ["read_file", "run_shell"],
        policy: { maxSteps: 10, maxCostUsd: 1.5 },
      },
    });

    expect(res.statusCode).toBe(201);
    const createCall = deps.runRepo.create.mock.calls.at(0)?.at(0) as Record<string, unknown>;
    expect(createCall.metadataJson).toEqual({
      allowedTools: ["read_file", "run_shell"],
      policy: { maxSteps: 10, maxCostUsd: 1.5 },
    });
  });
});

describe("GET /api/runs", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("lists recent runs", async () => {
    deps.runRepo.listRecent.mockResolvedValue([fakeRun]);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: "/api/runs" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
    expect(deps.runRepo.listRecent).toHaveBeenCalledWith(50);
  });

  it("filters by status", async () => {
    deps.runRepo.listByStatus.mockResolvedValue([fakeRun]);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: "/api/runs?status=queued" });

    expect(res.statusCode).toBe(200);
    expect(deps.runRepo.listByStatus).toHaveBeenCalledWith("queued", 50);
  });

  it("respects limit parameter", async () => {
    deps.runRepo.listRecent.mockResolvedValue([]);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: "/api/runs?limit=10" });

    expect(res.statusCode).toBe(200);
    expect(deps.runRepo.listRecent).toHaveBeenCalledWith(10);
  });
});

describe("GET /api/runs/:id", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("returns run with steps", async () => {
    deps.runRepo.findById.mockResolvedValue(fakeRun);
    const fakeSteps = [{ id: "step_1", runId: fakeRun.id, stepIndex: 0 }];
    deps.stepRepo.listByRunId.mockResolvedValue(fakeSteps);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: `/api/runs/${fakeRun.id}` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(fakeRun.id);
    expect(body.steps).toHaveLength(1);
  });

  it("returns 404 for unknown run", async () => {
    deps.runRepo.findById.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: "/api/runs/nonexistent" });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toHaveProperty("error", "Run not found");
  });
});

describe("GET /api/runs/:id/events", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("returns events for a run", async () => {
    deps.runRepo.findById.mockResolvedValue(fakeRun);
    const fakeEvents = [{ id: "evt_1", runId: fakeRun.id, type: "step_started" }];
    deps.eventRepo.listByRunId.mockResolvedValue(fakeEvents);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: `/api/runs/${fakeRun.id}/events` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });

  it("returns 404 if run not found", async () => {
    deps.runRepo.findById.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "GET", url: "/api/runs/nonexistent/events" });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/runs/:id/approve", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("approves a run in waiting_approval status", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "waiting_approval" });
    deps.runRepo.updateStatus.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/approve` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: fakeRun.id, status: "running" });
    expect(deps.runRepo.updateStatus).toHaveBeenCalledWith(fakeRun.id, "running");
  });

  it("returns 404 if run not found", async () => {
    deps.runRepo.findById.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: "/api/runs/nonexistent/approve" });

    expect(res.statusCode).toBe(404);
  });

  it("returns 409 if run is not in waiting_approval status", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "running" });
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/approve` });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain("Cannot approve");
  });
});

describe("POST /api/runs/:id/cancel", () => {
  let deps: MockRepos;

  beforeEach(() => {
    deps = createMockRepos();
  });

  it("cancels a queued run", async () => {
    deps.runRepo.findById.mockResolvedValue(fakeRun); // status: "queued"
    deps.runRepo.updateStatus.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/cancel` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: fakeRun.id, status: "cancelled" });
    expect(deps.runRepo.updateStatus).toHaveBeenCalledWith(fakeRun.id, "cancelled", expect.any(Date));
  });

  it("cancels a running run", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "running" });
    deps.runRepo.updateStatus.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/cancel` });

    expect(res.statusCode).toBe(200);
  });

  it("cancels a waiting_approval run", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "waiting_approval" });
    deps.runRepo.updateStatus.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/cancel` });

    expect(res.statusCode).toBe(200);
  });

  it("returns 404 if run not found", async () => {
    deps.runRepo.findById.mockResolvedValue(undefined);
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: "/api/runs/nonexistent/cancel" });

    expect(res.statusCode).toBe(404);
  });

  it("returns 409 if run is already completed", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "completed" });
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/cancel` });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain("Cannot cancel");
  });

  it("returns 409 if run is already cancelled", async () => {
    deps.runRepo.findById.mockResolvedValue({ ...fakeRun, status: "cancelled" });
    const app = buildApp(deps);

    const res = await app.inject({ method: "POST", url: `/api/runs/${fakeRun.id}/cancel` });

    expect(res.statusCode).toBe(409);
  });
});
