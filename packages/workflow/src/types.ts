import type { RunBudget } from "@agentmesh/core";

export interface WorkflowNodeDef {
  id: string;
  agentName: string;
  /** Static goal string or dynamic function receiving upstream node outputs */
  goal: string | ((inputs: Record<string, string | null>) => string);
  model: string;
  systemPrompt?: string | undefined;
  budget?: RunBudget | undefined;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowDef {
  name: string;
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdge[];
}
