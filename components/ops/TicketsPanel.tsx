"use client";

import React, { useEffect, useState } from "react";

interface ServiceInfo {
  name: string;
  status: string;
  latencyMs: number;
}

interface OpsTicket {
  id: string;
  title: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved";
  createdAt: string;
  updatedAt: string;
  logs: string;
  snapshot: {
    cpu: number;
    memUsedPct: number;
    timestamp: number;
    services: ServiceInfo[];
  };
  linkedWorkflowId?: string;
  linkedRunId?: string;
  notes: string;
}

interface TicketsPanelProps {
  refreshKey: number;
  onTicketCountChange?: (n: number) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  low:      "#6b7280",
  medium:   "#f59e0b",
  high:     "#f97316",
  critical: "#dc2828",
};

const STATUS_COLORS: Record<string, string> = {
  open:          "#3b82f6",
  investigating: "#f59e0b",
  resolved:      "#22c55e",
};

export function TicketsPanel({ refreshKey, onTicketCountChange }: TicketsPanelProps) {
  const [tickets, setTickets] = useState<OpsTicket[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchTickets() {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/tickets");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
  }, [refreshKey]);

  useEffect(() => {
    onTicketCountChange?.(tickets.length);
  }, [tickets.length, onTicketCountChange]);

  async function updateStatus(ticket: OpsTicket, newStatus: OpsTicket["status"]) {
    setSaving(ticket.id);
    try {
      await fetch("/api/ops/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, status: newStatus }),
      });
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, status: newStatus } : t))
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveNotes(ticket: OpsTicket) {
    setSaving(ticket.id);
    try {
      await fetch("/api/ops/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, notes: notes[ticket.id] ?? ticket.notes }),
      });
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id ? { ...t, notes: notes[ticket.id] ?? t.notes } : t
        )
      );
    } finally {
      setSaving(null);
    }
  }

  async function deleteTicket(id: string) {
    await fetch(`/api/ops/tickets?id=${id}`, { method: "DELETE" });
    setTickets((prev) => prev.filter((t) => t.id !== id));
    if (expanded === id) setExpanded(null);
  }

  if (loading && tickets.length === 0) {
    return (
      <div style={{ padding: 16, color: "#555", fontSize: 12, textAlign: "center" }}>
        Loading tickets...
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div style={{ padding: 16, color: "#555", fontSize: 12, textAlign: "center" }}>
        No tickets yet
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {tickets.map((ticket) => {
        const isExpanded = expanded === ticket.id;
        const sevColor = SEVERITY_COLORS[ticket.severity] ?? "#555";
        const statusColor = STATUS_COLORS[ticket.status] ?? "#555";
        const isSaving = saving === ticket.id;

        return (
          <div key={ticket.id} style={{ borderBottom: "1px solid #222" }}>
            {/* Row header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(isExpanded ? null : ticket.id)}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: `${sevColor}22`,
                  color: sevColor,
                  border: `1px solid ${sevColor}44`,
                  flexShrink: 0,
                }}
              >
                {ticket.severity}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: `${statusColor}22`,
                  color: statusColor,
                  border: `1px solid ${statusColor}44`,
                  flexShrink: 0,
                }}
              >
                {ticket.status}
              </span>
              <span style={{ fontSize: 11, color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ticket.title}
              </span>
              <span style={{ fontSize: 9, color: "#555", flexShrink: 0 }}>
                {ticket.service}
              </span>
              <span style={{ fontSize: 9, color: "#444", flexShrink: 0 }}>
                {new Date(ticket.createdAt).toLocaleDateString()}
              </span>
              <span style={{ color: "#555", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div
                style={{
                  padding: "0 12px 12px",
                  background: "#111",
                  borderTop: "1px solid #1a1a1a",
                }}
              >
                {/* Snapshot */}
                <div style={{ padding: "8px 0", fontSize: 10, color: "#888" }}>
                  <div style={{ marginBottom: 4 }}>
                    CPU: <span style={{ color: ticket.snapshot.cpu > 80 ? "#dc2828" : "#ccc" }}>{ticket.snapshot.cpu}%</span>
                    {" · "}
                    Memory: <span style={{ color: ticket.snapshot.memUsedPct > 85 ? "#dc2828" : "#ccc" }}>{ticket.snapshot.memUsedPct}%</span>
                    {" · "}
                    <span style={{ color: "#555" }}>{new Date(ticket.snapshot.timestamp).toLocaleString()}</span>
                  </div>
                  {ticket.snapshot.services.length > 0 && (
                    <div>
                      {ticket.snapshot.services.map((s) => (
                        <span key={s.name} style={{ marginRight: 8 }}>
                          <span style={{ color: s.status === "ok" ? "#22c55e" : "#dc2828" }}>{"●"}</span> {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Logs */}
                {ticket.logs && (
                  <div
                    style={{
                      background: "#0d0d0d",
                      border: "1px solid #222",
                      borderRadius: 4,
                      padding: "6px 8px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "#888",
                      marginBottom: 8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      maxHeight: 80,
                      overflowY: "auto",
                    }}
                  >
                    {ticket.logs}
                  </div>
                )}

                {/* Notes */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</div>
                  <textarea
                    value={notes[ticket.id] ?? ticket.notes}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                    }
                    rows={3}
                    style={{
                      width: "100%",
                      background: "#0d0d0d",
                      border: "1px solid #333",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 10,
                      color: "#ccc",
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={() => saveNotes(ticket)}
                    disabled={isSaving}
                    style={{
                      marginTop: 4,
                      background: "#1a2a1a",
                      border: "1px solid #22c55e44",
                      borderRadius: 4,
                      padding: "2px 10px",
                      fontSize: 9,
                      color: "#22c55e",
                      cursor: "pointer",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {isSaving ? "Saving..." : "SAVE NOTES"}
                  </button>
                </div>

                {/* Status buttons */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {(["open", "investigating", "resolved"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(ticket, s)}
                      disabled={ticket.status === s || isSaving}
                      style={{
                        background: ticket.status === s ? `${STATUS_COLORS[s]}22` : "transparent",
                        border: `1px solid ${ticket.status === s ? STATUS_COLORS[s] : "#333"}`,
                        borderRadius: 4,
                        padding: "3px 8px",
                        fontSize: 9,
                        fontWeight: 700,
                        color: ticket.status === s ? STATUS_COLORS[s] : "#555",
                        cursor: ticket.status === s ? "default" : "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => deleteTicket(ticket.id)}
                    style={{
                      marginLeft: "auto",
                      background: "rgba(220,40,40,0.1)",
                      border: "1px solid rgba(220,40,40,0.3)",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#dc2828",
                      cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
