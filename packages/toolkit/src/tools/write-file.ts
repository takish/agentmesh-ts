import { z } from "zod";
import { writeFile } from "node:fs/promises";
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
  async execute(input) {
    const bytesWritten = Buffer.byteLength(input.content, input.encoding as BufferEncoding);
    await writeFile(input.path, input.content, { encoding: input.encoding as BufferEncoding });
    return { bytesWritten };
  },
});
