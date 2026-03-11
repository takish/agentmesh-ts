import { z } from "zod";
import { defineTool } from "../define-tool.js";

export const webSearchTool = defineTool({
  name: "web_search",
  description: "Search the web for information. Requires TAVILY_API_KEY environment variable.",
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
  async execute(input) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY environment variable is required for web_search");
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query,
        max_results: input.maxResults,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      results: Array<{ title: string; url: string; content: string }>;
    };

    return {
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
    };
  },
});
