import type { Tool, ToolContract } from "./define-tool.js";
import { toToolContract } from "./define-tool.js";

export class DuplicateToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`Tool already registered: ${toolName}`);
    this.name = "DuplicateToolError";
  }
}

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  toContracts(): ToolContract[] {
    return this.list().map(toToolContract);
  }

  toJsonSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputJsonSchema,
    }));
  }

  get size(): number {
    return this.tools.size;
  }
}
