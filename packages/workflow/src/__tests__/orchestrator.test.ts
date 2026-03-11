import { describe, it, expect } from "vitest";
import type { LlmProvider, ProviderGenerateOutput, ToolHandler, RunLoopDeps } from "@agentmesh/core";
import { defineWorkflow } from "../builder.js";
import { WorkflowOrchestrator, createUniformDeps } from "../orchestrator.js";
import type { WorkflowEvent } from "../orchestrator.js";

// --- Mock helpers ---

function textResponse(text: string): ProviderGenerateOutput {
  return {
    message: { role: "assistant", content: text },
    finishReason: "stop",
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function createSequentialProvider(responses: Record<string, string>): LlmProvider {
  return {
    name: "mock",
    generate: async (input) => {
      // Extract the goal from user message to determine which response to give
      const userMsg = input.messages.find((m) => m.role === "user");
      const content = userMsg?.content ?? "";

      // Find matching response by checking if the goal contains a key
      for (const [key, response] of Object.entries(responses)) {
        if (content.includes(key)) {
          return textResponse(response);
        }
      }
      return textResponse(`Default response for: ${content}`);
    },
  };
}

function createMockToolHandler(): ToolHandler {
  return {
    execute: async () => ({ output: { ok: true }, durationMs: 1 }),
    toToolSpecs: () => [],
  };
}

function makeDeps(provider: LlmProvider): RunLoopDeps {
  return { provider, toolHandler: createMockToolHandler() };
}

// --- Tests ---

describe("WorkflowOrchestrator", () => {
  it("executes a linear chain A → B → C", async () => {
    const wf = defineWorkflow("linear")
      .node("A", { agentName: "a", goal: "Do A", model: "m" })
      .node("B", { agentName: "b", goal: (i) => `Do B with: ${i.A}`, model: "m" })
      .node("C", { agentName: "c", goal: (i) => `Do C with: ${i.B}`, model: "m" })
      .edge("A", "B")
      .edge("B", "C")
      .build();

    const provider = createSequentialProvider({
      "Do A": "Result A",
      "Result A": "Result B",
      "Result B": "Result C",
    });

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: createUniformDeps(makeDeps(provider)),
    });

    const result = await orchestrator.execute();

    expect(result.status).toBe("completed");
    expect(result.nodeResults["A"]!.output).toBe("Result A");
    expect(result.nodeResults["B"]!.output).toBe("Result B");
    expect(result.nodeResults["C"]!.output).toBe("Result C");
  });

  it("executes parallel fan-out A → [B, C] → D", async () => {
    const wf = defineWorkflow("fanout")
      .node("A", { agentName: "a", goal: "Parse query", model: "m" })
      .node("B", { agentName: "b", goal: (i) => `Tech analysis: ${i.A}`, model: "m" })
      .node("C", { agentName: "c", goal: (i) => `Biz analysis: ${i.A}`, model: "m" })
      .node("D", { agentName: "d", goal: (i) => `Merge: ${i.B} + ${i.C}`, model: "m" })
      .edge("A", "B")
      .edge("A", "C")
      .edge("B", "D")
      .edge("C", "D")
      .build();

    const provider = createSequentialProvider({
      "Parse query": "Parsed data",
      "Tech analysis": "Tech result",
      "Biz analysis": "Biz result",
      "Merge": "Final merged report",
    });

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: createUniformDeps(makeDeps(provider)),
    });

    const result = await orchestrator.execute();

    expect(result.status).toBe("completed");
    expect(Object.keys(result.nodeResults)).toHaveLength(4);
    expect(result.nodeResults["A"]!.status).toBe("succeeded");
    expect(result.nodeResults["B"]!.status).toBe("succeeded");
    expect(result.nodeResults["C"]!.status).toBe("succeeded");
    expect(result.nodeResults["D"]!.status).toBe("succeeded");
  });

  it("fail-fast: stops workflow when a node fails", async () => {
    const wf = defineWorkflow("fail-fast")
      .node("A", { agentName: "a", goal: "Do A", model: "m" })
      .node("B", { agentName: "b", goal: (i) => `Do B: ${i.A}`, model: "m" })
      .node("C", { agentName: "c", goal: (i) => `Do C: ${i.B}`, model: "m" })
      .edge("A", "B")
      .edge("B", "C")
      .build();

    // B will fail because provider throws for it
    const provider: LlmProvider = {
      name: "mock",
      generate: async (input) => {
        const userMsg = input.messages.find((m) => m.role === "user");
        if (userMsg?.content?.includes("Do B")) {
          throw new Error("LLM failure");
        }
        return textResponse("OK");
      },
    };

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: createUniformDeps(makeDeps(provider)),
    });

    const result = await orchestrator.execute();

    expect(result.status).toBe("failed");
    expect(result.failedNode).toBe("B");
    // C should not have been executed
    expect(result.nodeResults["C"]).toBeUndefined();
  });

  it("emits workflow events", async () => {
    const wf = defineWorkflow("events")
      .node("A", { agentName: "a", goal: "Do A", model: "m" })
      .build();

    const provider = createSequentialProvider({ "Do A": "Done" });
    const events: WorkflowEvent[] = [];

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: createUniformDeps(makeDeps(provider)),
      onEvent: (e) => events.push(e),
    });

    await orchestrator.execute();

    const types = events.map((e) => e.type);
    expect(types).toContain("workflow.started");
    expect(types).toContain("workflow.node.started");
    expect(types).toContain("workflow.node.completed");
    expect(types).toContain("workflow.completed");
  });

  it("passes upstream outputs to downstream goal functions", async () => {
    const capturedGoals: string[] = [];
    const provider: LlmProvider = {
      name: "mock",
      generate: async (input) => {
        const userMsg = input.messages.find((m) => m.role === "user");
        if (userMsg?.content) capturedGoals.push(userMsg.content);
        return textResponse(`output-for-${capturedGoals.length}`);
      },
    };

    const wf = defineWorkflow("data-flow")
      .node("A", { agentName: "a", goal: "Start task", model: "m" })
      .node("B", { agentName: "b", goal: (i) => `Process: [${i.A}]`, model: "m" })
      .edge("A", "B")
      .build();

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: createUniformDeps(makeDeps(provider)),
    });

    await orchestrator.execute();

    expect(capturedGoals).toHaveLength(2);
    expect(capturedGoals[0]).toBe("Start task");
    expect(capturedGoals[1]).toBe("Process: [output-for-1]");
  });

  it("parallel nodes in same level run concurrently", async () => {
    const executionOrder: string[] = [];

    const wf = defineWorkflow("parallel")
      .node("root", { agentName: "r", goal: "Root", model: "m" })
      .node("p1", { agentName: "p1", goal: (i) => `P1: ${i.root}`, model: "m" })
      .node("p2", { agentName: "p2", goal: (i) => `P2: ${i.root}`, model: "m" })
      .edge("root", "p1")
      .edge("root", "p2")
      .build();

    const orchestrator = new WorkflowOrchestrator(wf, {
      resolveNodeDeps: (nodeId) => ({
        provider: {
          name: "mock",
          generate: async () => {
            executionOrder.push(`start-${nodeId}`);
            // Small delay to allow parallel execution to interleave
            await new Promise((r) => setTimeout(r, 10));
            executionOrder.push(`end-${nodeId}`);
            return textResponse(`${nodeId}-done`);
          },
        },
        toolHandler: createMockToolHandler(),
      }),
    });

    const result = await orchestrator.execute();

    expect(result.status).toBe("completed");
    // Both p1 and p2 should start before either ends (parallel execution)
    const p1Start = executionOrder.indexOf("start-p1");
    const p2Start = executionOrder.indexOf("start-p2");
    const p1End = executionOrder.indexOf("end-p1");
    const p2End = executionOrder.indexOf("end-p2");
    expect(p1Start).toBeLessThan(p1End);
    expect(p2Start).toBeLessThan(p2End);
    // Both should start before either ends
    expect(Math.max(p1Start, p2Start)).toBeLessThan(Math.min(p1End, p2End));
  });
});
