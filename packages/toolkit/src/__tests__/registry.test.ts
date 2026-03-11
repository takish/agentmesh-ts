import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../define-tool.js";
import { ToolRegistry, DuplicateToolError, ToolNotFoundError } from "../registry.js";

function makeTool(name: string) {
  return defineTool({
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({ x: z.string() }),
    outputSchema: z.object({ y: z.string() }),
    permissionScope: "test:read",
    sideEffectLevel: "read_only",
    timeoutMs: 1000,
    async execute(input) {
      return { y: input.x };
    },
  });
}

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("foo");
    registry.register(tool);

    expect(registry.get("foo")).toBe(tool);
    expect(registry.has("foo")).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("throws DuplicateToolError on duplicate name", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("foo"));

    expect(() => registry.register(makeTool("foo"))).toThrow(DuplicateToolError);
  });

  it("throws ToolNotFoundError for unknown name", () => {
    const registry = new ToolRegistry();

    expect(() => registry.get("nope")).toThrow(ToolNotFoundError);
  });

  it("lists all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));

    expect(registry.list()).toHaveLength(2);
  });

  it("toContracts returns metadata without execute", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));

    const contracts = registry.toContracts();
    expect(contracts).toHaveLength(1);
    expect(contracts.at(0)?.name).toBe("a");
    expect(contracts.at(0) != null && "execute" in contracts.at(0)!).toBe(false);
  });

  it("toJsonSchemas returns LLM-ready format", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));

    const schemas = registry.toJsonSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas.at(0)?.name).toBe("a");
    expect(schemas.at(0)?.parameters).toBeDefined();
  });
});
