export interface RunSummary {
  id: string;
  agentName: string;
  goal: string;
  status: string;
  provider: string;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface StepSummary {
  id: string;
  runId: string;
  stepIndex: number;
  kind: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EventSummary {
  id: string;
  runId: string;
  stepId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RunDetail extends RunSummary {
  steps: StepSummary[];
}

export interface DashboardStats {
  totalRuns: number;
  successRate: number;
  averageCostUsd: number;
  recentFailures: RunSummary[];
}
