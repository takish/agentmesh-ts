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

    const response = await this.client.messages.create({
      model: input.model,
      system: system,
      messages: toAnthropicMessages(messages),
      tools: input.tools?.length ? toAnthropicTools(input.tools) : undefined,
      temperature: input.temperature,
      max_tokens: input.maxTokens ?? 4096,
    });

    return fromAnthropicResponse(response);
  }
}
