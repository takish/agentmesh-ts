#!/usr/bin/env node

import * as p from "@clack/prompts";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { ProjectConfig } from "./templates.js";
import { scaffold } from "./scaffold.js";

async function main() {
  p.intro("AgentMesh Setup");

  const projectName = await p.text({
    message: "Project name",
    placeholder: "my-agent",
    defaultValue: "my-agent",
    validate: (value) => {
      if (!value.trim()) return "Project name is required";
      if (!/^[a-z0-9-]+$/.test(value)) return "Use lowercase letters, numbers, and hyphens only";
      return undefined;
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const targetDir = resolve(process.cwd(), projectName);
  if (existsSync(targetDir)) {
    p.cancel(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  const provider = await p.select({
    message: "Provider",
    options: [
      { value: "openai" as const, label: "OpenAI", hint: "gpt-4o, gpt-4o-mini" },
      { value: "anthropic" as const, label: "Anthropic", hint: "claude-sonnet-4-20250514" },
      { value: "both" as const, label: "Both" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const modelOptions =
    provider === "anthropic"
      ? [
          { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", hint: "balanced" },
          { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "fast & cheap" },
        ]
      : [
          { value: "gpt-4o-mini", label: "gpt-4o-mini", hint: "fast & cheap" },
          { value: "gpt-4o", label: "gpt-4o", hint: "balanced" },
        ];

  const model = await p.select({
    message: "Default model",
    options: modelOptions,
  });

  if (p.isCancel(model)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const template = await p.select({
    message: "Template",
    options: [
      { value: "research" as const, label: "Research Agent", hint: "web search + summarize" },
      { value: "support-triage" as const, label: "Support Triage", hint: "ticket classification" },
      { value: "empty" as const, label: "Empty", hint: "minimal boilerplate" },
    ],
  });

  if (p.isCancel(template)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const config: ProjectConfig = {
    projectName,
    provider,
    model,
    template,
  };

  const s = p.spinner();
  s.start("Generating project...");

  const files = await scaffold(targetDir, config);

  s.stop("Project generated!");

  p.note(files.map((f) => `  ${f}`).join("\n"), "Created files");

  const providerKeyName =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";

  p.outro(`Next steps:

  cd ${projectName}
  npm install
  export ${providerKeyName}=sk-your-key
  npx tsx src/agent.ts`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
