import { describe, it, expect, beforeEach } from "vitest";
import {
  createRunMachine,
  transition,
  canTransition,
  checkBudget,
  incrementStep,
  InvalidTransitionError,
  _resetEventSeq,
} from "../run-machine.js";
import type { RunStatus } from "../schema/run.js";

beforeEach(() => {
  _resetEventSeq();
});

describe("canTransition", () => {
  const valid: [RunStatus, RunStatus][] = [
    ["queued", "running"],
    ["queued", "cancelled"],
    ["running", "waiting_approval"],
    ["running", "succeeded"],
    ["running", "failed"],
    ["running", "cancelled"],
    ["waiting_approval", "running"],
    ["waiting_approval", "cancelled"],
  ];

  it.each(valid)("%s → %s should be allowed", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const invalid: [RunStatus, RunStatus][] = [
    ["queued", "succeeded"],
    ["queued", "failed"],
    ["queued", "waiting_approval"],
    ["succeeded", "running"],
    ["succeeded", "failed"],
    ["failed", "running"],
    ["cancelled", "running"],
  ];

  it.each(invalid)("%s → %s should be denied", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("transition", () => {
  it("queued → running emits run.started event", () => {
    const state = createRunMachine("run_1");
    const result = transition(state, "running");

    expect(result.state.status).toBe("running");
    expect(result.event.eventType).toBe("run.started");
    expect(result.event.runId).toBe("run_1");
    expect(result.event.payload).toEqual({ from: "queued", to: "running" });
  });

  it("running → succeeded emits run.completed event", () => {
    const state = { ...createRunMachine("run_1"), status: "running" as const };
    const result = transition(state, "succeeded");

    expect(result.state.status).toBe("succeeded");
    expect(result.event.eventType).toBe("run.completed");
  });

  it("running → failed emits run.completed event", () => {
    const state = { ...createRunMachine("run_1"), status: "running" as const };
    const result = transition(state, "failed");

    expect(result.state.status).toBe("failed");
    expect(result.event.eventType).toBe("run.completed");
  });

  it("running → waiting_approval", () => {
    const state = { ...createRunMachine("run_1"), status: "running" as const };
    const result = transition(state, "waiting_approval");

    expect(result.state.status).toBe("waiting_approval");
  });

  it("waiting_approval → running (approved)", () => {
    const state = { ...createRunMachine("run_1"), status: "waiting_approval" as const };
    const result = transition(state, "running");

    expect(result.state.status).toBe("running");
    expect(result.event.eventType).toBe("run.started");
  });

  it("waiting_approval → cancelled (rejected)", () => {
    const state = { ...createRunMachine("run_1"), status: "waiting_approval" as const };
    const result = transition(state, "cancelled");

    expect(result.state.status).toBe("cancelled");
    expect(result.event.eventType).toBe("run.completed");
  });

  it("throws InvalidTransitionError for invalid transition", () => {
    const state = createRunMachine("run_1");

    expect(() => transition(state, "succeeded")).toThrow(InvalidTransitionError);
    expect(() => transition(state, "succeeded")).toThrow("Invalid transition: queued → succeeded");
  });

  it("does not mutate original state", () => {
    const state = createRunMachine("run_1");
    const result = transition(state, "running");

    expect(state.status).toBe("queued");
    expect(result.state.status).toBe("running");
  });
});

describe("checkBudget", () => {
  it("returns ok when within budget", () => {
    const state = createRunMachine("run_1", { maxSteps: 10, maxCostUsd: 1.0 });
    expect(checkBudget(state)).toBe("ok");
  });

  it("returns steps_exceeded when step count exceeds max", () => {
    let state = createRunMachine("run_1", { maxSteps: 2 });
    state = incrementStep(state);
    state = incrementStep(state);
    expect(checkBudget(state)).toBe("steps_exceeded");
  });

  it("returns cost_exceeded when cost exceeds max", () => {
    let state = createRunMachine("run_1", { maxCostUsd: 0.5 });
    state = incrementStep(state, 0.6);
    expect(checkBudget(state)).toBe("cost_exceeded");
  });

  it("returns ok when no budget set", () => {
    let state = createRunMachine("run_1");
    state = incrementStep(state, 100);
    expect(checkBudget(state)).toBe("ok");
  });
});

describe("incrementStep", () => {
  it("increments step count and adds cost", () => {
    let state = createRunMachine("run_1");
    state = incrementStep(state, 0.01);
    expect(state.stepCount).toBe(1);
    expect(state.totalCostUsd).toBeCloseTo(0.01);

    state = incrementStep(state, 0.02);
    expect(state.stepCount).toBe(2);
    expect(state.totalCostUsd).toBeCloseTo(0.03);
  });
});
