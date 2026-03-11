import { describe, it, expect } from "vitest";
import { defineWorkflow } from "../builder.js";

describe("defineWorkflow builder", () => {
  it("builds a linear chain", () => {
    const wf = defineWorkflow("test-chain")
      .node("A", { agentName: "agent-a", goal: "Do A", model: "gpt-4o" })
      .node("B", { agentName: "agent-b", goal: "Do B", model: "gpt-4o" })
      .edge("A", "B")
      .build();

    expect(wf.name).toBe("test-chain");
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(1);
    expect(wf.nodes.at(0)!.id).toBe("A");
    expect(wf.nodes.at(1)!.id).toBe("B");
  });

  it("builds a fan-out workflow", () => {
    const wf = defineWorkflow("fan-out")
      .node("root", { agentName: "router", goal: "Route", model: "gpt-4o" })
      .node("branch-a", { agentName: "a", goal: "A work", model: "gpt-4o-mini" })
      .node("branch-b", { agentName: "b", goal: "B work", model: "gpt-4o-mini" })
      .node("merge", { agentName: "merger", goal: (i) => `Merge: ${i["branch-a"]}, ${i["branch-b"]}`, model: "gpt-4o" })
      .edge("root", "branch-a")
      .edge("root", "branch-b")
      .edge("branch-a", "merge")
      .edge("branch-b", "merge")
      .build();

    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(4);
  });

  it("supports dynamic goal functions", () => {
    const wf = defineWorkflow("dynamic")
      .node("A", { agentName: "a", goal: "Start", model: "m" })
      .node("B", { agentName: "b", goal: (inputs) => `Process: ${inputs.A}`, model: "m" })
      .edge("A", "B")
      .build();

    const goalFn = wf.nodes.at(1)!.goal;
    expect(typeof goalFn).toBe("function");
    if (typeof goalFn === "function") {
      expect(goalFn({ A: "hello" })).toBe("Process: hello");
    }
  });

  it("is chainable (returns this)", () => {
    const builder = defineWorkflow("chain-test");
    const result = builder.node("A", { agentName: "a", goal: "g", model: "m" });
    expect(result).toBe(builder);
    const result2 = result.edge("A", "A"); // will fail on build, but edge() should return this
    expect(result2).toBe(builder);
  });

  it("throws on cycle at build time", () => {
    expect(() =>
      defineWorkflow("cycle")
        .node("A", { agentName: "a", goal: "g", model: "m" })
        .node("B", { agentName: "b", goal: "g", model: "m" })
        .edge("A", "B")
        .edge("B", "A")
        .build(),
    ).toThrow("cycle");
  });

  it("throws on invalid edge reference at build time", () => {
    expect(() =>
      defineWorkflow("bad-edge")
        .node("A", { agentName: "a", goal: "g", model: "m" })
        .edge("A", "NONEXISTENT")
        .build(),
    ).toThrow("unknown node");
  });

  it("throws on duplicate node IDs at build time", () => {
    expect(() =>
      defineWorkflow("dup")
        .node("A", { agentName: "a1", goal: "g", model: "m" })
        .node("A", { agentName: "a2", goal: "g", model: "m" })
        .build(),
    ).toThrow("Duplicate node ID");
  });

  it("preserves optional fields", () => {
    const wf = defineWorkflow("opts")
      .node("A", {
        agentName: "a",
        goal: "g",
        model: "m",
        systemPrompt: "Be helpful",
        budget: { maxSteps: 5, maxCostUsd: 0.5 },
      })
      .build();

    expect(wf.nodes.at(0)!.systemPrompt).toBe("Be helpful");
    expect(wf.nodes.at(0)!.budget).toEqual({ maxSteps: 5, maxCostUsd: 0.5 });
  });
});
