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
import styles from "./page.module.css";

type MainTab = "dashboard" | "workflows" | "cron" | "swarm";
type DockTab = "run" | "alerts" | "tickets" | "cron";
type DockSide = "bottom" | "right";
type Density = "compact" | "comfortable";

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const saveFnRef = useRef<(() => void) | null>(null);
  const [workflowSidebarCollapsed, setWorkflowSidebarCollapsed] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("cron");
  const [dockSide, setDockSide] = useState<DockSide>("bottom");
  const [bottomPanelHeight, setBottomPanelHeight] = useState(330);
  const [activityOpen, setActivityOpen] = useState(true);
  const [density, setDensity] = useState<Density>("comfortable");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

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

  const activityItems = React.useMemo(() => {
    const onlineCount = pm2Stats?.processes.filter((process) => process.status === "online").length ?? 0;
    const totalCount = pm2Stats?.processes.length ?? 0;
    return [
      canvasDirty ? "Workflow has unsaved edits" : "Workflow state is saved",
      activeWorkflow ? `Editing ${activeWorkflow.name}` : "No workflow selected",
      `${workflows.length} workflow${workflows.length === 1 ? "" : "s"} available`,
      `${onlineCount}/${totalCount} PM2 processes online`,
      alertCount > 0 ? `${alertCount} active alert${alertCount === 1 ? "" : "s"}` : "No active alert count",
      ticketCount > 0 ? `${ticketCount} ticket${ticketCount === 1 ? "" : "s"} tracked` : "No open ticket count",
    ];
  }, [activeWorkflow, alertCount, canvasDirty, pm2Stats, ticketCount, workflows.length]);

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

  const handleCreateWorkflow = useCallback(() => {
    setNewWorkflowName("");
    setShowCreateModal(true);
  }, []);

  const submitCreateWorkflow = useCallback(async () => {
    if (!newWorkflowName.trim()) return;
    setShowCreateModal(false);
    const res = await fetch("/api/ops/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWorkflowName.trim() }),
    });
    if (res.ok) {
      const wf: WorkflowData = await res.json();
      setWorkflows((prev) => [...prev, wf]);
      setActiveWorkflowId(wf.id);
    }
    setNewWorkflowName("");
  }, [newWorkflowName]);

  const startBottomResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomPanelHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setBottomPanelHeight(Math.max(220, Math.min(520, startHeight + delta)));
    };

    const onUp = () => {
      document.body.classList.remove(styles.resizingDock);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    document.body.classList.add(styles.resizingDock);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [bottomPanelHeight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = React.useMemo(
    () => [
      { label: "Save workflow", hint: "Persist current canvas", action: () => saveFnRef.current?.() },
      { label: "New workflow", hint: "Create a blank workflow", action: handleCreateWorkflow },
      { label: "Toggle workflow sidebar", hint: "Collapse or expand the left rail", action: () => setWorkflowSidebarCollapsed((value) => !value) },
      { label: "Toggle activity sidebar", hint: "Show or hide recent activity", action: () => setActivityOpen((value) => !value) },
      { label: "Dock panels bottom", hint: "Canvas over draggable panels", action: () => setDockSide("bottom") },
      { label: "Dock panels right", hint: "Canvas beside panels", action: () => setDockSide("right") },
      { label: density === "compact" ? "Use comfortable density" : "Use compact density", hint: "Adjust list and panel spacing", action: () => setDensity((value) => (value === "compact" ? "comfortable" : "compact")) },
      { label: "Open cron dock", hint: "Show Cron Manager in lower dock", action: () => { setActiveTab("workflows"); setDockTab("cron"); } },
    ],
    [density, handleCreateWorkflow]
  );

  const filteredCommands = commands.filter((command) =>
    `${command.label} ${command.hint}`.toLowerCase().includes(commandQuery.toLowerCase())
  );

  const runCommand = (action: () => void | Promise<void>) => {
    void action();
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };

  const handleDeleteWorkflow = useCallback(
    (id: string) => {
      setDeleteTargetId(id);
    },
    []
  );

  const confirmDeleteWorkflow = useCallback(
    async (id: string) => {
      setDeleteTargetId(null);
      await fetch(`/api/ops/workflows?id=${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (activeWorkflowId === id) {
        setActiveWorkflowId(workflows.find((w) => w.id !== id)?.id ?? null);
      }
    },
    [activeWorkflowId, workflows]
  );

  const renderDockContent = () => {
    if (dockTab === "alerts") {
      return (
        <AlertsPanel
          metrics={metrics}
          onTicketCreated={() => setTicketRefreshKey((k) => k + 1)}
          onAlertCountChange={setAlertCount}
        />
      );
    }

    if (dockTab === "tickets") {
      return (
        <TicketsPanel
          refreshKey={ticketRefreshKey}
          onTicketCountChange={setTicketCount}
        />
      );
    }

    if (dockTab === "cron") {
      return <CronManagerPanel pm2Processes={pm2Stats?.processes} />;
    }

    return (
      <div className={styles.runLog}>
        {activityItems.map((item, index) => (
          <div key={`${item}-${index}`} className={styles.runLogRow}>
            <span>{new Date(Date.now() - index * 42000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <p>{item}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`${styles.appShell} ${density === "compact" ? styles.compactDensity : ""}`}>
      {/* Top bar */}
      <header className={styles.appHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Brand mark with left accent bar */}
          <div className={styles.brandMark}>
            <h1 className={styles.brandTitle}>
              <span className={styles.brandOps}>ops</span>
              <span className={styles.brandDotApp}>.app</span>
            </h1>
          </div>

          {/* Segmented nav tabs */}
          <nav className={styles.tabNav}>
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
                className={`${styles.tabNavButton} ${activeTab === tab.key ? styles.tabNavButtonActive : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Utility buttons + badges */}
        <div className={styles.headerActions}>
          <button className={styles.headerButton} onClick={() => setDensity((value) => (value === "compact" ? "comfortable" : "compact"))}>
            {density === "compact" ? "▣ Comfy" : "▤ Dense"}
          </button>
          <button className={styles.headerButton} onClick={() => setActivityOpen((value) => !value)}>
            ◫ Activity
          </button>
          <button className={styles.headerButton} onClick={() => setCommandPaletteOpen(true)}>
            ⌘K
          </button>
          {alertCount > 0 && (
            <span className={styles.alertBadge}>
              ● {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
          {ticketCount > 0 && (
            <span className={styles.ticketBadge}>
              # {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}
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
            <div className={styles.dashPanel} style={{
              borderRight: isMobile ? "none" : "1px solid #1e1e1e",
              borderTop: "2px solid #3b82f6",
              background: "linear-gradient(180deg, rgba(59,130,246,0.06) 0%, transparent 40px), rgba(255,255,255,0.015)",
              padding: 16,
              overflowY: "auto",
            }}>
              <div className={styles.panelLabel} style={{ borderLeft: "2px solid #3b82f6", paddingLeft: 8, marginBottom: 12 }}>
                Server Metrics
              </div>
              <ServerMetricsPanel onMetricsUpdate={setMetrics} />

              {pm2Stats && (
                <>
                  <div style={{ borderTop: "1px solid #1e1e1e", margin: "12px 0" }} />
                  <div className={styles.panelLabel} style={{ borderLeft: "2px solid #22c55e", paddingLeft: 8, marginBottom: 8 }}>
                    PM2 ({pm2Stats.processes.length} processes · {pm2Stats.totalMemMb.toFixed(0)} MB)
                  </div>
                  {pm2Stats.processes.slice(0, 8).map((p) => (
                    <div
                      key={p.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        color: "#ccc",
                        marginBottom: 4,
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
                      <span style={{ color: "#666", fontSize: 10 }}>{p.memMb.toFixed(0)}MB</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Center: Alerts */}
            <div className={styles.dashPanel} style={{
              borderRight: isMobile ? "none" : "1px solid #1e1e1e",
              borderTop: "2px solid #e94560",
              background: "linear-gradient(180deg, rgba(233,69,96,0.06) 0%, transparent 40px), rgba(255,255,255,0.015)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}>
              <div className={styles.panelLabel} style={{ padding: "12px 16px 8px", borderLeft: "2px solid #e94560", marginLeft: 16 }}>
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
            <div className={styles.dashPanel} style={{
              borderTop: "2px solid #a855f7",
              background: "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, transparent 40px), rgba(255,255,255,0.015)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}>
              <div className={styles.panelLabel} style={{ padding: "12px 16px 8px", borderLeft: "2px solid #a855f7", marginLeft: 16 }}>
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
          <div className={styles.workflowWorkspace}>
            {/* Sidebar: workflow list */}
            <div className={`${styles.workflowSidebar} ${workflowSidebarCollapsed ? styles.workflowSidebarCollapsed : ""}`}>
              <div className={styles.workflowSidebarHeader}>
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
                  onClick={() => setWorkflowSidebarCollapsed((value) => !value)}
                  className={styles.iconControl}
                  title={workflowSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {workflowSidebarCollapsed ? "›" : "‹"}
                </button>
                <button
                  onClick={handleCreateWorkflow}
                  className={styles.newWorkflowButton}
                >
                  + New
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    onClick={() => setActiveWorkflowId(wf.id)}
                    className={`${styles.workflowCard} ${wf.id === activeWorkflowId ? styles.workflowCardActive : ""}`}
                  >
                    <span className={styles.workflowName}>
                      {wf.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkflow(wf.id);
                      }}
                      className={styles.deleteWorkflowButton}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {canvasDirty && (
                <div className={styles.unsavedBar}>
                  Unsaved changes
                  <button
                    onClick={() => saveFnRef.current?.()}
                    className={styles.unsavedSave}
                  >
                    SAVE
                  </button>
                </div>
              )}
            </div>

            <section className={styles.workflowContent}>
              <div className={styles.workflowToolbar}>
                <div className={styles.breadcrumbs}>
                  <span>Ops</span>
                  <span>/</span>
                  <span>Workflows</span>
                  {activeWorkflow && (
                    <>
                      <span>/</span>
                      <strong>{activeWorkflow.name}</strong>
                    </>
                  )}
                </div>
                <div className={styles.toolbarActions}>
                  <button className={styles.headerButton} onClick={() => setDockSide(dockSide === "bottom" ? "right" : "bottom")}>
                    Dock {dockSide === "bottom" ? "Right" : "Bottom"}
                  </button>
                  <button className={styles.headerButton} onClick={() => setCommandPaletteOpen(true)}>
                    Commands
                  </button>
                </div>
              </div>

              <div className={`${styles.workflowDockLayout} ${dockSide === "right" ? styles.workflowDockRight : ""}`}>
                <div className={styles.canvasAndBottomDock}>
                  <div
                    className={styles.canvasRegion}
                    style={dockSide === "bottom" ? { height: `calc(100% - ${bottomPanelHeight}px - 8px)` } : undefined}
                  >
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
                      <div className={styles.emptyCanvas}>
                        Select or create a workflow
                      </div>
                    )}
                  </div>

                  {dockSide === "bottom" && (
                    <>
                      <div
                        className={styles.horizontalDivider}
                        onMouseDown={startBottomResize}
                        title="Drag to resize panels"
                      >
                        <span />
                      </div>
                      <div className={styles.bottomDock} style={{ height: bottomPanelHeight }}>
                        <div className={styles.dockTabs}>
                          {(["run", "alerts", "tickets", "cron"] as const).map((tab) => (
                            <button
                              key={tab}
                              className={`${styles.dockTab} ${dockTab === tab ? styles.dockTabActive : ""}`}
                              onClick={() => setDockTab(tab)}
                            >
                              {tab === "run" ? "Run Log" : tab === "alerts" ? "Alerts" : tab === "tickets" ? "Tickets" : "Cron Migration"}
                            </button>
                          ))}
                        </div>
                        <div className={styles.dockContent}>{renderDockContent()}</div>
                      </div>
                    </>
                  )}
                </div>

                {dockSide === "right" && (
                  <aside className={styles.rightDock}>
                    <div className={styles.dockTabs}>
                      {(["run", "alerts", "tickets", "cron"] as const).map((tab) => (
                        <button
                          key={tab}
                          className={`${styles.dockTab} ${dockTab === tab ? styles.dockTabActive : ""}`}
                          onClick={() => setDockTab(tab)}
                        >
                          {tab === "run" ? "Run Log" : tab === "alerts" ? "Alerts" : tab === "tickets" ? "Tickets" : "Cron"}
                        </button>
                      ))}
                    </div>
                    <div className={styles.dockContent}>{renderDockContent()}</div>
                  </aside>
                )}

                {activityOpen && (
                  <aside className={styles.activitySidebar}>
                    <div className={styles.activityHeader}>
                      <span>Recent Activity</span>
                      <button className={styles.iconControl} onClick={() => setActivityOpen(false)}>×</button>
                    </div>
                    {activityItems.map((item, index) => (
                      <div key={`${item}-activity-${index}`} className={styles.activityItem}>
                        <span className={styles.activityDot} />
                        <p>{item}</p>
                      </div>
                    ))}
                  </aside>
                )}
              </div>
            </section>
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

      {/* Create workflow modal */}
      {showCreateModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onMouseDown={() => setShowCreateModal(false)}>
          <div
            style={{
              background: "#111", border: "1px solid #333", borderRadius: 8,
              padding: "20px 24px", maxWidth: 360, width: "100%",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p style={{ color: "#e5e5e5", fontSize: 13, marginBottom: 12 }}>Workflow name</p>
            <input
              autoFocus
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCreateWorkflow();
                if (e.key === "Escape") setShowCreateModal(false);
              }}
              placeholder="e.g. Deploy pipeline"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0a0a0a", border: "1px solid #333", borderRadius: 4,
                color: "#e5e5e5", padding: "6px 10px", fontSize: 13, marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: "6px 14px", background: "#1e1e1e", border: "1px solid #333",
                  borderRadius: 4, color: "#999", cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void submitCreateWorkflow()}
                style={{
                  padding: "6px 14px", background: "#1d3a1d", border: "1px solid #22c55e",
                  borderRadius: 4, color: "#86efac", cursor: "pointer", fontSize: 12,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete workflow confirm */}
      {deleteTargetId !== null && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#111", border: "1px solid #333", borderRadius: 8,
            padding: "20px 24px", maxWidth: 340, width: "100%",
          }}>
            <p style={{ color: "#e5e5e5", fontSize: 13, marginBottom: 16 }}>
              Delete this workflow?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTargetId(null)}
                style={{
                  padding: "6px 14px", background: "#1e1e1e", border: "1px solid #333",
                  borderRadius: 4, color: "#999", cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDeleteWorkflow(deleteTargetId)}
                style={{
                  padding: "6px 14px", background: "#7f1d1d", border: "1px solid #dc2828",
                  borderRadius: 4, color: "#fca5a5", cursor: "pointer", fontSize: 12,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {commandPaletteOpen && (
        <div className={styles.commandOverlay} onMouseDown={() => setCommandPaletteOpen(false)}>
          <div className={styles.commandPalette} onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="Type a command..."
              className={styles.commandInput}
            />
            <div className={styles.commandList}>
              {filteredCommands.map((command) => (
                <button key={command.label} className={styles.commandItem} onClick={() => runCommand(command.action)}>
                  <span>{command.label}</span>
                  <small>{command.hint}</small>
                </button>
              ))}
              {filteredCommands.length === 0 && <p className={styles.noCommands}>No commands found</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
