import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const runShellTool = defineTool({
  name: "run_shell",
  description: "Execute a shell command",
  inputSchema: z.object({
    command: z.string().describe("Shell command to execute"),
    cwd: z.string().optional().describe("Working directory"),
    timeoutMs: z.number().int().positive().default(30_000).describe("Command timeout"),
  }),
  outputSchema: z.object({
    exitCode: z.number().int(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  permissionScope: "shell:exec",
  sideEffectLevel: "system_mutation",
  timeoutMs: 60_000,
  async execute(_input) {
    throw new Error("run_shell: not implemented — provide a concrete adapter");
  },
});
