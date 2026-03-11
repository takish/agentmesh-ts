import type { Tool } from "./define-tool.js";
import type { ToolRegistry } from "./registry.js";

export class ToolTimeoutError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly timeoutMs: number,
  ) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

export interface ToolExecutionResult {
  toolName: string;
  output: unknown;
  durationMs: number;
  attempts: number;
}

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.registry.get(toolName);
    const maxAttempts = tool.retryPolicy?.maxAttempts ?? 1;
    const backoffMs = tool.retryPolicy?.backoffMs ?? 0;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const start = performance.now();
        const output = await withTimeout(tool, input);
        const durationMs = Math.round(performance.now() - start);
        return { toolName, output, durationMs, attempts: attempt };
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await sleep(backoffMs * attempt);
        }
      }
    }
    throw lastError;
  }
}

async function withTimeout(tool: Tool, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ToolTimeoutError(tool.name, tool.timeoutMs)),
      tool.timeoutMs,
    );
    tool
      .execute(input)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
