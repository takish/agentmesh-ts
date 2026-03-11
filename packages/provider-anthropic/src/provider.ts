import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, ProviderGenerateInput, ProviderGenerateOutput } from "@agentmesh/core";
import {
  extractSystemMessage,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicResponse,
} from "./mapper.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

export class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const { system, messages } = extractSystemMessage(input.messages);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: input.model,
      messages: toAnthropicMessages(messages),
      max_tokens: input.maxTokens ?? 4096,
    };
    if (system !== undefined) params.system = system;
    if (input.tools?.length) params.tools = toAnthropicTools(input.tools);
    if (input.temperature !== undefined) params.temperature = input.temperature;

    const response = await this.client.messages.create(params);

    return fromAnthropicResponse(response);
  }
}
