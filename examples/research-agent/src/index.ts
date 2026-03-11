import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "@agentmesh/core";
import type { ToolHandler, PolicyChecker, ProviderMessage } from "@agentmesh/core";
import { OpenAIProvider } from "@agentmesh/provider-openai";
import {
  ToolRegistry,
  ToolExecutor,
  webSearchTool,
  httpFetchTool,
} from "@agentmesh/toolkit";
import {
  PolicyEngine,
  ToolAllowlistRule,
  StepBudgetRule,
  CostBudgetRule,
} from "@agentmesh/policy";

// --- Config ---
const GOAL = process.argv[2] ?? "Summarize the latest OSS trends in 2026";
const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_STEPS = 5;
const MAX_COST = 0.50;

async function main() {
  console.log(`\n🔬 Research Agent`);
  console.log(`   Goal: ${GOAL}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Budget: ${MAX_STEPS} steps, $${MAX_COST}\n`);

  // 1. Setup provider
  const provider = new OpenAIProvider();

  // 2. Setup tools
  const registry = new ToolRegistry();
  registry.register(webSearchTool);
  registry.register(httpFetchTool);

  const toolExecutor = new ToolExecutor(registry);
  const toolHandler: ToolHandler = {
    execute: (name, input) => toolExecutor.execute(name, input),
    toToolSpecs: () => registry.toJsonSchemas().map((s) => ({
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    })),
  };

  // 3. Setup policy
  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new ToolAllowlistRule(new Set(["web_search", "http_fetch"])));
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));

  const policyChecker: PolicyChecker = {
    evaluate: (ctx) => policyEngine.evaluate(ctx),
  };

  // 4. Setup step executor
  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  // 5. Run loop
  let machine = createRunMachine("run_research_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  let messages: ProviderMessage[] = [
    {
      role: "system",
      content: "You are a research assistant. Use web_search and http_fetch tools to find information, then provide a comprehensive summary with sources.",
    },
    { role: "user", content: GOAL },
  ];

  for (let i = 0; i < MAX_STEPS; i++) {
    const budget = checkBudget(machine);
    if (budget !== "ok") {
      console.log(`⚠️  Budget exceeded: ${budget}`);
      break;
    }

    console.log(`\n--- Step ${i} ---`);
    const result = await stepExecutor.execute({
      runId: machine.runId,
      stepIndex: i,
      model: MODEL,
      messages,
      currentStepCount: machine.stepCount,
      totalCostUsd: machine.totalCostUsd,
    });

    messages = result.messages;
    machine = incrementStep(machine, result.usage.inputTokens * 0.00001 + result.usage.outputTokens * 0.00003);

    console.log(`   Finish reason: ${result.finishReason}`);
    console.log(`   Tokens: ${result.usage.inputTokens}in / ${result.usage.outputTokens}out`);
    console.log(`   Tool calls: ${result.toolCallResults.length}`);
    for (const tc of result.toolCallResults) {
      console.log(`     - ${tc.toolName}: ${tc.status} (${tc.durationMs}ms)`);
    }
    console.log(`   Events: ${result.events.map((e) => e.eventType).join(", ")}`);

    if (result.finishReason === "stop") {
      const lastMessage = messages.at(-1);
      console.log(`\n✅ Research complete!\n`);
      console.log(lastMessage?.content);
      break;
    }

    if (result.blocked) {
      console.log(`🚫 Blocked by policy`);
      break;
    }

    if (result.finishReason === "error") {
      console.log(`❌ Error occurred`);
      break;
    }
  }

  // Final status
  const finalStatus = machine.status === "running" ? "succeeded" : machine.status;
  console.log(`\n--- Summary ---`);
  console.log(`   Status: ${finalStatus}`);
  console.log(`   Steps: ${machine.stepCount}`);
  console.log(`   Total cost: $${machine.totalCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
