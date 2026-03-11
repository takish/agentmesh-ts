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
  async execute(input) {
    const res = await fetch(input.url, { method: input.method });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: res.status, body, headers };
  },
});
