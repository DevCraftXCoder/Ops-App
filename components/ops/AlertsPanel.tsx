"use client";

import React, { useState } from "react";

interface ServiceInfo {
  name: string;
  status: "ok" | "error";
  latencyMs: number;
}

interface MetricsData {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; free: number; usedPct: number };
  uptime: number;
  platform: string;
  services: ServiceInfo[];
  timestamp: number;
}

interface Alert {
  id: string;
  timestamp: number;
  service: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  snapshot: {
    cpu: number;
    memUsedPct: number;
    timestamp: number;
    services: ServiceInfo[];
  };
}

interface AlertsPanelProps {
  metrics: MetricsData | null;
  onTicketCreated: () => void;
  onAlertCountChange?: (n: number) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  low:      "#6b7280",
  medium:   "#f59e0b",
  high:     "#f97316",
  critical: "#dc2828",
};

function generateAlerts(metrics: MetricsData | null): Alert[] {
  if (!metrics) return [];
  const alerts: Alert[] = [];
  const snapshot = {
    cpu: metrics.cpu.usage,
    memUsedPct: metrics.memory.usedPct,
    timestamp: metrics.timestamp,
    services: metrics.services,
  };

  for (const svc of metrics.services) {
    if (svc.status === "error") {
      alerts.push({
        id: `svc-${svc.name}-${metrics.timestamp}`,
        timestamp: metrics.timestamp,
        service: svc.name,
        message: `Service "${svc.name}" is unreachable`,
        severity: "high",
        snapshot,
      });
    }
  }

  if (metrics.cpu.usage > 80) {
    alerts.push({
      id: `cpu-${metrics.timestamp}`,
      timestamp: metrics.timestamp,
      service: "system",
      message: `CPU usage is high: ${metrics.cpu.usage}%`,
      severity: metrics.cpu.usage > 95 ? "critical" : "high",
      snapshot,
    });
  }

  if (metrics.memory.usedPct > 85) {
    alerts.push({
      id: `mem-${metrics.timestamp}`,
      timestamp: metrics.timestamp,
      service: "system",
      message: `Memory usage is high: ${metrics.memory.usedPct}%`,
      severity: metrics.memory.usedPct > 95 ? "critical" : "high",
      snapshot,
    });
  }

  return alerts;
}

export function AlertsPanel({ metrics, onTicketCreated, onAlertCountChange }: AlertsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  const alerts = generateAlerts(metrics);

  React.useEffect(() => {
    onAlertCountChange?.(alerts.length);
  }, [alerts.length, onAlertCountChange]);

  async function createTicket(alert: Alert) {
    setCreating(alert.id);
    try {
      const res = await fetch("/api/ops/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: alert.message,
          service: alert.service,
          severity: alert.severity,
          logs: `Alert generated at ${new Date(alert.timestamp).toISOString()}`,
          snapshot: alert.snapshot,
        }),
      });
      if (res.ok) {
        setCreated((prev) => new Set([...prev, alert.id]));
        onTicketCreated();
      }
    } finally {
      setCreating(null);
    }
  }

  if (alerts.length === 0) {
    return (
      <div style={{ padding: "16px", color: "#555", fontSize: 12 }}>
        <div
          style={{
            borderLeft: "3px solid #22c55e",
            paddingLeft: 10,
            color: "#22c55e",
          }}
        >
          No active alerts
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {alerts.map((alert) => {
        const isExpanded = expanded === alert.id;
        const isCreated = created.has(alert.id);
        const isCreating = creating === alert.id;
        const color = SEVERITY_COLORS[alert.severity] ?? "#555";

        return (
          <div
            key={alert.id}
            style={{
              borderBottom: "1px solid #222",
              padding: "8px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: `${color}22`,
                  color,
                  border: `1px solid ${color}44`,
                  flexShrink: 0,
                }}
              >
                {alert.severity}
              </span>
              <span style={{ fontSize: 11, color: "#ccc", flex: 1 }}>{alert.message}</span>
              <span style={{ fontSize: 9, color: "#555", flexShrink: 0 }}>
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
              <button
                onClick={() => setExpanded(isExpanded ? null : alert.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#555",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "2px 4px",
                }}
              >
                {isExpanded ? "▲" : "▼"}
              </button>
              <button
                onClick={() => createTicket(alert)}
                disabled={isCreated || isCreating}
                style={{
                  background: isCreated ? "#1a3a1a" : "rgba(220,40,40,0.1)",
                  border: `1px solid ${isCreated ? "#22c55e33" : "rgba(220,40,40,0.3)"}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 700,
                  color: isCreated ? "#22c55e" : "#dc2828",
                  cursor: isCreated ? "default" : "pointer",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                {isCreating ? "..." : isCreated ? "CREATED" : "CREATE TICKET"}
              </button>
            </div>

            {isExpanded && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px",
                  background: "#111",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#888",
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  Service: <span style={{ color: "#ccc" }}>{alert.service}</span>
                </div>
                <div style={{ marginBottom: 4 }}>
                  CPU: <span style={{ color: alert.snapshot.cpu > 80 ? "#dc2828" : "#ccc" }}>{alert.snapshot.cpu}%</span>
                  {" · "}
                  Memory: <span style={{ color: alert.snapshot.memUsedPct > 85 ? "#dc2828" : "#ccc" }}>{alert.snapshot.memUsedPct}%</span>
                </div>
                <div>
                  Services:{" "}
                  {alert.snapshot.services.map((s) => (
                    <span key={s.name} style={{ marginRight: 6 }}>
                      <span style={{ color: s.status === "ok" ? "#22c55e" : "#dc2828" }}>{"●"}</span>{" "}
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
