import { describe, it, expect, vi } from "vitest";
import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "../index.js";
import type {
  LlmProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
  ToolHandler,
  PolicyChecker,
  ProviderMessage,
} from "../index.js";

// --- Mock Provider ---
function createMockProvider(responses: ProviderGenerateOutput[]): LlmProvider {
  let callIndex = 0;
  return {
    name: "mock",
    generate: vi.fn(async (_input: ProviderGenerateInput): Promise<ProviderGenerateOutput> => {
      const response = responses.at(callIndex);
      if (!response) throw new Error(`No mock response at index ${callIndex}`);
      callIndex++;
      return response;
    }),
  };
}

// --- Mock Tool Handler ---
function createMockToolHandler(
  tools: Record<string, (input: Record<string, unknown>) => unknown>,
): ToolHandler {
  return {
    execute: async (name, input) => {
      const fn = tools[name];
      if (!fn) throw new Error(`Unknown tool: ${name}`);
      const start = Date.now();
      const output = fn(input);
      return { output, durationMs: Date.now() - start };
    },
    toToolSpecs: () =>
      Object.keys(tools).map((name) => ({
        name,
        description: `Mock ${name}`,
        parameters: { type: "object" },
      })),
  };
}

// --- Mock Policy ---
function createAllowAllPolicy(): PolicyChecker {
  return {
    evaluate: async () => ({ allowed: true, requiresApproval: false }),
  };
}

function createBlockingPolicy(blockedTools: Set<string>): PolicyChecker {
  return {
    evaluate: async (ctx) => ({
      allowed: !blockedTools.has(ctx.toolName),
      requiresApproval: false,
      reason: blockedTools.has(ctx.toolName) ? `Tool ${ctx.toolName} not allowed` : undefined,
    }),
  };
}

function createStepBudgetPolicy(maxSteps: number): PolicyChecker {
  return {
    evaluate: async (ctx) => ({
      allowed: ctx.currentStepCount < maxSteps,
      requiresApproval: false,
      reason: ctx.currentStepCount >= maxSteps ? "Step budget exceeded" : undefined,
    }),
  };
}

// --- Helpers ---
function textResponse(text: string): ProviderGenerateOutput {
  return {
    message: { role: "assistant", content: text },
    finishReason: "stop",
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function toolCallResponse(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  text?: string,
): ProviderGenerateOutput {
  return {
    message: {
      role: "assistant",
      content: text ?? null,
      toolCalls: calls.map((c, i) => ({
        id: `tc_${i}`,
        name: c.name,
        arguments: JSON.stringify(c.args),
      })),
    },
    finishReason: "tool_calls",
    usage: { inputTokens: 150, outputTokens: 80 },
  };
}

describe("E2E: normal completion flow", () => {
  it("completes a single-step run with text response", async () => {
    const provider = createMockProvider([textResponse("Hello, world!")]);
    const toolHandler = createMockToolHandler({});
    const stepExecutor = new StepExecutor(provider, toolHandler);

    let machine = createRunMachine("run_1", { maxSteps: 3, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    const messages: ProviderMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Say hello" },
    ];

    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 0,
      model: "mock-model",
      messages,
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(result.finishReason).toBe("stop");
    expect(result.messages.at(-1)?.content).toBe("Hello, world!");
    expect(result.toolCallResults).toHaveLength(0);
    expect(result.blocked).toBe(false);
    expect(result.events.some((e) => e.eventType === "step.started")).toBe(true);
    expect(result.events.some((e) => e.eventType === "llm.called")).toBe(true);
    expect(result.events.some((e) => e.eventType === "llm.responded")).toBe(true);
  });
});

describe("E2E: tool call → tool result → final response", () => {
  it("executes tool and returns final response in multi-step loop", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ name: "search", args: { q: "AI trends" } }]),
      textResponse("Based on my research, AI agents are trending."),
    ]);

    const toolHandler = createMockToolHandler({
      search: (input) => ({ results: [`Result for ${(input as { q: string }).q}`] }),
    });

    const stepExecutor = new StepExecutor(provider, toolHandler, createAllowAllPolicy());

    let machine = createRunMachine("run_2", { maxSteps: 5, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    let messages: ProviderMessage[] = [
      { role: "system", content: "Use search tool." },
      { role: "user", content: "Research AI trends" },
    ];

    // Step 0: LLM calls search tool
    const step0 = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 0,
      model: "mock-model",
      messages,
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(step0.finishReason).toBe("tool_calls");
    expect(step0.toolCallResults).toHaveLength(1);
    expect(step0.toolCallResults.at(0)?.toolName).toBe("search");
    expect(step0.toolCallResults.at(0)?.status).toBe("succeeded");

    messages = step0.messages;
    machine = incrementStep(machine, 0.001);

    // Step 1: LLM gives final response
    const step1 = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 1,
      model: "mock-model",
      messages,
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(step1.finishReason).toBe("stop");
    expect(step1.messages.at(-1)?.content).toContain("AI agents are trending");
    machine = incrementStep(machine, 0.001);
    expect(machine.stepCount).toBe(2);
  });
});

describe("E2E: policy blocks tool call", () => {
  it("blocks disallowed tools", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ name: "run_shell", args: { command: "rm -rf /" } }]),
    ]);

    const toolHandler = createMockToolHandler({
      run_shell: () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    const policyChecker = createBlockingPolicy(new Set(["run_shell"]));
    const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

    let machine = createRunMachine("run_3", { maxSteps: 3, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 0,
      model: "mock-model",
      messages: [{ role: "user", content: "Delete everything" }],
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(result.blocked).toBe(true);
    expect(result.toolCallResults.at(0)?.status).toBe("blocked");
    expect(result.toolCallResults.at(0)?.output).toBeNull();
    expect(result.events.some((e) => e.eventType === "policy.checked")).toBe(true);
  });
});

describe("E2E: budget exceeded stops run", () => {
  it("checkBudget returns steps_exceeded when exceeded", () => {
    let machine = createRunMachine("run_4", { maxSteps: 2, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;
    machine = incrementStep(machine, 0.01);
    machine = incrementStep(machine, 0.01);

    expect(checkBudget(machine)).toBe("steps_exceeded");
  });

  it("checkBudget returns cost_exceeded when exceeded", () => {
    let machine = createRunMachine("run_5", { maxSteps: 10, maxCostUsd: 0.05 });
    const { state: running } = transition(machine, "running");
    machine = running;
    machine = incrementStep(machine, 0.06);

    expect(checkBudget(machine)).toBe("cost_exceeded");
  });

  it("StepBudgetPolicy blocks via policy checker", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ name: "search", args: { q: "test" } }]),
    ]);
    const toolHandler = createMockToolHandler({
      search: () => ({ results: [] }),
    });

    const policyChecker = createStepBudgetPolicy(1);
    const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

    let machine = createRunMachine("run_6", { maxSteps: 1, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;
    machine = incrementStep(machine, 0);

    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 1,
      model: "mock-model",
      messages: [{ role: "user", content: "Search" }],
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(result.blocked).toBe(true);
    expect(result.toolCallResults.at(0)?.status).toBe("blocked");
  });
});

describe("E2E: tool execution failure and recovery", () => {
  it("records error event when tool throws", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ name: "flaky_tool", args: {} }]),
    ]);

    const toolHandler = createMockToolHandler({
      flaky_tool: () => {
        throw new Error("Connection timeout");
      },
    });

    const stepExecutor = new StepExecutor(provider, toolHandler);

    let machine = createRunMachine("run_7", { maxSteps: 3, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 0,
      model: "mock-model",
      messages: [{ role: "user", content: "Do thing" }],
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(result.toolCallResults.at(0)?.status).toBe("failed");
    expect(result.toolCallResults.at(0)?.error).toBe("Connection timeout");
    expect(result.events.some((e) => e.eventType === "step.failed")).toBe(true);

    const toolMessage = result.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("Connection timeout");
  });
});

describe("E2E: multi-step loop with run machine", () => {
  it("runs 3 steps: tool call → tool call → final response", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ name: "search", args: { q: "step 1" } }]),
      toolCallResponse([{ name: "fetch", args: { url: "https://example.com" } }]),
      textResponse("Here is the final summary."),
    ]);

    const toolHandler = createMockToolHandler({
      search: (input) => ({ results: [`found: ${(input as { q: string }).q}`] }),
      fetch: () => ({ content: "<html>Example</html>", status: 200 }),
    });

    const policyChecker = createAllowAllPolicy();
    const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

    let machine = createRunMachine("run_8", { maxSteps: 5, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    let messages: ProviderMessage[] = [
      { role: "system", content: "Research assistant." },
      { role: "user", content: "Research topic" },
    ];

    let finalContent: string | null = null;

    for (let i = 0; i < 5; i++) {
      const budget = checkBudget(machine);
      if (budget !== "ok") break;

      const result = await stepExecutor.execute({
        runId: machine.runId,
        stepIndex: i,
        model: "mock-model",
        messages,
        currentStepCount: machine.stepCount,
        totalCostUsd: machine.totalCostUsd,
      });

      messages = result.messages;
      machine = incrementStep(machine, 0.01);

      if (result.finishReason === "stop") {
        finalContent = result.messages.at(-1)?.content ?? null;
        break;
      }
      if (result.blocked || result.finishReason === "error") break;
    }

    expect(machine.stepCount).toBe(3);
    expect(finalContent).toBe("Here is the final summary.");
    expect((provider.generate as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });
});

describe("E2E: LLM provider error", () => {
  it("returns error finish reason when provider throws", async () => {
    const provider: LlmProvider = {
      name: "broken",
      generate: vi.fn(async () => {
        throw new Error("API rate limit exceeded");
      }),
    };

    const toolHandler = createMockToolHandler({});
    const stepExecutor = new StepExecutor(provider, toolHandler);

    let machine = createRunMachine("run_9", { maxSteps: 3, maxCostUsd: 1.0 });
    const { state: running } = transition(machine, "running");
    machine = running;

    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: 0,
      model: "mock-model",
      messages: [{ role: "user", content: "Hello" }],
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    expect(result.finishReason).toBe("error");
    expect(result.usage.inputTokens).toBe(0);
    expect(result.events.some((e) => e.eventType === "step.failed")).toBe(true);
  });
});
