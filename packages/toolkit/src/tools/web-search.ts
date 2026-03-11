import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const webSearchTool = defineTool({
  name: "web_search",
  description: "Search the web for information",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().int().positive().default(5).describe("Max results to return"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
  permissionScope: "network:read",
  sideEffectLevel: "external_read",
  timeoutMs: 15_000,
  retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
  async execute(_input) {
    throw new Error("web_search: not implemented — provide a concrete adapter");
  },
});
