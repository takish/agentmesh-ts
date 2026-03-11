import type { RunStatus } from "./schema/run.js";
import type { EventType, ExecutionEvent } from "./schema/event.js";

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting_approval", "succeeded", "failed", "cancelled"],
  waiting_approval: ["running", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export interface RunBudget {
  maxSteps?: number;
  maxCostUsd?: number;
}

export interface RunMachineState {
  runId: string;
  status: RunStatus;
  stepCount: number;
  totalCostUsd: number;
  budget: RunBudget;
  parentRunId?: string | undefined;
  workflowId?: string | undefined;
}

export interface TransitionResult {
  state: RunMachineState;
  event: ExecutionEvent;
}

let eventSeq = 0;

function createEvent(
  runId: string,
  eventType: EventType,
  payload: Record<string, unknown> = {},
): ExecutionEvent {
  return {
    id: `evt_${++eventSeq}`,
    runId,
    stepId: null,
    eventType,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  state: RunMachineState,
  to: RunStatus,
): TransitionResult {
  if (!canTransition(state.status, to)) {
    throw new InvalidTransitionError(state.status, to);
  }

  const eventType = resolveEventType(state.status, to);
  const next: RunMachineState = { ...state, status: to };
  const event = createEvent(state.runId, eventType, { from: state.status, to });

  return { state: next, event };
}

export function checkBudget(state: RunMachineState): "ok" | "steps_exceeded" | "cost_exceeded" {
  if (state.budget.maxSteps != null && state.stepCount >= state.budget.maxSteps) {
    return "steps_exceeded";
  }
  if (state.budget.maxCostUsd != null && state.totalCostUsd >= state.budget.maxCostUsd) {
    return "cost_exceeded";
  }
  return "ok";
}

export function createRunMachine(
  runId: string,
  budget: RunBudget = {},
  options?: { parentRunId?: string; workflowId?: string },
): RunMachineState {
  return {
    runId,
    status: "queued",
    stepCount: 0,
    totalCostUsd: 0,
    budget,
    parentRunId: options?.parentRunId,
    workflowId: options?.workflowId,
  };
}

export function incrementStep(
  state: RunMachineState,
  costUsd: number = 0,
): RunMachineState {
  return {
    ...state,
    stepCount: state.stepCount + 1,
    totalCostUsd: state.totalCostUsd + costUsd,
  };
}

/** Reset the internal event counter (for testing). */
export function _resetEventSeq(): void {
  eventSeq = 0;
}

function resolveEventType(from: RunStatus, to: RunStatus): EventType {
  if (to === "running" && from === "queued") return "run.started";
  if (to === "running" && from === "waiting_approval") return "run.started";
  if (to === "succeeded" || to === "failed" || to === "cancelled") return "run.completed";
  return "run.created";
}
