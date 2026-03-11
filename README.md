# AgentMesh TS

> Production-grade runtime for AI agents.

Execute, trace, replay, and govern AI agent workflows with typed tools, provider-agnostic orchestration, and policy-aware execution.

## Status

🚧 Under active development — see [Issues](https://github.com/takish/agentmesh-ts/issues) for roadmap.

## Features (planned)

- **Provider-agnostic runtime** — OpenAI / Anthropic / Gemini, swap freely
- **Typed tools with Zod** — Schema-validated inputs, permission scopes, side-effect classification
- **Step-level tracing** — Every LLM call, tool execution, and policy decision recorded
- **Policy engine** — Cost budgets, tool allowlists, approval gates for dangerous actions
- **Replay-ready architecture** — Re-run any execution from recorded traces
- **Developer UI** — Dark-themed dashboard with run timeline, cost tracking, and JSON inspection

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Web UI (Next.js)               │
├─────────────────────────────────────────────────┤
│                 REST API (Fastify)                │
├──────┬──────┬──────┬──────┬──────┬──────────────┤
│ Core │ Tool │Policy│Trace │ Provider             │
│      │ kit  │Engine│      │ OpenAI / Anthropic   │
├──────┴──────┴──────┴──────┴──────┴──────────────┤
│              PostgreSQL (Drizzle ORM)            │
└─────────────────────────────────────────────────┘
```

## Tech Stack

**Backend:** TypeScript, Node.js, Fastify, PostgreSQL, Drizzle ORM, Zod, Pino
**Frontend:** Next.js, React, Tailwind CSS, shadcn/ui, TanStack Query
**Monorepo:** pnpm workspace, Turborepo
**Testing:** Vitest, Playwright

## License

MIT
