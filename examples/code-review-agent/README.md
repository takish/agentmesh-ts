# Code Review Agent

Reads a git diff, examines changed files for context, and generates structured code review comments.

## Usage

```bash
# Review last commit
pnpm example:code-review

# Review specific diff target
pnpm example:code-review "main..HEAD"
pnpm example:code-review "HEAD~3"
```

## How it works

```
1. run_shell: git diff <target>
2. read_file: examine specific files (if needed)
3. LLM generates structured review:
   ├── Summary
   ├── Issues (file, severity, description, suggestion)
   ├── Positive aspects
   └── Overall: APPROVE | REQUEST_CHANGES | COMMENT
```

## Tools

- `read_file` — read source files for additional context
- `run_shell` — execute `git diff` to get changes

## Policy

- **ToolAllowlistRule**: only `read_file` and `run_shell`
- **StepBudgetRule**: max 5 steps
- **CostBudgetRule**: max $0.50

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `MODEL` | `gpt-4o-mini` | Model to use |
