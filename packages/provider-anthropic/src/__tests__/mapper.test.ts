import { describe, it, expect } from "vitest";
import {
  extractSystemMessage,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicResponse,
} from "../mapper.js";
import type { ProviderMessage, ProviderToolSpec } from "@agentmesh/core";
import type Anthropic from "@anthropic-ai/sdk";

describe("extractSystemMessage", () => {
  it("extracts system messages and returns rest", () => {
    const messages: ProviderMessage[] = [
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Hello" },
    ];
    const result = extractSystemMessage(messages);
    expect(result.system).toBe("Be helpful");
    expect(result.messages).toHaveLength(1);
    expect(result.messages.at(0)?.role).toBe("user");
  });

  it("returns undefined system when no system message", () => {
    const messages: ProviderMessage[] = [{ role: "user", content: "Hi" }];
    const result = extractSystemMessage(messages);
    expect(result.system).toBeUndefined();
  });

  it("joins multiple system messages", () => {
    const messages: ProviderMessage[] = [
      { role: "system", content: "Rule 1" },
      { role: "system", content: "Rule 2" },
      { role: "user", content: "Go" },
    ];
    const result = extractSystemMessage(messages);
    expect(result.system).toBe("Rule 1\nRule 2");
  });
});

describe("toAnthropicMessages", () => {
  it("maps user and assistant messages", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("maps assistant with tool_calls to content blocks", () => {
    const messages: ProviderMessage[] = [
      {
        role: "assistant",
        content: "Let me search",
        toolCalls: [{ id: "tu_1", name: "search", arguments: '{"q":"test"}' }],
      },
    ];
    const result = toAnthropicMessages(messages);
    const msg = result[0] as { role: string; content: unknown[] };
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0]).toEqual({ type: "text", text: "Let me search" });
    expect(msg.content[1]).toEqual({
      type: "tool_use",
      id: "tu_1",
      name: "search",
      input: { q: "test" },
    });
  });

  it("maps tool result as user message", () => {
    const messages: ProviderMessage[] = [
      { role: "tool", content: '{"data": 42}', toolCallId: "tu_1" },
    ];
    const result = toAnthropicMessages(messages);
    expect(result.at(0)?.role).toBe("user");
    const content = (result.at(0) as { content: unknown[] }).content;
    expect(content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "tu_1",
      content: '{"data": 42}',
    });
  });
});

describe("extractSystemMessage edge cases", () => {
  it("handles empty messages array", () => {
    const result = extractSystemMessage([]);
    expect(result.system).toBeUndefined();
    expect(result.messages).toHaveLength(0);
  });
});

describe("toAnthropicMessages edge cases", () => {
  it("handles empty messages array", () => {
    const result = toAnthropicMessages([]);
    expect(result).toHaveLength(0);
  });

  it("handles assistant with null content and tool calls", () => {
    const messages: ProviderMessage[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tu_1", name: "search", arguments: '{}' }],
      },
    ];
    const result = toAnthropicMessages(messages);
    const msg = result[0] as { content: unknown[] };
    // Should only have tool_use block, no text block for null content
    expect(msg.content).toHaveLength(1);
    expect((msg.content[0] as { type: string }).type).toBe("tool_use");
  });

  it("handles assistant with empty toolCalls array", () => {
    const messages: ProviderMessage[] = [
      { role: "assistant", content: "Hi", toolCalls: [] },
    ];
    const result = toAnthropicMessages(messages);
    expect(result[0]).toEqual({ role: "assistant", content: "Hi" });
  });
});

describe("fromAnthropicResponse edge cases", () => {
  it("handles empty content array", () => {
    const response = {
      id: "msg_4",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-sonnet-4-20250514",
      content: [],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Message;
    const result = fromAnthropicResponse(response);
    expect(result.message.content).toBeNull();
    expect(result.finishReason).toBe("stop");
  });
});

describe("toAnthropicTools", () => {
  it("maps tool specs", () => {
    const tools: ProviderToolSpec[] = [
      { name: "search", description: "Search", parameters: { type: "object" } },
    ];
    const result = toAnthropicTools(tools);
    expect(result[0]).toEqual({
      name: "search",
      description: "Search",
      input_schema: { type: "object" },
    });
  });
});

describe("fromAnthropicResponse", () => {
  it("maps text response", () => {
    const response = {
      id: "msg_1",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text" as const, text: "Hello!" }],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as Anthropic.Message;
    const result = fromAnthropicResponse(response);
    expect(result.message.content).toBe("Hello!");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("maps tool_use response", () => {
    const response = {
      id: "msg_2",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-sonnet-4-20250514",
      content: [
        { type: "text" as const, text: "Searching..." },
        { type: "tool_use" as const, id: "tu_1", name: "search", input: { q: "test" } },
      ],
      stop_reason: "tool_use" as const,
      stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as Anthropic.Message;
    const result = fromAnthropicResponse(response);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls![0]).toEqual({
      id: "tu_1",
      name: "search",
      arguments: '{"q":"test"}',
    });
    expect(result.message.content).toBe("Searching...");
  });

  it("maps max_tokens stop reason", () => {
    const response = {
      id: "msg_3",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text" as const, text: "Truncated..." }],
      stop_reason: "max_tokens" as const,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as Anthropic.Message;
    const result = fromAnthropicResponse(response);
    expect(result.finishReason).toBe("length");
  });
});
