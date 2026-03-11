# agentmesh-ts

[![CI](https://github.com/takish/agentmesh-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/takish/agentmesh-ts/actions/workflows/ci.yml)

```
     █████╗  ██████╗ ███████╗███╗   ██╗████████╗
    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
              ███╗   ███╗███████╗███████╗██╗  ██╗
              ████╗ ████║██╔════╝██╔════╝██║  ██║
              ██╔████╔██║█████╗  ███████╗███████║
              ██║╚██╔╝██║██╔══╝  ╚════██║██╔══██║
              ██║ ╚═╝ ██║███████╗███████║██║  ██║
              ╚═╝     ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝
```

> **Production-grade runtime for AI agents**
>
> Execute, trace, and govern AI agent workflows with typed tools, provider-agnostic orchestration, and policy-aware execution.

---

## What is this?

A TypeScript runtime that treats AI agent execution as a first-class engineering concern — not just "call LLM, parse output, loop."

Most agent frameworks focus on demos. AgentMesh focuses on what happens after the demo: traceability, governance, cost control, and reproducibility. Every step is recorded. Every tool call is validated. Every policy decision is auditable.

```
User → REST API → Runtime Loop → Provider (OpenAI / Anthropic)
                      ↓
              Policy Engine (approve / block)
                      ↓
              Tool Executor (typed, scoped, timeout-aware)
                      ↓
              Trace Store (PostgreSQL)
                      ↓
              Web UI (inspect, replay, govern)
```

---

## Why

LLM agent libraries are plentiful. Production-grade agent **runtimes** are not.

| Gap | What's missing |
|-----|---------------|
| **Traceability** | Most agents are black boxes. You can't see what happened at step 3 of 12. |
| **Governance** | No budget limits, no tool restrictions, no approval gates. |
| **Reproducibility** | Can't replay a failed run with the same inputs. |
| **Provider lock-in** | Switching from OpenAI to Anthropic means rewriting orchestration. |

AgentMesh closes these gaps.

---

## Features

- **Provider-agnostic** — OpenAI, Anthropic, Gemini. Same interface, swap freely.
- **Typed tool contracts** — Zod schemas for inputs/outputs, permission scopes, side-effect levels.
- **Step-level tracing** — Every LLM call, tool execution, and policy decision persisted.
- **Policy engine** — Cost budgets, tool allowlists, step limits, approval gates.
- **Replay-ready** — Re-run any execution from recorded event traces.
- **Developer UI** — Dark-themed run timeline, cost tracking, JSON inspection.

---

## Architecture

```
agentmesh-ts/
├── packages/
│   ├── core/                 # Run, Step, state machine, domain events
│   ├── toolkit/              # defineTool(), registry, executor
│   ├── policy/               # Rules engine, approval gates
│   ├── trace/                # Event persistence, metrics
│   ├── provider-openai/      # OpenAI adapter
│   ├── provider-anthropic/   # Anthropic adapter
│   └── ui-contracts/         # Shared types for API ↔ UI
├── apps/
│   ├── server/               # Fastify REST API
│   └── web/                  # Next.js dashboard
└── examples/
    ├── research-agent/       # Web search → summarize
    ├── support-triage-agent/ # Classify → route → draft
    └── code-review-agent/    # Read diff → find issues
```

---

## Core Concepts

### Run

One agent execution. Has a goal, a provider, allowed tools, and policy constraints.

```
queued → running → succeeded
                 → failed
                 → waiting_approval → running (approved)
                                    → cancelled
```

### Step

One unit of reasoning or action within a Run.

Kinds: `plan` | `llm_generation` | `tool_execution` | `policy_check` | `finalize`

### Tool

A typed, scoped capability the agent can invoke.

```typescript
const httpFetch = defineTool({
  name: "http_fetch",
  description: "Fetch a public HTTP resource",
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ status: z.number(), body: z.string() }),
  permissionScope: "network:read",
  sideEffectLevel: "external_read",
  timeoutMs: 10_000,
  async execute(input) {
    const res = await fetch(input.url);
    return { status: res.status, body: await res.text() };
  },
});
```

### Policy

Rules evaluated before every tool execution.

```typescript
const costBudget: PolicyRule = {
  name: "cost_budget",
  async evaluate(ctx) {
    const over = ctx.run.estimatedCostUsd > ctx.run.maxCostUsd;
    return { allowed: !over, severity: "block", reason: "Cost budget exceeded" };
  },
};
```

### Trace

Immutable event log of everything that happened in a Run.

Events: `run.started` → `step.started` → `llm.called` → `llm.responded` → `tool.requested` → `policy.checked` → `tool.completed` → `step.completed` → `run.completed`

---

## Quick Start

```bash
git clone https://github.com/takish/agentmesh-ts.git
cd agentmesh-ts
pnpm install
pnpm dev

# Run an example
pnpm example:research
```

---

## Runtime Loop

```typescript
while (!run.isFinished()) {
  const context = contextBuilder.build(run);

  const response = await provider.generate({
    model: run.model,
    messages: context.messages,
    tools: context.tools,
  });

  if (response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      const decision = await policyEngine.evaluate(toolCall, run);

      if (!decision.allowed) {
        run.fail(decision.reason);
        break;
      }

      if (decision.requiresApproval) {
        run.waitForApproval(decision.reason);
        break;
      }

      const result = await toolExecutor.execute(toolCall);
      run.appendObservation(result);
    }
    continue;
  }

  run.complete(response.finalText);
}
```

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Runtime** | TypeScript, Node.js, Zod |
| **API** | Fastify, Pino |
| **Persistence** | PostgreSQL, Drizzle ORM |
| **Web UI** | Next.js, React, Tailwind CSS, shadcn/ui |
| **Monorepo** | pnpm workspace, Turborepo |
| **Testing** | Vitest, Playwright |
| **Observability** | OpenTelemetry (planned) |

---

## Comparison

| Capability | AgentMesh | Basic wrapper | LangGraph |
|-----------|-----------|---------------|-----------|
| Typed tool contracts | Yes (Zod) | No | Partial |
| Policy engine | Yes | No | No |
| Step-level trace | Yes | No | Partial |
| Replay from trace | Yes | No | No |
| Provider abstraction | Yes | No | Yes |
| Cost tracking | Yes | No | No |
| Approval gates | Yes | No | No |
| Web UI | Yes | No | LangSmith |

---

## Roadmap

See [Issues](https://github.com/takish/agentmesh-ts/issues) and [Milestone: v0.1](https://github.com/takish/agentmesh-ts/milestone/1).

| Version | Focus |
|---------|-------|
| **v0.1** | Core runtime, providers, tools, policy, persistence, API, Web UI, first example |
| **v0.2** | Replay, checkpoint/resume, token/cost tracking, parallel tools, OTel |
| **v0.3** | Queue worker, distributed runs, MCP adapter, hosted mode |

---

## Design Principles

- **Explicit over implicit** — No magic. Every behavior is traceable.
- **Replayability first** — If you can't replay it, you can't debug it.
- **Tools are contracts** — Schema in, schema out. No stringly-typed APIs.
- **Providers are replaceable** — Business logic doesn't know about OpenAI vs Anthropic.
- **Traces are first-class** — Not an afterthought. The core data model.

---

## License

MIT
