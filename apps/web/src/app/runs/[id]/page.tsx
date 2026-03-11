import type { RunDetail, EventSummary } from "@agentmesh/ui-contracts";

const API_BASE = process.env.API_URL ?? "http://localhost:3100";

async function fetchRun(id: string): Promise<RunDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/runs/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchEvents(id: string): Promise<EventSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/runs/${id}/events`, { cache: "no-store" });
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
  pending: "#6b7280",
  skipped: "#6b7280",
};

const KIND_ICONS: Record<string, string> = {
  plan: "📋",
  llm_generation: "🤖",
  tool_execution: "🔧",
  policy_check: "🛡️",
  finalize: "✅",
};

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run, events] = await Promise.all([fetchRun(id), fetchEvents(id)]);

  if (!run) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <h1>Run not found</h1>
        <a href="/" style={{ color: "#3b82f6" }}>← Back to dashboard</a>
      </main>
    );
  }

  const totalTokens = run.totalInputTokens + run.totalOutputTokens;
  const duration = run.startedAt && run.finishedAt
    ? ((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)
    : null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
      <a href="/" style={{ color: "#3b82f6", fontSize: "0.85rem" }}>← Back to dashboard</a>

      {/* Header */}
      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 4,
              fontSize: "0.8rem",
              fontWeight: 600,
              background: STATUS_COLORS[run.status] ?? "#333",
              color: "#fff",
            }}
          >
            {run.status}
          </span>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{run.agentName}</h1>
        </div>
        <p style={{ color: "#999", margin: 0 }}>{run.goal}</p>
        <p style={{ color: "#666", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
          {run.provider}/{run.model} · {run.id}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
        <SummaryCard label="Input Tokens" value={run.totalInputTokens.toLocaleString()} />
        <SummaryCard label="Output Tokens" value={run.totalOutputTokens.toLocaleString()} />
        <SummaryCard label="Total Tokens" value={totalTokens.toLocaleString()} />
        <SummaryCard label="Cost" value={`$${run.estimatedCostUsd.toFixed(4)}`} />
        <SummaryCard label="Duration" value={duration ? `${duration}s` : "—"} />
      </div>

      {/* Steps Timeline */}
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>Steps</h2>
      {run.steps.length === 0 ? (
        <p style={{ color: "#666" }}>No steps recorded</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {run.steps.map((step) => (
            <div
              key={step.id}
              style={{
                background: "#161616",
                border: `1px solid ${step.status === "failed" ? "#ef4444" : "#222"}`,
                borderRadius: 8,
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>{KIND_ICONS[step.kind] ?? "⬜"}</span>
                <span style={{ fontWeight: 600 }}>Step {step.stepIndex}</span>
                <span style={{ color: "#888", fontSize: "0.85rem" }}>{step.kind}</span>
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 3,
                    fontSize: "0.7rem",
                    background: STATUS_COLORS[step.status] ?? "#333",
                    color: "#fff",
                  }}
                >
                  {step.status}
                </span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#888" }}>
                {(step.inputTokens + step.outputTokens).toLocaleString()} tok · ${step.costUsd.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Events */}
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "2rem 0 1rem" }}>Events</h2>
      {events.length === 0 ? (
        <p style={{ color: "#666" }}>No events recorded</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                background: "#111",
                borderRadius: 4,
                padding: "0.5rem 0.75rem",
                fontSize: "0.85rem",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                <span style={{ color: "#3b82f6", fontWeight: 600 }}>{event.eventType}</span>
                {event.stepId && <span style={{ color: "#666", marginLeft: "0.5rem" }}>{event.stepId}</span>}
              </span>
              <span style={{ color: "#555", fontFamily: "monospace", fontSize: "0.75rem" }}>
                {new Date(event.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#161616", borderRadius: 8, padding: "0.75rem", border: "1px solid #222" }}>
      <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "0.15rem" }}>{label}</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}
