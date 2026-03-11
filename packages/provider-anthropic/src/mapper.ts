import type {
  ProviderMessage,
  ProviderToolSpec,
  ProviderToolCall,
  ProviderUsage,
  FinishReason,
} from "@agentmesh/core";
import type Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageCreateParams["messages"][number];
type ToolParam = Anthropic.Tool;
type ContentBlock = Anthropic.ContentBlock;
type MessageResponse = Anthropic.Message;

export function extractSystemMessage(
  messages: ProviderMessage[],
): { system: string | undefined; messages: ProviderMessage[] } {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const system = systemMsgs.map((m) => m.content ?? "").join("\n") || undefined;
  return { system, messages: rest };
}

export function toAnthropicMessages(messages: ProviderMessage[]): MessageParam[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const tc of m.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments),
        });
      }
      return { role: "assistant" as const, content };
    }

    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: m.toolCallId!,
            content: m.content ?? "",
          },
        ],
      };
    }

    return { role: m.role as "user" | "assistant", content: m.content ?? "" };
  });
}

export function toAnthropicTools(tools: ProviderToolSpec[]): ToolParam[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

export function fromAnthropicResponse(response: MessageResponse): {
  message: ProviderMessage;
  finishReason: FinishReason;
  usage: ProviderUsage;
} {
  const toolCalls = extractToolCalls(response.content);
  const textContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    message: {
      role: "assistant",
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    finishReason: mapStopReason(response.stop_reason),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function extractToolCalls(blocks: ContentBlock[]): ProviderToolCall[] {
  return blocks
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({
      id: b.id,
      name: b.name,
      arguments: JSON.stringify(b.input),
    }));
}

function mapStopReason(reason: string | null): FinishReason {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return "error";
  }
}
