import { describe, it, expect } from "vitest";
import { toOpenAIMessages, toOpenAITools, fromOpenAIChoice, fromOpenAIUsage } from "../mapper.js";
import type { ProviderMessage, ProviderToolSpec } from "@agentmesh/core";
import type OpenAI from "openai";

describe("toOpenAIMessages", () => {
  it("maps system/user/assistant messages", () => {
    const messages: ProviderMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const result = toOpenAIMessages(messages);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "system", content: "You are helpful" });
  });

  it("maps tool message with toolCallId", () => {
    const messages: ProviderMessage[] = [
      { role: "tool", content: '{"result": 42}', toolCallId: "tc_1" },
    ];
    const result = toOpenAIMessages(messages);
    expect(result[0]).toEqual({
      role: "tool",
      content: '{"result": 42}',
      tool_call_id: "tc_1",
    });
  });

  it("maps assistant message with tool_calls", () => {
    const messages: ProviderMessage[] = [
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tc_1", name: "search", arguments: '{"q":"test"}' }],
      },
    ];
    const result = toOpenAIMessages(messages);
    const msg = result[0] as OpenAI.ChatCompletionAssistantMessageParam;
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0]).toEqual({
      id: "tc_1",
      type: "function",
      function: { name: "search", arguments: '{"q":"test"}' },
    });
  });
});

describe("toOpenAITools", () => {
  it("maps tool specs to OpenAI format", () => {
    const tools: ProviderToolSpec[] = [
      { name: "search", description: "Search", parameters: { type: "object" } },
    ];
    const result = toOpenAITools(tools);
    expect(result[0]).toEqual({
      type: "function",
      function: {
        name: "search",
        description: "Search",
        parameters: { type: "object" },
      },
    });
  });
});

describe("fromOpenAIChoice", () => {
  it("maps a stop choice", () => {
    const choice = {
      index: 0,
      message: { role: "assistant" as const, content: "Done", refusal: null },
      finish_reason: "stop" as const,
      logprobs: null,
    };
    const result = fromOpenAIChoice(choice);
    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Done");
    expect(result.finishReason).toBe("stop");
  });

  it("maps a tool_calls choice", () => {
    const choice = {
      index: 0,
      message: {
        role: "assistant" as const,
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: "tc_1",
            type: "function" as const,
            function: { name: "search", arguments: '{"q":"hi"}' },
          },
        ],
      },
      finish_reason: "tool_calls" as const,
      logprobs: null,
    };
    const result = fromOpenAIChoice(choice);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls!.at(0)?.name).toBe("search");
  });
});

describe("toOpenAIMessages edge cases", () => {
  it("handles empty messages array", () => {
    const result = toOpenAIMessages([]);
    expect(result).toHaveLength(0);
  });

  it("handles null content in assistant message", () => {
    const messages: ProviderMessage[] = [
      { role: "assistant", content: null },
    ];
    const result = toOpenAIMessages(messages);
    expect(result[0]).toEqual({ role: "assistant", content: "" });
  });

  it("handles assistant with empty toolCalls array", () => {
    const messages: ProviderMessage[] = [
      { role: "assistant", content: "Hi", toolCalls: [] },
    ];
    const result = toOpenAIMessages(messages);
    const msg = result[0] as OpenAI.ChatCompletionAssistantMessageParam;
    expect(msg.tool_calls).toBeUndefined();
  });
});

describe("fromOpenAIChoice edge cases", () => {
  it("maps length finish_reason", () => {
    const choice = {
      index: 0,
      message: { role: "assistant" as const, content: "Truncated", refusal: null },
      finish_reason: "length" as const,
      logprobs: null,
    };
    const result = fromOpenAIChoice(choice);
    expect(result.finishReason).toBe("length");
  });

  it("maps content_filter finish_reason", () => {
    const choice = {
      index: 0,
      message: { role: "assistant" as const, content: null, refusal: null },
      finish_reason: "content_filter" as const,
      logprobs: null,
    };
    const result = fromOpenAIChoice(choice);
    expect(result.finishReason).toBe("content_filter");
  });

  it("handles message with no tool_calls", () => {
    const choice = {
      index: 0,
      message: { role: "assistant" as const, content: "Hi", refusal: null },
      finish_reason: "stop" as const,
      logprobs: null,
    };
    const result = fromOpenAIChoice(choice);
    expect(result.message.toolCalls).toBeUndefined();
  });
});

describe("fromOpenAIUsage", () => {
  it("maps usage", () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const result = fromOpenAIUsage(usage);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("handles undefined usage", () => {
    const result = fromOpenAIUsage(undefined);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
