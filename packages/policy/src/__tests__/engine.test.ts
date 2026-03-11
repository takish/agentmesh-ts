import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../engine.js";
import { ToolAllowlistRule } from "../rules/tool-allowlist.js";
import { ScopeRestrictionRule } from "../rules/scope-restriction.js";
import { CostBudgetRule } from "../rules/cost-budget.js";
import { StepBudgetRule } from "../rules/step-budget.js";
import { DangerousActionRule } from "../rules/dangerous-action.js";
import type { PolicyContext } from "../types.js";

function makeCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    toolName: "read_file",
    permissionScope: "file:read",
    sideEffectLevel: "read_only",
    runId: "run_1",
    currentStepCount: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

describe("ToolAllowlistRule", () => {
  it("allows listed tools", async () => {
    const rule = new ToolAllowlistRule(new Set(["read_file"]));
    const result = await rule.evaluate(makeCtx());
    expect(result.allowed).toBe(true);
  });

  it("blocks unlisted tools", async () => {
    const rule = new ToolAllowlistRule(new Set(["web_search"]));
    const result = await rule.evaluate(makeCtx());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("read_file");
  });
});

describe("ScopeRestrictionRule", () => {
  it("allows permitted scopes", async () => {
    const rule = new ScopeRestrictionRule(new Set(["file:read", "file:write"]));
    const result = await rule.evaluate(makeCtx());
    expect(result.allowed).toBe(true);
  });

  it("blocks unpermitted scopes", async () => {
    const rule = new ScopeRestrictionRule(new Set(["network:read"]));
    const result = await rule.evaluate(makeCtx());
    expect(result.allowed).toBe(false);
  });
});

describe("CostBudgetRule", () => {
  it("allows within budget", async () => {
    const rule = new CostBudgetRule(1.0);
    const result = await rule.evaluate(makeCtx({ totalCostUsd: 0.5 }));
    expect(result.allowed).toBe(true);
  });

  it("blocks over budget", async () => {
    const rule = new CostBudgetRule(1.0);
    const result = await rule.evaluate(makeCtx({ totalCostUsd: 1.5 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeded");
  });
});

describe("StepBudgetRule", () => {
  it("allows within step limit", async () => {
    const rule = new StepBudgetRule(10);
    const result = await rule.evaluate(makeCtx({ currentStepCount: 5 }));
    expect(result.allowed).toBe(true);
  });

  it("blocks over step limit", async () => {
    const rule = new StepBudgetRule(10);
    const result = await rule.evaluate(makeCtx({ currentStepCount: 10 }));
    expect(result.allowed).toBe(false);
  });
});

describe("DangerousActionRule", () => {
  it("does not require approval for read_only", async () => {
    const rule = new DangerousActionRule();
    const result = await rule.evaluate(makeCtx());
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBeUndefined();
  });

  it("requires approval for system_mutation", async () => {
    const rule = new DangerousActionRule();
    const result = await rule.evaluate(makeCtx({ sideEffectLevel: "system_mutation" }));
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("requires approval for external_write", async () => {
    const rule = new DangerousActionRule();
    const result = await rule.evaluate(makeCtx({ sideEffectLevel: "external_write" }));
    expect(result.requiresApproval).toBe(true);
  });
});

describe("PolicyEngine", () => {
  it("returns allowed when all rules pass", async () => {
    const engine = new PolicyEngine();
    engine.addRule(new ToolAllowlistRule(new Set(["read_file"])));
    engine.addRule(new ScopeRestrictionRule(new Set(["file:read"])));

    const decision = await engine.evaluate(makeCtx());
    expect(decision.allowed).toBe(true);
    expect(decision.ruleResults).toHaveLength(2);
  });

  it("returns blocked when any rule fails", async () => {
    const engine = new PolicyEngine();
    engine.addRule(new ToolAllowlistRule(new Set(["web_search"])));
    engine.addRule(new ScopeRestrictionRule(new Set(["file:read"])));

    const decision = await engine.evaluate(makeCtx());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("allowlist");
  });

  it("aggregates requiresApproval from rules", async () => {
    const engine = new PolicyEngine();
    engine.addRule(new ToolAllowlistRule(new Set(["run_shell"])));
    engine.addRule(new DangerousActionRule());

    const decision = await engine.evaluate(
      makeCtx({ toolName: "run_shell", sideEffectLevel: "system_mutation", permissionScope: "shell:exec" }),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("returns allowed with empty rules", async () => {
    const engine = new PolicyEngine();
    const decision = await engine.evaluate(makeCtx());
    expect(decision.allowed).toBe(true);
  });
});
