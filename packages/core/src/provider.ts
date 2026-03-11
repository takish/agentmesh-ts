export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "error";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCallId?: string | undefined;
  toolCalls?: ProviderToolCall[] | undefined;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ProviderToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderGenerateInput {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderToolSpec[] | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderGenerateOutput {
  message: ProviderMessage;
  finishReason: FinishReason;
  usage: ProviderUsage;
}

export interface LlmProvider {
  name: string;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput>;
}
