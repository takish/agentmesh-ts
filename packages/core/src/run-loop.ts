import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import type { LlmProvider, ProviderMessage, ProviderUsage } from "./provider.js";
import type { ExecutionEvent } from "./schema/event.js";
import type { ToolHandler, PolicyChecker } from "./step-executor.js";
import type { RunBudget } from "./run-machine.js";
import { StepExecutor } from "./step-executor.js";
import {
  createRunMachine,
  transition,
  checkBudget,
  incrementStep,
} from "./run-machine.js";

const tracer = trace.getTracer("@agentmesh/core");

export interface RunLoopConfig {
  runId: string;
  agentName: string;
  goal: string;
  model: string;
  systemPrompt?: string | undefined;
  budget?: RunBudget | undefined;
  parentRunId?: string | undefined;
  workflowId?: string | undefined;
}

export interface RunLoopDeps {
  provider: LlmProvider;
  toolHandler: ToolHandler;
  policyChecker?: PolicyChecker | undefined;
  onEvent?: ((event: ExecutionEvent) => void) | undefined;
}

export interface RunLoopResult {
  status: "succeeded" | "failed" | "cancelled" | "budget_exceeded";
  output: string | null;
  messages: ProviderMessage[];
  totalSteps: number;
  totalCostUsd: number;
  events: ExecutionEvent[];
  usage: ProviderUsage;
}

export class RunLoop {
  private readonly config: RunLoopConfig;
  private readonly deps: RunLoopDeps;

  constructor(config: RunLoopConfig, deps: RunLoopDeps) {
    this.config = config;
    this.deps = deps;
  }

  async execute(): Promise<RunLoopResult> {
    return tracer.startActiveSpan(`run.${this.config.agentName}`, {
      attributes: {
        "agentmesh.run_id": this.config.runId,
        "agentmesh.agent_name": this.config.agentName,
        "agentmesh.model": this.config.model,
      },
    }, (runSpan: Span) => this._executeInSpan(runSpan));
  }

  private async _executeInSpan(runSpan: Span): Promise<RunLoopResult> {
    const allEvents: ExecutionEvent[] = [];
    const totalUsage: ProviderUsage = { inputTokens: 0, outputTokens: 0 };

    const emitEvent = (event: ExecutionEvent): void => {
      allEvents.push(event);
      this.deps.onEvent?.(event);
    };

    // 1. Create run machine and transition to running
    const machineOptions: { parentRunId?: string; workflowId?: string } = {};
    if (this.config.parentRunId != null) machineOptions.parentRunId = this.config.parentRunId;
    if (this.config.workflowId != null) machineOptions.workflowId = this.config.workflowId;

    let machine = createRunMachine(this.config.runId, this.config.budget, machineOptions);

    const startResult = transition(machine, "running");
    machine = startResult.state;
    emitEvent(startResult.event);

    // 2. Build initial messages
    const messages: ProviderMessage[] = [];
    if (this.config.systemPrompt != null) {
      messages.push({ role: "system", content: this.config.systemPrompt });
    }
    messages.push({ role: "user", content: this.config.goal });

    // 3. Create step executor
    const stepExecutor = new StepExecutor(
      this.deps.provider,
      this.deps.toolHandler,
      this.deps.policyChecker,
    );

    // 4. Run loop
    let currentMessages = messages;
    let finalStatus: RunLoopResult["status"] = "failed";
    let output: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // 4a. Check budget
      const budgetCheck = checkBudget(machine);
      if (budgetCheck !== "ok") {
        finalStatus = "budget_exceeded";
        break;
      }

      // 4b. Execute step
      const stepResult = await stepExecutor.execute({
        runId: this.config.runId,
        stepIndex: machine.stepCount,
        model: this.config.model,
        messages: currentMessages,
        currentStepCount: machine.stepCount,
        totalCostUsd: machine.totalCostUsd,
      });

      // 4c. Collect events
      for (const event of stepResult.events) {
        emitEvent(event);
      }

      // 4d. Update messages
      currentMessages = stepResult.messages;

      // 4e. Accumulate usage and increment step
      totalUsage.inputTokens += stepResult.usage.inputTokens;
      totalUsage.outputTokens += stepResult.usage.outputTokens;
      const costUsd =
        (stepResult.usage.inputTokens * 3 + stepResult.usage.outputTokens * 15) /
        1_000_000;
      machine = incrementStep(machine, costUsd);

      // 4f. Check finish reason
      if (stepResult.blocked) {
        finalStatus = "failed";
        break;
      }

      if (stepResult.finishReason === "error") {
        finalStatus = "failed";
        break;
      }

      if (stepResult.finishReason === "stop") {
        finalStatus = "succeeded";
        // Extract output from last assistant message
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          const msg = currentMessages[i];
          if (msg != null && msg.role === "assistant" && msg.content != null) {
            output = msg.content;
            break;
          }
        }
        break;
      }

      // tool_calls → continue loop
    }

    // 5. Transition to terminal state
    const terminalStatus =
      finalStatus === "budget_exceeded" ? "failed" : finalStatus;
    const endResult = transition(machine, terminalStatus);
    machine = endResult.state;
    emitEvent(endResult.event);

    runSpan.setAttributes({
      "agentmesh.run.status": finalStatus,
      "agentmesh.run.total_steps": machine.stepCount,
      "agentmesh.run.total_cost_usd": machine.totalCostUsd,
      "agentmesh.run.input_tokens": totalUsage.inputTokens,
      "agentmesh.run.output_tokens": totalUsage.outputTokens,
    });

    if (finalStatus !== "succeeded") {
      runSpan.setStatus({ code: SpanStatusCode.ERROR, message: finalStatus });
    }
    runSpan.end();

    return {
      status: finalStatus,
      output,
      messages: currentMessages,
      totalSteps: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
      events: allEvents,
      usage: totalUsage,
    };
  }
}
