import type { RunBudget } from "@agentmesh/core";
import type { WorkflowDef, WorkflowNodeDef, WorkflowEdge } from "./types.js";
import { validateDag } from "./dag.js";

interface NodeConfig {
  agentName: string;
  goal: string | ((inputs: Record<string, string | null>) => string);
  model: string;
  systemPrompt?: string | undefined;
  budget?: RunBudget | undefined;
}

class WorkflowBuilder {
  private readonly nodes: WorkflowNodeDef[] = [];
  private readonly edges: WorkflowEdge[] = [];

  constructor(private readonly name: string) {}

  node(id: string, config: NodeConfig): this {
    this.nodes.push({ id, ...config });
    return this;
  }

  edge(from: string, to: string): this {
    this.edges.push({ from, to });
    return this;
  }

  build(): WorkflowDef {
    validateDag(this.nodes, this.edges);
    return {
      name: this.name,
      nodes: [...this.nodes],
      edges: [...this.edges],
    };
  }
}

export function defineWorkflow(name: string): WorkflowBuilder {
  return new WorkflowBuilder(name);
}
