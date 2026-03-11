import type { RunSummary } from "@agentmesh/ui-contracts";

const API_BASE = process.env.API_URL ?? "http://localhost:3100";

async function fetchRuns(): Promise<RunSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/runs?limit=20`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const STATUS_COLORS: Record<string, string> = {
  queued: "#6b7280",
  running: "#3b82f6",
  waiting_approval: "#f59e0b",
  succeeded: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

export default async function DashboardPage() {
  const runs = await fetchRuns();

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        AgentMesh Dashboard
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard label="Total Runs" value={runs.length} />
        <StatCard label="Succeeded" value={runs.filter((r) => r.status === "succeeded").length} />
        <StatCard label="Failed" value={runs.filter((r) => r.status === "failed").length} />
        <StatCard
          label="Total Cost"
          value={`$${runs.reduce((sum, r) => sum + r.estimatedCostUsd, 0).toFixed(4)}`}
        />
      </div>

      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Runs</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>Agent</th>
            <th style={{ padding: "0.5rem" }}>Goal</th>
            <th style={{ padding: "0.5rem" }}>Model</th>
            <th style={{ padding: "0.5rem" }}>Tokens</th>
            <th style={{ padding: "0.5rem" }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
                No runs yet. Start an agent to see results here.
              </td>
            </tr>
          ) : (
            runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: "0.5rem" }}>
                  <a href={`/runs/${run.id}`} style={{ textDecoration: "none" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: STATUS_COLORS[run.status] ?? "#333",
                        color: "#fff",
                      }}
                    >
                      {run.status}
                    </span>
                  </a>
                </td>
                <td style={{ padding: "0.5rem" }}>{run.agentName}</td>
                <td style={{ padding: "0.5rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {run.goal}
                </td>
                <td style={{ padding: "0.5rem", color: "#999" }}>{run.model}</td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.85rem" }}>
                  {(run.totalInputTokens + run.totalOutputTokens).toLocaleString()}
                </td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.85rem" }}>
                  ${run.estimatedCostUsd.toFixed(4)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "#161616", borderRadius: 8, padding: "1rem", border: "1px solid #222" }}>
      <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
