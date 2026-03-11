import { RunLoop } from "@agentmesh/core";
import type { RunLoopDeps, RunLoopResult } from "@agentmesh/core";
import type { WorkflowDef, WorkflowNodeDef } from "./types.js";
import { topologicalLevels, getUpstreamNodes } from "./dag.js";

export type WorkflowEvent =
  | { type: "workflow.started"; workflowId: string }
  | { type: "workflow.node.started"; workflowId: string; nodeId: string; runId: string }
  | { type: "workflow.node.completed"; workflowId: string; nodeId: string; output: string | null }
  | { type: "workflow.node.failed"; workflowId: string; nodeId: string; error: string }
  | { type: "workflow.completed"; workflowId: string; results: Record<string, RunLoopResult> }
  | { type: "workflow.failed"; workflowId: string; failedNode: string; error: string };

export interface WorkflowOrchestratorDeps {
  /** Resolve RunLoopDeps for each node */
  resolveNodeDeps: (nodeId: string, nodeDef: WorkflowNodeDef) => RunLoopDeps;
  onEvent?: ((event: WorkflowEvent) => void) | undefined;
}

export interface WorkflowResult {
  status: "completed" | "failed";
  nodeResults: Record<string, RunLoopResult>;
  failedNode?: string | undefined;
}

let workflowSeq = 0;

export class WorkflowOrchestrator {
  private readonly def: WorkflowDef;
  private readonly deps: WorkflowOrchestratorDeps;

  constructor(def: WorkflowDef, deps: WorkflowOrchestratorDeps) {
    this.def = def;
    this.deps = deps;
  }

  async execute(): Promise<WorkflowResult> {
    const workflowId = `wf_${++workflowSeq}`;
    const nodeResults: Record<string, RunLoopResult> = {};
    const nodeOutputs: Record<string, string | null> = {};
    const nodeMap = new Map(this.def.nodes.map((n) => [n.id, n]));

    this.emit({ type: "workflow.started", workflowId });

    const levels = topologicalLevels(this.def.nodes, this.def.edges);

    for (const level of levels) {
      const promises = level.map(async (nodeId) => {
        const nodeDef = nodeMap.get(nodeId)!;

        // Resolve goal: static string or dynamic function with upstream outputs
        const upstreamIds = getUpstreamNodes(nodeId, this.def.edges);
        const inputs: Record<string, string | null> = {};
        for (const upId of upstreamIds) {
          inputs[upId] = nodeOutputs[upId] ?? null;
        }

        const goal = typeof nodeDef.goal === "function" ? nodeDef.goal(inputs) : nodeDef.goal;

        const runId = `${workflowId}_${nodeId}`;
        this.emit({ type: "workflow.node.started", workflowId, nodeId, runId });

        const deps = this.deps.resolveNodeDeps(nodeId, nodeDef);
        const loop = new RunLoop(
          {
            runId,
            agentName: nodeDef.agentName,
            goal,
            model: nodeDef.model,
            systemPrompt: nodeDef.systemPrompt,
            budget: nodeDef.budget,
            workflowId,
          },
          deps,
        );

        const result = await loop.execute();
        nodeResults[nodeId] = result;
        nodeOutputs[nodeId] = result.output;

        if (result.status === "succeeded") {
          this.emit({ type: "workflow.node.completed", workflowId, nodeId, output: result.output });
        } else {
          this.emit({ type: "workflow.node.failed", workflowId, nodeId, error: result.status });
        }

        return { nodeId, result };
      });

      const results = await Promise.all(promises);

      // Fail-fast: if any node in this level failed, stop the workflow
      const failed = results.find((r) => r.result.status !== "succeeded");
      if (failed) {
        this.emit({
          type: "workflow.failed",
          workflowId,
          failedNode: failed.nodeId,
          error: failed.result.status,
        });
        return {
          status: "failed",
          nodeResults,
          failedNode: failed.nodeId,
        };
      }
    }

    this.emit({ type: "workflow.completed", workflowId, results: nodeResults });
    return { status: "completed", nodeResults };
  }

  private emit(event: WorkflowEvent): void {
    this.deps.onEvent?.(event);
  }
}

/**
 * Helper: create a resolveNodeDeps function that returns the same deps for all nodes.
 */
export function createUniformDeps(deps: RunLoopDeps): WorkflowOrchestratorDeps["resolveNodeDeps"] {
  return () => deps;
}
