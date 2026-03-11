import type { WorkflowNodeDef, WorkflowEdge } from "./types.js";

export class DagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DagValidationError";
  }
}

/**
 * Validate that nodes and edges form a valid DAG.
 * Throws DagValidationError on: duplicate node IDs, invalid edge references, cycles.
 */
export function validateDag(nodes: WorkflowNodeDef[], edges: WorkflowEdge[]): void {
  if (nodes.length === 0) {
    throw new DagValidationError("Workflow must have at least one node");
  }

  // Check duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new DagValidationError(`Duplicate node ID: "${node.id}"`);
    }
    nodeIds.add(node.id);
  }

  // Check edge references
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      throw new DagValidationError(`Edge references unknown node: "${edge.from}"`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new DagValidationError(`Edge references unknown node: "${edge.to}"`);
    }
    if (edge.from === edge.to) {
      throw new DagValidationError(`Self-referencing edge: "${edge.from}"`);
    }
  }

  // Cycle detection via Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const neighbor of adjacency.get(current)!) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (visited !== nodeIds.size) {
    throw new DagValidationError("Workflow contains a cycle");
  }
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns array of levels — each level contains node IDs that can run in parallel.
 *
 * Example: A→B, A→C, B→D, C→D → [["A"], ["B","C"], ["D"]]
 */
export function topologicalLevels(nodes: WorkflowNodeDef[], edges: WorkflowEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
  }

  const levels: string[][] = [];
  let currentLevel: string[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) currentLevel.push(id);
  }

  while (currentLevel.length > 0) {
    currentLevel.sort(); // deterministic ordering
    levels.push(currentLevel);

    const nextLevel: string[] = [];
    for (const nodeId of currentLevel) {
      for (const neighbor of adjacency.get(nodeId)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) nextLevel.push(neighbor);
      }
    }
    currentLevel = nextLevel;
  }

  return levels;
}

/**
 * Get upstream (parent) node IDs for a given node.
 */
export function getUpstreamNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((e) => e.to === nodeId).map((e) => e.from);
}
