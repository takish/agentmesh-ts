import OpenAI from "openai";
import type { LlmProvider, ProviderGenerateInput, ProviderGenerateOutput } from "@agentmesh/core";
import { toOpenAIMessages, toOpenAITools, fromOpenAIChoice, fromOpenAIUsage } from "./mapper.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

export class OpenAIProvider implements LlmProvider {
  name = "openai";
  private client: OpenAI;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: input.model,
      messages: toOpenAIMessages(input.messages),
    };
    if (input.tools?.length) params.tools = toOpenAITools(input.tools);
    if (input.temperature !== undefined) params.temperature = input.temperature;
    if (input.maxTokens !== undefined) params.max_tokens = input.maxTokens;

    const response = await this.client.chat.completions.create(params);

    const choice = response.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");

    const { message, finishReason } = fromOpenAIChoice(choice);
    const usage = fromOpenAIUsage(response.usage);

    return { message, finishReason, usage };
  }
}
