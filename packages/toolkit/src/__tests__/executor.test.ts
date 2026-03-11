import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../define-tool.js";
import { ToolRegistry } from "../registry.js";
import { ToolExecutor, ToolTimeoutError } from "../executor.js";

function makeEchoTool(opts: { timeoutMs?: number; delay?: number; failCount?: number } = {}) {
  let calls = 0;
  return defineTool({
    name: "echo",
    description: "Echo input",
    inputSchema: z.object({ msg: z.string() }),
    outputSchema: z.object({ echo: z.string() }),
    permissionScope: "test:read",
    sideEffectLevel: "read_only",
    timeoutMs: opts.timeoutMs ?? 5000,
    retryPolicy: opts.failCount ? { maxAttempts: 3, backoffMs: 10 } : undefined,
    async execute(input) {
      calls++;
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (opts.failCount && calls <= opts.failCount) throw new Error("transient");
      return { echo: input.msg };
    },
  });
}

describe("ToolExecutor", () => {
  it("executes a tool and returns result", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool());
    const executor = new ToolExecutor(registry);

    const result = await executor.execute("echo", { msg: "hello" });
    expect(result.output).toEqual({ echo: "hello" });
    expect(result.attempts).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("retries on transient failure", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool({ failCount: 2 }));
    const executor = new ToolExecutor(registry);

    const result = await executor.execute("echo", { msg: "hi" });
    expect(result.output).toEqual({ echo: "hi" });
    expect(result.attempts).toBe(3);
  });

  it("throws after all retries exhausted", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool({ failCount: 10 }));
    const executor = new ToolExecutor(registry);

    await expect(executor.execute("echo", { msg: "fail" })).rejects.toThrow("transient");
  });

  it("throws ToolTimeoutError on timeout", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool({ timeoutMs: 50, delay: 200 }));
    const executor = new ToolExecutor(registry);

    await expect(executor.execute("echo", { msg: "slow" })).rejects.toThrow(ToolTimeoutError);
  });
});
