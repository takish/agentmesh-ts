import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "@agentmesh/core";
import type { PolicyChecker, ProviderMessage } from "@agentmesh/core";
import { OpenAIProvider } from "@agentmesh/provider-openai";
import {
  PolicyEngine,
  StepBudgetRule,
  CostBudgetRule,
} from "@agentmesh/policy";

// --- Config ---
const TICKET = process.argv[2] ?? `Subject: Can't log in after password reset
From: alice@example.com
Priority: High

I reset my password yesterday, and now I keep getting "Invalid credentials" when I try to log in.
I've tried clearing cookies and using a different browser, but nothing works.
This is blocking my team from accessing our project dashboard.`;

const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_STEPS = 3;
const MAX_COST = 0.20;

const SYSTEM_PROMPT = `You are a customer support triage agent. Your job is to:

1. **Classify** the ticket into one of these categories:
   - bug: Software defect or malfunction
   - feature: Feature request or enhancement
   - billing: Payment, subscription, or pricing issue
   - account: Account access, permissions, or settings
   - other: Anything that doesn't fit above

2. **Assess priority**: P0 (critical), P1 (high), P2 (medium), P3 (low)

3. **Route** to the appropriate team:
   - engineering: For bugs and technical issues
   - product: For feature requests
   - finance: For billing issues
   - support-l2: For account and complex issues

4. **Draft a reply** to the customer that:
   - Acknowledges their issue
   - Sets expectations for resolution time
   - Asks for any additional info if needed

Respond in this exact JSON format:
{
  "category": "bug|feature|billing|account|other",
  "priority": "P0|P1|P2|P3",
  "team": "engineering|product|finance|support-l2",
  "summary": "One-line summary of the issue",
  "draft_reply": "The reply to send to the customer"
}`;

async function main() {
  console.log(`\n📋 Support Triage Agent`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Budget: ${MAX_STEPS} steps, $${MAX_COST}\n`);
  console.log(`--- Ticket ---`);
  console.log(TICKET);
  console.log(`--------------\n`);

  // 1. Setup provider
  const provider = new OpenAIProvider();

  // 2. No tools needed — LLM-only classification
  const toolHandler = {
    execute: async () => ({ output: "{}", durationMs: 0 }),
    toToolSpecs: () => [],
  };

  // 3. Setup policy
  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));

  const policyChecker: PolicyChecker = {
    evaluate: (ctx) => policyEngine.evaluate(ctx),
  };

  // 4. Setup step executor
  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  // 5. Run
  let machine = createRunMachine("run_triage_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  const messages: ProviderMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Please triage this support ticket:\n\n${TICKET}` },
  ];

  const budget = checkBudget(machine);
  if (budget !== "ok") {
    console.log(`Budget exceeded: ${budget}`);
    return;
  }

  console.log(`--- Processing ---`);
  const result = await stepExecutor.execute({
    runId: machine.runId,
    stepIndex: 0,
    model: MODEL,
    messages,
    currentStepCount: machine.stepCount,
    totalCostUsd: machine.totalCostUsd,
  });

  machine = incrementStep(machine, result.usage.inputTokens * 0.00001 + result.usage.outputTokens * 0.00003);

  console.log(`   Tokens: ${result.usage.inputTokens}in / ${result.usage.outputTokens}out`);
  console.log(`   Cost: $${machine.totalCostUsd.toFixed(4)}`);

  const lastMessage = result.messages.at(-1);
  if (lastMessage?.content) {
    console.log(`\n--- Triage Result ---`);
    try {
      const triage = JSON.parse(lastMessage.content);
      console.log(`   Category: ${triage.category}`);
      console.log(`   Priority: ${triage.priority}`);
      console.log(`   Route to: ${triage.team}`);
      console.log(`   Summary:  ${triage.summary}`);
      console.log(`\n--- Draft Reply ---`);
      console.log(triage.draft_reply);
    } catch {
      console.log(lastMessage.content);
    }
  }

  console.log(`\n--- Done ---`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
