import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Write content to a file",
  inputSchema: z.object({
    path: z.string().describe("Absolute or relative file path"),
    content: z.string().describe("Content to write"),
    encoding: z.string().default("utf-8").describe("File encoding"),
  }),
  outputSchema: z.object({
    bytesWritten: z.number().int().nonnegative(),
  }),
  permissionScope: "file:write",
  sideEffectLevel: "external_write",
  timeoutMs: 5_000,
  async execute(_input) {
    throw new Error("write_file: not implemented — provide a concrete adapter");
  },
});
