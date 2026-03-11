import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const httpFetchTool = defineTool({
  name: "http_fetch",
  description: "Fetch a public HTTP resource",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch"),
    method: z.enum(["GET", "HEAD"]).default("GET").describe("HTTP method"),
  }),
  outputSchema: z.object({
    status: z.number().int(),
    body: z.string(),
    headers: z.record(z.string(), z.string()),
  }),
  permissionScope: "network:read",
  sideEffectLevel: "external_read",
  timeoutMs: 10_000,
  retryPolicy: { maxAttempts: 2, backoffMs: 500 },
  async execute(_input) {
    throw new Error("http_fetch: not implemented — provide a concrete adapter");
  },
});
