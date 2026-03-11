import { describe, it, expect, beforeEach } from "vitest";
import { StepExecutor, _resetStepEventSeq } from "../step-executor.js";
import type { ToolHandler, PolicyChecker, StepInput } from "../step-executor.js";
import type { LlmProvider, ProviderGenerateOutput, ProviderToolSpec } from "../provider.js";

beforeEach(() => {
  _resetStepEventSeq();
});

function makeInput(overrides: Partial<StepInput> = {}): StepInput {
  return {
    runId: "run_1",
    stepIndex: 0,
    model: "test-model",
    messages: [{ role: "user", content: "Hello" }],
    currentStepCount: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

function makeProvider(output: ProviderGenerateOutput): LlmProvider {
  return {
    name: "mock",
    generate: async () => output,
  };
}

function makeToolHandler(results: Record<string, unknown> = {}): ToolHandler {
  return {
    execute: async (name, _input) => ({
      output: results[name] ?? { result: "ok" },
      durationMs: 10,
    }),
    toToolSpecs: () => [
      { name: "search", description: "Search", parameters: { type: "object" } },
    ] as ProviderToolSpec[],
  };
}

describe("StepExecutor", () => {
  it("handles simple text response (no tool calls)", async () => {
    const provider = makeProvider({
      message: { role: "assistant", content: "Hi there!" },
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const executor = new StepExecutor(provider, makeToolHandler());

    const result = await executor.execute(makeInput());

    expect(result.finishReason).toBe("stop");
    expect(result.toolCallResults).toHaveLength(0);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.at(1)?.content).toBe("Hi there!");
    expect(result.events.some((e) => e.eventType === "step.started")).toBe(true);
    expect(result.events.some((e) => e.eventType === "llm.called")).toBe(true);
    expect(result.events.some((e) => e.eventType === "llm.responded")).toBe(true);
  });

  it("executes tool calls and appends results", async () => {
    const provider = makeProvider({
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{"q":"test"}' }],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 15, outputTokens: 10 },
    });
    const toolHandler = makeToolHandler({ search: { results: ["a", "b"] } });
    const executor = new StepExecutor(provider, toolHandler);

    const result = await executor.execute(makeInput());

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCallResults).toHaveLength(1);
    const tc0 = result.toolCallResults.at(0);
    expect(tc0?.status).toBe("succeeded");
    expect(tc0?.output).toEqual({ results: ["a", "b"] });
    // messages: user + assistant + tool result
    expect(result.messages).toHaveLength(3);
    expect(result.messages.at(2)?.role).toBe("tool");
    expect(result.events.some((e) => e.eventType === "tool.requested")).toBe(true);
    expect(result.events.some((e) => e.eventType === "tool.completed")).toBe(true);
  });

  it("handles tool execution error", async () => {
    const provider = makeProvider({
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{"q":"fail"}' }],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const toolHandler: ToolHandler = {
      execute: async () => { throw new Error("timeout"); },
      toToolSpecs: () => [],
    };
    const executor = new StepExecutor(provider, toolHandler);

    const result = await executor.execute(makeInput());

    const tc0 = result.toolCallResults.at(0);
    expect(tc0?.status).toBe("failed");
    expect(tc0?.error).toBe("timeout");
    expect(result.messages.at(2)?.role).toBe("tool");
    expect(result.messages.at(2)?.content).toContain("timeout");
  });

  it("handles LLM provider error", async () => {
    const provider: LlmProvider = {
      name: "mock",
      generate: async () => { throw new Error("rate limited"); },
    };
    const executor = new StepExecutor(provider, makeToolHandler());

    const result = await executor.execute(makeInput());

    expect(result.finishReason).toBe("error");
    expect(result.events.some((e) => e.eventType === "step.failed")).toBe(true);
  });

  it("blocks tool call when policy denies", async () => {
    const provider = makeProvider({
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{}' }],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const policyChecker: PolicyChecker = {
      evaluate: async () => ({ allowed: false, requiresApproval: false, reason: "not in allowlist" }),
    };
    const executor = new StepExecutor(provider, makeToolHandler(), policyChecker);

    const result = await executor.execute(makeInput());

    expect(result.blocked).toBe(true);
    expect(result.toolCallResults.at(0)?.status).toBe("blocked");
    expect(result.events.some((e) => e.eventType === "policy.checked")).toBe(true);
  });

  it("sets requiresApproval when policy demands it", async () => {
    const provider = makeProvider({
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{}' }],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const policyChecker: PolicyChecker = {
      evaluate: async () => ({ allowed: true, requiresApproval: true }),
    };
    const executor = new StepExecutor(provider, makeToolHandler(), policyChecker);

    const result = await executor.execute(makeInput());

    expect(result.requiresApproval).toBe(true);
    expect(result.toolCallResults.at(0)?.status).toBe("blocked");
    expect(result.toolCallResults.at(0)?.error).toBe("Requires approval");
  });

  it("works without policy checker", async () => {
    const provider = makeProvider({
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{}' }],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const executor = new StepExecutor(provider, makeToolHandler());

    const result = await executor.execute(makeInput());

    expect(result.toolCallResults.at(0)?.status).toBe("succeeded");
    expect(result.blocked).toBe(false);
  });
});
