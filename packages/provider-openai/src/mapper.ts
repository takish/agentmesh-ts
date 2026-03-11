import type {
  ProviderMessage,
  ProviderToolSpec,
  ProviderToolCall,
  ProviderUsage,
  FinishReason,
} from "@agentmesh/core";
import type OpenAI from "openai";

type ChatMessage = OpenAI.ChatCompletionMessageParam;
type ChatTool = OpenAI.ChatCompletionTool;
type ChatChoice = OpenAI.ChatCompletion.Choice;

export function toOpenAIMessages(messages: ProviderMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        content: m.content ?? "",
        tool_call_id: m.toolCallId!,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content ?? "" } as ChatMessage;
  });
}

export function toOpenAITools(tools: ProviderToolSpec[]): ChatTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function fromOpenAIChoice(choice: ChatChoice): {
  message: ProviderMessage;
  finishReason: FinishReason;
} {
  const msg = choice.message;
  const toolCalls: ProviderToolCall[] | undefined = msg.tool_calls?.map((tc) => {
    if (tc.type !== "function") {
      return { id: tc.id, name: tc.type, arguments: "{}" };
    }
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    };
  });

  return {
    message: {
      role: "assistant",
      content: msg.content,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
    },
    finishReason: mapFinishReason(choice.finish_reason),
  };
}

export function fromOpenAIUsage(usage: OpenAI.CompletionUsage | undefined): ProviderUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

function mapFinishReason(reason: string | null): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "error";
  }
}
