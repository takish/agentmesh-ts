import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const readFileTool = defineTool({
  name: "read_file",
  description: "Read the contents of a file",
  inputSchema: z.object({
    path: z.string().describe("Absolute or relative file path"),
    encoding: z.string().default("utf-8").describe("File encoding"),
  }),
  outputSchema: z.object({
    content: z.string(),
    size: z.number().int().nonnegative(),
  }),
  permissionScope: "file:read",
  sideEffectLevel: "read_only",
  timeoutMs: 5_000,
  async execute(_input) {
    throw new Error("read_file: not implemented — provide a concrete adapter");
  },
});
