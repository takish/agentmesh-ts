import { describe, it, expect } from "vitest";
import { validateDag, topologicalLevels, getUpstreamNodes, DagValidationError } from "../dag.js";
import type { WorkflowNodeDef, WorkflowEdge } from "../types.js";

function nodes(...ids: string[]): WorkflowNodeDef[] {
  return ids.map((id) => ({ id, agentName: id, goal: `Goal for ${id}`, model: "test" }));
}

describe("validateDag", () => {
  it("accepts a valid linear chain", () => {
    expect(() =>
      validateDag(nodes("A", "B", "C"), [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ]),
    ).not.toThrow();
  });

  it("accepts a valid fan-out/fan-in", () => {
    expect(() =>
      validateDag(nodes("A", "B", "C", "D"), [
        { from: "A", to: "B" },
        { from: "A", to: "C" },
        { from: "B", to: "D" },
        { from: "C", to: "D" },
      ]),
    ).not.toThrow();
  });

  it("accepts a single node with no edges", () => {
    expect(() => validateDag(nodes("A"), [])).not.toThrow();
  });

  it("throws on empty nodes", () => {
    expect(() => validateDag([], [])).toThrow(DagValidationError);
    expect(() => validateDag([], [])).toThrow("at least one node");
  });

  it("throws on duplicate node IDs", () => {
    expect(() => validateDag(nodes("A", "A"), [])).toThrow("Duplicate node ID");
  });

  it("throws on edge referencing unknown 'from' node", () => {
    expect(() =>
      validateDag(nodes("A"), [{ from: "X", to: "A" }]),
    ).toThrow('Edge references unknown node: "X"');
  });

  it("throws on edge referencing unknown 'to' node", () => {
    expect(() =>
      validateDag(nodes("A"), [{ from: "A", to: "X" }]),
    ).toThrow('Edge references unknown node: "X"');
  });

  it("throws on self-referencing edge", () => {
    expect(() =>
      validateDag(nodes("A"), [{ from: "A", to: "A" }]),
    ).toThrow("Self-referencing edge");
  });

  it("throws on cycle (A→B→C→A)", () => {
    expect(() =>
      validateDag(nodes("A", "B", "C"), [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "A" },
      ]),
    ).toThrow("cycle");
  });

  it("throws on two-node cycle (A→B→A)", () => {
    expect(() =>
      validateDag(nodes("A", "B"), [
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ]),
    ).toThrow("cycle");
  });
});

describe("topologicalLevels", () => {
  it("linear chain: A→B→C", () => {
    const levels = topologicalLevels(nodes("A", "B", "C"), [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ]);
    expect(levels).toEqual([["A"], ["B"], ["C"]]);
  });

  it("fan-out: A→[B,C]→D", () => {
    const levels = topologicalLevels(nodes("A", "B", "C", "D"), [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "D" },
      { from: "C", to: "D" },
    ]);
    expect(levels).toEqual([["A"], ["B", "C"], ["D"]]);
  });

  it("single node, no edges", () => {
    const levels = topologicalLevels(nodes("A"), []);
    expect(levels).toEqual([["A"]]);
  });

  it("two independent roots", () => {
    const levels = topologicalLevels(nodes("A", "B", "C"), [
      { from: "A", to: "C" },
      { from: "B", to: "C" },
    ]);
    expect(levels).toEqual([["A", "B"], ["C"]]);
  });

  it("complex diamond with extra branch", () => {
    // A→B, A→C, B→D, C→D, D→E
    const levels = topologicalLevels(nodes("A", "B", "C", "D", "E"), [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "D" },
      { from: "C", to: "D" },
      { from: "D", to: "E" },
    ]);
    expect(levels).toEqual([["A"], ["B", "C"], ["D"], ["E"]]);
  });
});

describe("getUpstreamNodes", () => {
  const edges: WorkflowEdge[] = [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
  ];

  it("returns empty for root node", () => {
    expect(getUpstreamNodes("A", edges)).toEqual([]);
  });

  it("returns single parent", () => {
    expect(getUpstreamNodes("B", edges)).toEqual(["A"]);
  });

  it("returns multiple parents", () => {
    expect(getUpstreamNodes("D", edges).sort()).toEqual(["B", "C"]);
  });
});
