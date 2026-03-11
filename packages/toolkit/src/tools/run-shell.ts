import { z } from "zod";
import { exec } from "node:child_process";
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
  async execute(input) {
    return new Promise((resolve) => {
      exec(
        input.command,
        {
          cwd: input.cwd,
          timeout: input.timeoutMs,
          maxBuffer: 1024 * 1024,
        },
        (error: (Error & { code?: number }) | null, stdout: string, stderr: string) => {
          resolve({
            exitCode: error?.code ?? 0,
            stdout,
            stderr,
          });
        },
      );
    });
  },
});
