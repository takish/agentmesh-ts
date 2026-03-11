# Support Triage Agent

Classifies customer support tickets, assigns priority, routes to the right team, and drafts a reply — all using LLM only (no tools).

## Usage

```bash
# Default sample ticket
pnpm example:support-triage

# Custom ticket
pnpm example:support-triage "Subject: billing error\n\nI was charged twice this month."
```

## How it works

```
Ticket text → LLM classification → JSON output
  ├── category: bug | feature | billing | account | other
  ├── priority: P0 | P1 | P2 | P3
  ├── team:     engineering | product | finance | support-l2
  ├── summary:  one-line description
  └── draft_reply: customer-facing response
```

## Policy

- **StepBudgetRule**: max 3 steps
- **CostBudgetRule**: max $0.20

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `MODEL` | `gpt-4o-mini` | Model to use |
