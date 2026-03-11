export interface ProjectConfig {
  projectName: string;
  provider: "openai" | "anthropic" | "both";
  model: string;
  template: "research" | "support-triage" | "empty";
}

export function generatePackageJson(config: ProjectConfig): string {
  const deps: Record<string, string> = {
    "@agentmesh/core": "^0.1.0",
    "@agentmesh/policy": "^0.1.0",
    "@agentmesh/toolkit": "^0.1.0",
  };

  if (config.provider === "openai" || config.provider === "both") {
    deps["@agentmesh/provider-openai"] = "^0.1.0";
  }
  if (config.provider === "anthropic" || config.provider === "both") {
    deps["@agentmesh/provider-anthropic"] = "^0.1.0";
  }

  const pkg = {
    name: config.projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx src/agent.ts",
      build: "tsc",
      typecheck: "tsc --noEmit",
    },
    dependencies: deps,
    devDependencies: {
      "@types/node": "^25.4.0",
      tsx: "^4.21.0",
      typescript: "^5.8.3",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

export function generateTsconfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true,
    },
    include: ["src"],
    exclude: ["node_modules", "dist"],
  };

  return JSON.stringify(config, null, 2) + "\n";
}

export function generateEnv(config: ProjectConfig): string {
  const lines: string[] = ["# AgentMesh environment variables", ""];

  if (config.provider === "openai" || config.provider === "both") {
    lines.push("OPENAI_API_KEY=sk-your-key-here");
  }
  if (config.provider === "anthropic" || config.provider === "both") {
    lines.push("ANTHROPIC_API_KEY=sk-ant-your-key-here");
  }

  lines.push("");
  lines.push(`MODEL=${config.model}`);
  lines.push("");

  return lines.join("\n");
}

export function generateGitignore(): string {
  return `node_modules/
dist/
.env
*.tsbuildinfo
`;
}

export function generateAgentCode(config: ProjectConfig): string {
  if (config.template === "empty") {
    return generateEmptyAgent(config);
  }
  if (config.template === "support-triage") {
    return generateSupportTriageAgent(config);
  }
  return generateResearchAgent(config);
}

function getProviderImport(config: ProjectConfig): string {
  if (config.provider === "anthropic") {
    return `import { AnthropicProvider } from "@agentmesh/provider-anthropic";`;
  }
  return `import { OpenAIProvider } from "@agentmesh/provider-openai";`;
}

function getProviderInit(config: ProjectConfig): string {
  if (config.provider === "anthropic") {
    return `new AnthropicProvider()`;
  }
  return `new OpenAIProvider()`;
}

function generateEmptyAgent(config: ProjectConfig): string {
  return `import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "@agentmesh/core";
import type { PolicyChecker, ProviderMessage } from "@agentmesh/core";
${getProviderImport(config)}
import { PolicyEngine, StepBudgetRule, CostBudgetRule } from "@agentmesh/policy";

const GOAL = process.argv[2] ?? "Hello, world!";
const MODEL = process.env.MODEL ?? "${config.model}";
const MAX_STEPS = 3;
const MAX_COST = 0.10;

async function main() {
  console.log("Agent starting...");
  console.log("Goal:", GOAL);

  const provider = ${getProviderInit(config)};

  const toolHandler = {
    execute: async () => ({ output: "{}", durationMs: 0 }),
    toToolSpecs: () => [],
  };

  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));
  const policyChecker: PolicyChecker = { evaluate: (ctx) => policyEngine.evaluate(ctx) };

  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  let machine = createRunMachine("run_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  const messages: ProviderMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: GOAL },
  ];

  const budget = checkBudget(machine);
  if (budget !== "ok") {
    console.log("Budget exceeded:", budget);
    return;
  }

  const result = await stepExecutor.execute({
    runId: machine.runId,
    stepIndex: 0,
    model: MODEL,
    messages,
    currentStepCount: machine.stepCount,
    totalCostUsd: machine.totalCostUsd,
  });

  machine = incrementStep(machine, result.usage.inputTokens * 0.00001 + result.usage.outputTokens * 0.00003);

  const lastMessage = result.messages.at(-1);
  console.log("\\nResponse:", lastMessage?.content);
  console.log("Tokens:", result.usage.inputTokens, "in /", result.usage.outputTokens, "out");
}

main().catch(console.error);
`;
}

function generateResearchAgent(config: ProjectConfig): string {
  return `import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "@agentmesh/core";
import type { ToolHandler, PolicyChecker, ProviderMessage } from "@agentmesh/core";
${getProviderImport(config)}
import { ToolRegistry, ToolExecutor, webSearchTool, httpFetchTool } from "@agentmesh/toolkit";
import { PolicyEngine, ToolAllowlistRule, StepBudgetRule, CostBudgetRule } from "@agentmesh/policy";

const GOAL = process.argv[2] ?? "Summarize the latest trends in AI agents";
const MODEL = process.env.MODEL ?? "${config.model}";
const MAX_STEPS = 5;
const MAX_COST = 0.50;

async function main() {
  console.log("Research Agent");
  console.log("Goal:", GOAL);
  console.log("Model:", MODEL);

  const provider = ${getProviderInit(config)};

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

  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new ToolAllowlistRule(new Set(["web_search", "http_fetch"])));
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));
  const policyChecker: PolicyChecker = { evaluate: (ctx) => policyEngine.evaluate(ctx) };

  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  let machine = createRunMachine("run_research_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  let messages: ProviderMessage[] = [
    { role: "system", content: "You are a research assistant. Use web_search and http_fetch to find information, then provide a summary with sources." },
    { role: "user", content: GOAL },
  ];

  for (let i = 0; i < MAX_STEPS; i++) {
    const budget = checkBudget(machine);
    if (budget !== "ok") {
      console.log("Budget exceeded:", budget);
      break;
    }

    console.log("\\n--- Step", i, "---");
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

    console.log("  Finish:", result.finishReason);
    for (const tc of result.toolCallResults) {
      console.log("  Tool:", tc.toolName, tc.status, tc.durationMs + "ms");
    }

    if (result.finishReason === "stop") {
      console.log("\\nResult:\\n", messages.at(-1)?.content);
      break;
    }
    if (result.blocked || result.finishReason === "error") break;
  }

  console.log("\\nSteps:", machine.stepCount, "Cost: $" + machine.totalCostUsd.toFixed(4));
}

main().catch(console.error);
`;
}

function generateSupportTriageAgent(config: ProjectConfig): string {
  return `import {
  createRunMachine,
  transition,
  incrementStep,
  checkBudget,
  StepExecutor,
} from "@agentmesh/core";
import type { PolicyChecker, ProviderMessage } from "@agentmesh/core";
${getProviderImport(config)}
import { PolicyEngine, StepBudgetRule, CostBudgetRule } from "@agentmesh/policy";

const TICKET = process.argv[2] ?? \`Subject: Can't log in after password reset
From: alice@example.com

I reset my password yesterday, and now I keep getting "Invalid credentials".
I've tried clearing cookies and using a different browser, but nothing works.\`;

const MODEL = process.env.MODEL ?? "${config.model}";
const MAX_STEPS = 3;
const MAX_COST = 0.20;

const SYSTEM_PROMPT = \`You are a customer support triage agent. Classify the ticket and respond in JSON:
{
  "category": "bug|feature|billing|account|other",
  "priority": "P0|P1|P2|P3",
  "team": "engineering|product|finance|support-l2",
  "summary": "One-line summary",
  "draft_reply": "Reply to customer"
}\`;

async function main() {
  console.log("Support Triage Agent");

  const provider = ${getProviderInit(config)};

  const toolHandler = {
    execute: async () => ({ output: "{}", durationMs: 0 }),
    toToolSpecs: () => [],
  };

  const policyEngine = new PolicyEngine();
  policyEngine.addRule(new StepBudgetRule(MAX_STEPS));
  policyEngine.addRule(new CostBudgetRule(MAX_COST));
  const policyChecker: PolicyChecker = { evaluate: (ctx) => policyEngine.evaluate(ctx) };

  const stepExecutor = new StepExecutor(provider, toolHandler, policyChecker);

  let machine = createRunMachine("run_triage_1", { maxSteps: MAX_STEPS, maxCostUsd: MAX_COST });
  const { state: running } = transition(machine, "running");
  machine = running;

  const messages: ProviderMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Triage this ticket:\\n\\n" + TICKET },
  ];

  const result = await stepExecutor.execute({
    runId: machine.runId,
    stepIndex: 0,
    model: MODEL,
    messages,
    currentStepCount: machine.stepCount,
    totalCostUsd: machine.totalCostUsd,
  });

  machine = incrementStep(machine, result.usage.inputTokens * 0.00001 + result.usage.outputTokens * 0.00003);

  const lastMessage = result.messages.at(-1);
  if (lastMessage?.content) {
    try {
      const triage = JSON.parse(lastMessage.content);
      console.log("Category:", triage.category);
      console.log("Priority:", triage.priority);
      console.log("Team:", triage.team);
      console.log("Summary:", triage.summary);
      console.log("\\nDraft Reply:\\n", triage.draft_reply);
    } catch {
      console.log(lastMessage.content);
    }
  }
}

main().catch(console.error);
`;
}
