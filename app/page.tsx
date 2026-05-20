"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ServerMetricsPanel } from "@/components/ops/ServerMetricsPanel";
import { AlertsPanel } from "@/components/ops/AlertsPanel";
import { TicketsPanel } from "@/components/ops/TicketsPanel";
import { CronManagerPanel } from "@/components/ops/CronManagerPanel";
import { SwarmPanel } from "@/components/ops/SwarmPanel";
import { WorkflowCanvas } from "@/components/ops/WorkflowCanvas";
import { usePm2Stats } from "@/hooks/usePm2Stats";
import { useMobile } from "@/hooks/useMobile";
import type { Node, Edge } from "@xyflow/react";

type MainTab = "dashboard" | "workflows" | "cron" | "swarm";

interface WorkflowData {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
}

export default function OpsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [metrics, setMetrics] = useState<Parameters<NonNullable<Parameters<typeof ServerMetricsPanel>[0]["onMetricsUpdate"]>>[0] | null>(null);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);
  const pm2Stats = usePm2Stats();
  const isMobile = useMobile();

  // Workflow state
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const saveFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch("/api/ops/workflows")
      .then((r) => (r.ok ? r.json() : { workflows: [] }))
      .then((d: { workflows: WorkflowData[] }) => {
        setWorkflows(d.workflows);
        if (d.workflows.length > 0) setActiveWorkflowId(d.workflows[0].id);
      })
      .catch(() => {});
  }, []);

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId) ?? null;

  const handleSaveWorkflow = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      if (!activeWorkflowId) return;
      const body = { id: activeWorkflowId, nodes, edges };
      const res = await fetch("/api/ops/workflows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setWorkflows((prev) =>
          prev.map((w) => (w.id === activeWorkflowId ? { ...w, nodes, edges } : w))
        );
        setCanvasDirty(false);
      }
    },
    [activeWorkflowId]
  );

  const handleCreateWorkflow = useCallback(async () => {
    const name = prompt("Workflow name:");
    if (!name?.trim()) return;
    const res = await fetch("/api/ops/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const wf: WorkflowData = await res.json();
      setWorkflows((prev) => [...prev, wf]);
      setActiveWorkflowId(wf.id);
    }
  }, []);

  const handleDeleteWorkflow = useCallback(
    async (id: string) => {
      if (!confirm("Delete this workflow?")) return;
      await fetch(`/api/ops/workflows?id=${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (activeWorkflowId === id) {
        setActiveWorkflowId(workflows.find((w) => w.id !== id)?.id ?? null);
      }
    },
    [activeWorkflowId, workflows]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 48,
          borderBottom: "1px solid #222",
          background: "#0d0d0d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#a855f7" }}>ops</span>
            <span style={{ color: "#555" }}>.app</span>
          </h1>
          <nav style={{ display: "flex", gap: 0 }}>
            {(
              [
                { key: "dashboard", label: "Dashboard" },
                { key: "workflows", label: "Workflows" },
                { key: "cron", label: "Cron" },
                { key: "swarm", label: "Swarm" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "12px 16px",
                  fontSize: 13,
                  color: activeTab === tab.key ? "#fff" : "#666",
                  background: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid #a855f7" : "2px solid transparent",
                  transition: "color 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#555" }}>
          {alertCount > 0 && (
            <span style={{ color: "#f59e0b", fontWeight: 700 }}>
              {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
          {ticketCount > 0 && (
            <span style={{ color: "#3b82f6" }}>
              {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "hidden" }}>
        {/* Dashboard tab */}
        {activeTab === "dashboard" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "280px 1fr 1fr",
              gridTemplateRows: "1fr",
              height: "100%",
              overflow: "hidden",
            }}
          >
            {/* Left: Server Metrics */}
            <div
              style={{
                borderRight: isMobile ? "none" : "1px solid #222",
                padding: 16,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#555",
                  marginBottom: 12,
                }}
              >
                Server Metrics
              </div>
              <ServerMetricsPanel onMetricsUpdate={setMetrics} />

              {pm2Stats && (
                <>
                  <div style={{ borderTop: "1px solid #222", margin: "12px 0" }} />
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#555",
                      marginBottom: 8,
                    }}
                  >
                    PM2 ({pm2Stats.processes.length} processes · {pm2Stats.totalMemMb.toFixed(0)} MB)
                  </div>
                  {pm2Stats.processes.slice(0, 8).map((p) => (
                    <div
                      key={p.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 10,
                        color: "#ccc",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: p.status === "online" ? "#22c55e" : "#dc2828",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <span style={{ color: "#555", fontSize: 9 }}>{p.memMb.toFixed(0)}MB</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Center: Alerts */}
            <div
              style={{
                borderRight: isMobile ? "none" : "1px solid #222",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px 8px",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#555",
                }}
              >
                Alerts
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <AlertsPanel
                  metrics={metrics}
                  onTicketCreated={() => setTicketRefreshKey((k) => k + 1)}
                  onAlertCountChange={setAlertCount}
                />
              </div>
            </div>

            {/* Right: Tickets */}
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div
                style={{
                  padding: "12px 16px 8px",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#555",
                }}
              >
                Tickets
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <TicketsPanel
                  refreshKey={ticketRefreshKey}
                  onTicketCountChange={setTicketCount}
                />
              </div>
            </div>
          </div>
        )}

        {/* Workflows tab */}
        {activeTab === "workflows" && (
          <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
            {/* Sidebar: workflow list */}
            <div
              style={{
                width: 220,
                borderRight: "1px solid #222",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: "12px 12px 8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#555",
                  }}
                >
                  Workflows
                </span>
                <button
                  onClick={handleCreateWorkflow}
                  style={{
                    background: "transparent",
                    border: "1px solid #333",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 10,
                    color: "#888",
                  }}
                >
                  + New
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    onClick={() => setActiveWorkflowId(wf.id)}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      background: wf.id === activeWorkflowId ? "#1a1a1a" : "transparent",
                      borderLeft: wf.id === activeWorkflowId ? "2px solid #a855f7" : "2px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 12, color: wf.id === activeWorkflowId ? "#fff" : "#888" }}>
                      {wf.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkflow(wf.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#555",
                        fontSize: 10,
                        padding: "2px 4px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {canvasDirty && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "1px solid #222",
                    fontSize: 10,
                    color: "#f59e0b",
                  }}
                >
                  Unsaved changes
                  <button
                    onClick={() => saveFnRef.current?.()}
                    style={{
                      marginLeft: 8,
                      background: "#a855f7",
                      color: "#000",
                      border: "none",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    SAVE
                  </button>
                </div>
              )}
            </div>

            {/* Canvas */}
            <div style={{ flex: 1, position: "relative" }}>
              {activeWorkflow ? (
                <WorkflowCanvas
                  workflow={activeWorkflow}
                  onSave={handleSaveWorkflow}
                  onRegisterSave={(fn) => {
                    saveFnRef.current = fn;
                  }}
                  onDirtyChange={setCanvasDirty}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#555",
                    fontSize: 14,
                  }}
                >
                  Select or create a workflow
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cron tab */}
        {activeTab === "cron" && (
          <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto", overflowY: "auto", height: "100%" }}>
            <CronManagerPanel pm2Processes={pm2Stats?.processes} />
          </div>
        )}

        {/* Swarm tab */}
        {activeTab === "swarm" && (
          <div style={{ height: "100%", overflow: "hidden" }}>
            <SwarmPanel />
          </div>
        )}
      </main>
    </div>
  );
}
