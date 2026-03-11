import { describe, it, expect, beforeEach } from "vitest";
import { RunLoop } from "../run-loop.js";
import type { RunLoopConfig, RunLoopDeps } from "../run-loop.js";
import type { LlmProvider, ProviderGenerateOutput, ProviderToolSpec } from "../provider.js";
import type { ToolHandler, PolicyChecker } from "../step-executor.js";
import type { ExecutionEvent } from "../schema/event.js";
import { _resetEventSeq } from "../run-machine.js";
import { _resetStepEventSeq } from "../step-executor.js";

beforeEach(() => {
  _resetEventSeq();
  _resetStepEventSeq();
});

function textResponse(text: string): ProviderGenerateOutput {
  return {
    message: { role: "assistant", content: text },
    finishReason: "stop",
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function toolCallResponse(
  calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
): ProviderGenerateOutput {
  return {
    message: {
      role: "assistant",
      content: null,
      toolCalls: calls.map((c) => ({
        id: c.id,
        name: c.name,
        arguments: JSON.stringify(c.args),
      })),
    },
    finishReason: "tool_calls",
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function createMockProvider(responses: ProviderGenerateOutput[]): LlmProvider {
  let callIndex = 0;
  return {
    name: "mock",
    generate: async () => {
      const resp = responses[callIndex];
      if (resp == null) {
        throw new Error(`No mock response for call index ${callIndex}`);
      }
      callIndex++;
      return resp;
    },
  };
}

function createMockToolHandler(
  tools: Record<string, unknown> = {},
): ToolHandler {
  return {
    execute: async (name, _input) => ({
      output: tools[name] ?? { result: "ok" },
      durationMs: 5,
    }),
    toToolSpecs: () =>
      Object.keys(tools).map(
        (name) =>
          ({
            name,
            description: `Tool ${name}`,
            parameters: { type: "object" },
          }) as ProviderToolSpec,
      ),
  };
}

function makeConfig(overrides: Partial<RunLoopConfig> = {}): RunLoopConfig {
  return {
    runId: "run_test",
    agentName: "test-agent",
    goal: "Do something useful",
    model: "test-model",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RunLoopDeps> = {}): RunLoopDeps {
  return {
    provider: createMockProvider([textResponse("Hello!")]),
    toolHandler: createMockToolHandler(),
    ...overrides,
  };
}

describe("RunLoop", () => {
  it("single-step text response → succeeded", async () => {
    const loop = new RunLoop(makeConfig(), makeDeps());

    const result = await loop.execute();

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("Hello!");
    expect(result.totalSteps).toBe(1);
    expect(result.messages).toHaveLength(2); // user + assistant
  });

  it("tool call → final response → succeeded (2 steps)", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: "tc_1", name: "search", args: { q: "test" } }]),
      textResponse("Based on search results, the answer is 42."),
    ]);
    const toolHandler = createMockToolHandler({ search: { results: ["a"] } });

    const loop = new RunLoop(makeConfig(), makeDeps({ provider, toolHandler }));

    const result = await loop.execute();

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("Based on search results, the answer is 42.");
    expect(result.totalSteps).toBe(2);
  });

  it("budget exceeded (maxSteps: 1, tool call loop) → budget_exceeded", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: "tc_1", name: "search", args: { q: "a" } }]),
      toolCallResponse([{ id: "tc_2", name: "search", args: { q: "b" } }]),
    ]);
    const toolHandler = createMockToolHandler({ search: { ok: true } });

    const loop = new RunLoop(
      makeConfig({ budget: { maxSteps: 1 } }),
      makeDeps({ provider, toolHandler }),
    );

    const result = await loop.execute();

    expect(result.status).toBe("budget_exceeded");
    expect(result.totalSteps).toBe(1);
  });

  it("LLM error → failed", async () => {
    const provider: LlmProvider = {
      name: "mock",
      generate: async () => {
        throw new Error("rate limited");
      },
    };

    const loop = new RunLoop(makeConfig(), makeDeps({ provider }));

    const result = await loop.execute();

    expect(result.status).toBe("failed");
    expect(result.totalSteps).toBe(1);
    expect(result.output).toBeNull();
  });

  it("policy blocks tool → failed (blocked)", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: "tc_1", name: "search", args: {} }]),
    ]);
    const policyChecker: PolicyChecker = {
      evaluate: async () => ({
        allowed: false,
        requiresApproval: false,
        reason: "forbidden tool",
      }),
    };
    const toolHandler = createMockToolHandler({ search: { ok: true } });

    const loop = new RunLoop(
      makeConfig(),
      makeDeps({ provider, toolHandler, policyChecker }),
    );

    const result = await loop.execute();

    expect(result.status).toBe("failed");
  });

  it("events are emitted via onEvent callback", async () => {
    const collected: ExecutionEvent[] = [];
    const onEvent = (e: ExecutionEvent): void => {
      collected.push(e);
    };

    const loop = new RunLoop(makeConfig(), makeDeps({ onEvent }));

    const result = await loop.execute();

    expect(collected.length).toBeGreaterThan(0);
    expect(collected.length).toBe(result.events.length);
    // Should include run.started event
    expect(collected.some((e) => e.eventType === "run.started")).toBe(true);
    // Should include run.completed event
    expect(collected.some((e) => e.eventType === "run.completed")).toBe(true);
  });

  it("output is the final assistant message content", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: "tc_1", name: "search", args: { q: "x" } }]),
      textResponse("Final answer after tool use"),
    ]);
    const toolHandler = createMockToolHandler({ search: { data: 1 } });

    const loop = new RunLoop(makeConfig(), makeDeps({ provider, toolHandler }));

    const result = await loop.execute();

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("Final answer after tool use");
  });

  it("includes system prompt when provided", async () => {
    let capturedMessages: unknown[] = [];
    const provider: LlmProvider = {
      name: "mock",
      generate: async (input) => {
        capturedMessages = input.messages;
        return textResponse("OK");
      },
    };

    const loop = new RunLoop(
      makeConfig({ systemPrompt: "You are a helpful assistant." }),
      makeDeps({ provider }),
    );

    await loop.execute();

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
  });

  it("cost is accumulated across steps", async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: "tc_1", name: "search", args: {} }]),
      textResponse("Done"),
    ]);
    const toolHandler = createMockToolHandler({ search: { ok: true } });

    const loop = new RunLoop(makeConfig(), makeDeps({ provider, toolHandler }));

    const result = await loop.execute();

    expect(result.totalSteps).toBe(2);
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(100);
  });
});
