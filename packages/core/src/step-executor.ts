import type {
  LlmProvider,
  ProviderMessage,
  ProviderToolSpec,
  ProviderGenerateOutput,
  ProviderUsage,
  FinishReason,
} from "./provider.js";
import type { ExecutionEvent, EventType } from "./schema/event.js";

export interface ToolHandler {
  execute(toolName: string, input: Record<string, unknown>): Promise<{ output: unknown; durationMs: number }>;
  toToolSpecs(): ProviderToolSpec[];
}

export interface PolicyChecker {
  evaluate(ctx: {
    toolName: string;
    permissionScope: string;
    sideEffectLevel: string;
    runId: string;
    currentStepCount: number;
    totalCostUsd: number;
  }): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }>;
}

export interface StepInput {
  runId: string;
  stepIndex: number;
  model: string;
  messages: ProviderMessage[];
  currentStepCount: number;
  totalCostUsd: number;
}

export interface StepOutput {
  messages: ProviderMessage[];
  finishReason: FinishReason;
  usage: ProviderUsage;
  toolCallResults: ToolCallResult[];
  events: ExecutionEvent[];
  blocked: boolean;
  requiresApproval: boolean;
}

export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  status: "succeeded" | "failed" | "blocked";
  error?: string;
}

let eventSeq = 0;

function emitEvent(
  runId: string,
  stepId: string | null,
  eventType: EventType,
  payload: Record<string, unknown> = {},
): ExecutionEvent {
  return {
    id: `evt_${++eventSeq}`,
    runId,
    stepId,
    eventType,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export class StepExecutor {
  constructor(
    private provider: LlmProvider,
    private toolHandler: ToolHandler,
    private policyChecker?: PolicyChecker,
  ) {}

  async execute(input: StepInput): Promise<StepOutput> {
    const stepId = `step_${input.runId}_${input.stepIndex}`;
    const events: ExecutionEvent[] = [];
    const toolCallResults: ToolCallResult[] = [];
    let blocked = false;
    let requiresApproval = false;

    events.push(emitEvent(input.runId, stepId, "step.started", { index: input.stepIndex }));

    // 1. Call LLM
    events.push(emitEvent(input.runId, stepId, "llm.called", { model: input.model }));

    let llmOutput: ProviderGenerateOutput;
    try {
      llmOutput = await this.provider.generate({
        model: input.model,
        messages: input.messages,
        tools: this.toolHandler.toToolSpecs(),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      events.push(emitEvent(input.runId, stepId, "step.failed", { error }));
      return {
        messages: input.messages,
        finishReason: "error",
        usage: { inputTokens: 0, outputTokens: 0 },
        toolCallResults: [],
        events,
        blocked: false,
        requiresApproval: false,
      };
    }

    events.push(emitEvent(input.runId, stepId, "llm.responded", {
      finishReason: llmOutput.finishReason,
      usage: llmOutput.usage,
    }));

    const updatedMessages = [...input.messages, llmOutput.message];

    // 2. If no tool calls, return
    if (llmOutput.finishReason !== "tool_calls" || !llmOutput.message.toolCalls?.length) {
      return {
        messages: updatedMessages,
        finishReason: llmOutput.finishReason,
        usage: llmOutput.usage,
        toolCallResults: [],
        events,
        blocked: false,
        requiresApproval: false,
      };
    }

    // 3. Process tool calls
    const toolMessages: ProviderMessage[] = [];

    for (const tc of llmOutput.message.toolCalls) {
      const parsedInput = JSON.parse(tc.arguments) as Record<string, unknown>;

      events.push(emitEvent(input.runId, stepId, "tool.requested", { toolName: tc.name, input: parsedInput }));

      // 3a. Policy check
      if (this.policyChecker) {
        const decision = await this.policyChecker.evaluate({
          toolName: tc.name,
          permissionScope: "",
          sideEffectLevel: "",
          runId: input.runId,
          currentStepCount: input.currentStepCount,
          totalCostUsd: input.totalCostUsd,
        });

        events.push(emitEvent(input.runId, stepId, "policy.checked", {
          toolName: tc.name,
          allowed: decision.allowed,
          requiresApproval: decision.requiresApproval,
        }));

        if (!decision.allowed) {
          blocked = true;
          toolCallResults.push({
            toolName: tc.name,
            input: parsedInput,
            output: null,
            durationMs: 0,
            status: "blocked",
            error: decision.reason,
          });
          toolMessages.push({
            role: "tool",
            content: JSON.stringify({ error: `Policy blocked: ${decision.reason}` }),
            toolCallId: tc.id,
          });
          continue;
        }

        if (decision.requiresApproval) {
          requiresApproval = true;
        }
      }

      // 3b. If requires approval, don't execute yet
      if (requiresApproval) {
        toolCallResults.push({
          toolName: tc.name,
          input: parsedInput,
          output: null,
          durationMs: 0,
          status: "blocked",
          error: "Requires approval",
        });
        continue;
      }

      // 3c. Execute tool
      try {
        const result = await this.toolHandler.execute(tc.name, parsedInput);
        toolCallResults.push({
          toolName: tc.name,
          input: parsedInput,
          output: result.output,
          durationMs: result.durationMs,
          status: "succeeded",
        });
        toolMessages.push({
          role: "tool",
          content: JSON.stringify(result.output),
          toolCallId: tc.id,
        });
        events.push(emitEvent(input.runId, stepId, "tool.completed", {
          toolName: tc.name,
          durationMs: result.durationMs,
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        toolCallResults.push({
          toolName: tc.name,
          input: parsedInput,
          output: null,
          durationMs: 0,
          status: "failed",
          error,
        });
        toolMessages.push({
          role: "tool",
          content: JSON.stringify({ error }),
          toolCallId: tc.id,
        });
        events.push(emitEvent(input.runId, stepId, "step.failed", { toolName: tc.name, error }));
      }
    }

    return {
      messages: [...updatedMessages, ...toolMessages],
      finishReason: requiresApproval ? "stop" : llmOutput.finishReason,
      usage: llmOutput.usage,
      toolCallResults,
      events,
      blocked,
      requiresApproval,
    };
  }
}

/** Reset the internal event counter (for testing). */
export function _resetStepEventSeq(): void {
  eventSeq = 0;
}
