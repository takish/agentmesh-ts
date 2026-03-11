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
  readFileTool,
  runShellTool,
} from "@agentmesh/toolkit";
import {
  PolicyEngine,
  ToolAllowlistRule,
  StepBudgetRule,
  CostBudgetRule,
} from "@agentmesh/policy";

// --- Config ---
const DIFF_TARGET = process.argv[2] ?? "HEAD~1";
const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_STEPS = 5;
const MAX_COST = 0.50;

const SYSTEM_PROMPT = `You are a code review agent. Your workflow:

1. Run \`git diff ${DIFF_TARGET}\` using the run_shell tool to get the changes
2. If the diff is large, use read_file to examine specific files for more context
3. Provide a structured review with:

**Format your final response as:**

## Code Review

### Summary
One paragraph overview of the changes.

### Issues Found
For each issue:
- **File**: path/to/file.ts:lineNumber
- **Severity**: error | warning | suggestion
- **Description**: What's wrong and why
- **Suggestion**: How to fix it

### Positive Aspects
What was done well.

### Overall Assessment
APPROVE | REQUEST_CHANGES | COMMENT

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and readability
- Missing error handling
- Test coverage gaps`;

async function main() {
  console.log(`\n🔍 Code Review Agent`);
  console.log(`   Diff target: ${DIFF_TARGET}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Budget: ${MAX_STEPS} steps, $${MAX_COST}\n`);

  // 1. Setup provider
  const provider = new OpenAIProvider();

  // 2. Setup tools — read_file + run_shell only
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(runShellTool);

  const toolExecutor = new ToolExecutor(registry);
  const toolHandler: ToolHandler = {
    execute: (name, input) => toolExecutor.execute(name, input),
    toToolSpecs: () => registry.toJsonSchemas().map((s) => ({
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    })),
  };

  // 3. Setup policy — restrict to safe tools only
  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new ToolAllowlistRule(new Set(["read_file", "run_shell"])));
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));

  const policyChecker: PolicyChecker = {
    evaluate: (ctx) => policyEngine.evaluate(ctx),
  };

  // 4. Setup step executor
  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  // 5. Run loop
  let machine = createRunMachine("run_review_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  let messages: ProviderMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Please review the code changes in \`git diff ${DIFF_TARGET}\`. Start by running the diff command.` },
  ];

  for (let i = 0; i < MAX_STEPS; i++) {
    const budget = checkBudget(machine);
    if (budget !== "ok") {
      console.log(`Budget exceeded: ${budget}`);
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

    console.log(`   Finish: ${result.finishReason}`);
    console.log(`   Tokens: ${result.usage.inputTokens}in / ${result.usage.outputTokens}out`);
    for (const tc of result.toolCallResults) {
      console.log(`   Tool: ${tc.toolName} (${tc.status}, ${tc.durationMs}ms)`);
    }

    if (result.finishReason === "stop") {
      const lastMessage = messages.at(-1);
      console.log(`\n${"=".repeat(60)}`);
      console.log(lastMessage?.content);
      console.log(`${"=".repeat(60)}`);
      break;
    }

    if (result.blocked) {
      console.log(`Blocked by policy`);
      break;
    }

    if (result.finishReason === "error") {
      console.log(`Error occurred`);
      break;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`   Steps: ${machine.stepCount}`);
  console.log(`   Cost: $${machine.totalCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
