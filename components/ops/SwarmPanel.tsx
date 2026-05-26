"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SwarmPanel.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwarmDef {
  id: string;
  name: string;
  task: string;
  agents: string[];
  parallelism: "sequential" | "parallel" | "fan-out";
  model: "sonnet" | "opus";
  createdAt: number;
  updatedAt: number;
}

interface SwarmRun {
  id: string;
  defId: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  startedAt: number;
  endedAt?: number;
  logs: string[];
  error?: string;
}

type PanelTab = "config" | "runs" | "output";

// ── Approved agent list ───────────────────────────────────────────────────────

const APPROVED_AGENTS = [
  "implementation-expert",
  "ops-expert",
  "project-reviewer",
  "planner",
  "research-lead",
  "adversarial-reviewer",
  "co-songwriter",
  "youtube-ideas",
  "frontend-expert",
  "sso-expert",
  "analytics-reporter",
  "qa-agent",
  "master-auditor",
  "dfe-existence",
  "dfe-security",
  "dfe-logic",
  "dfe-runtime",
  "dfe-artifacts",
  "mobile-ui-expert",
  "ui-design-expert",
  "underground-feature-expert",
  "d1-migration-expert",
  "ev-betta-ops",
  "stripe-expert",
  "pm2-health-expert",
  "swarm-orchestrator",
  "architecture-drift",
  "deployment-verifier",
  "migration-safety-auditor",
  "api-contract-enforcer",
  "cost-intelligence",
  "anti-abuse-engineer",
] as const;

// ── Status colors ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<SwarmRun["status"], string> = {
  queued: "#888",
  running: "#f59e0b",
  done: "#22c55e",
  failed: "#dc2828",
  cancelled: "#555",
};

function statusBgColor(s: SwarmRun["status"]): string {
  const map: Record<SwarmRun["status"], string> = {
    queued: "#88888820",
    running: "#f59e0b20",
    done: "#22c55e20",
    failed: "#dc282820",
    cancelled: "#55555520",
  };
  return map[s];
}

function fmtDuration(run: SwarmRun): string {
  const end = run.endedAt ?? Date.now();
  const ms = end - run.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SwarmPanel() {
  const [defs, setDefs] = useState<SwarmDef[]>([]);
  const [runs, setRuns] = useState<SwarmRun[]>([]);
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("config");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Config form state
  const [formName, setFormName] = useState("");
  const [formTask, setFormTask] = useState("");
  const [formAgents, setFormAgents] = useState<string[]>([]);
  const [formParallelism, setFormParallelism] = useState<SwarmDef["parallelism"]>("sequential");
  const [formModel, setFormModel] = useState<SwarmDef["model"]>("sonnet");

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/swarm");
      if (!res.ok) {
        setError("Failed to load swarm data");
        return;
      }
      const data = await res.json() as { swarms: SwarmDef[]; runs: SwarmRun[] };
      setDefs(data.swarms ?? []);
      setRuns(data.runs ?? []);
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Polling for active runs ─────────────────────────────────────────────────

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedRun && (selectedRun.status === "running" || selectedRun.status === "queued")) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/ops/swarm/${selectedRun.id}`);
          if (res.ok) {
            const data = await res.json() as { run: SwarmRun; logs: string[] };
            setRuns((prev) =>
              prev.map((r) => (r.id === data.run.id ? data.run : r))
            );
          }
        } catch {
          // silent — poll will retry
        }
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedRun?.id, selectedRun?.status]);

  // ── Select def & populate form ──────────────────────────────────────────────

  const selectDef = useCallback(
    (def: SwarmDef) => {
      setSelectedDefId(def.id);
      setFormName(def.name);
      setFormTask(def.task);
      setFormAgents(def.agents);
      setFormParallelism(def.parallelism);
      setFormModel(def.model);
      setActiveTab("config");
      setSelectedRunId(null);
    },
    []
  );

  const selectedDef = defs.find((d) => d.id === selectedDefId) ?? null;
  const defRuns = runs.filter((r) => r.defId === selectedDefId);

  // ── Create new def (blank form) ─────────────────────────────────────────────

  const handleNewDef = useCallback(() => {
    setSelectedDefId(null);
    setFormName("");
    setFormTask("");
    setFormAgents([]);
    setFormParallelism("sequential");
    setFormModel("sonnet");
    setActiveTab("config");
    setSelectedRunId(null);
  }, []);

  // ── Save def ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!formName.trim()) { setError("Name is required"); return; }
    if (!formTask.trim()) { setError("Task description is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_def",
          name: formName.trim(),
          task: formTask.trim(),
          agents: formAgents,
          parallelism: formParallelism,
          model: formModel,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error: string };
        setError(d.error ?? "Save failed");
        return;
      }
      const def = await res.json() as SwarmDef;
      setDefs((prev) => [def, ...prev]);
      setSelectedDefId(def.id);
      setActiveTab("runs");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [formName, formTask, formAgents, formParallelism, formModel]);

  // ── Delete def ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    if (!selectedDefId) return;
    setConfirmDeleteId(selectedDefId);
  }, [selectedDefId]);

  const confirmDelete = useCallback(async (id: string) => {
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/ops/swarm?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      setError("Failed to delete swarm");
      return;
    }
    setDefs((prev) => prev.filter((d) => d.id !== id));
    setSelectedDefId(null);
    setFormName("");
    setFormTask("");
    setFormAgents([]);
  }, []);

  // ── Launch run ──────────────────────────────────────────────────────────────

  const handleLaunch = useCallback(async () => {
    if (!selectedDefId) return;
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", defId: selectedDefId }),
      });
      if (!res.ok) {
        const d = await res.json() as { error: string; message?: string };
        setError(d.message ?? d.error ?? "Launch failed");
        return;
      }
      const { runId } = await res.json() as { runId: string };
      // Optimistic: add a queued run record to state
      const newRun: SwarmRun = {
        id: runId,
        defId: selectedDefId,
        status: "queued",
        startedAt: Date.now(),
        logs: [],
      };
      setRuns((prev) => [newRun, ...prev]);
      setSelectedRunId(runId);
      setActiveTab("output");
    } catch {
      setError("Network error");
    } finally {
      setLaunching(false);
    }
  }, [selectedDefId]);

  // ── Cancel run ──────────────────────────────────────────────────────────────

  const handleCancel = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/ops/swarm/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        setRuns((prev) =>
          prev.map((r) =>
            r.id === runId
              ? { ...r, status: "cancelled", endedAt: Date.now() }
              : r
          )
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // ── Agent toggle ────────────────────────────────────────────────────────────

  const toggleAgent = useCallback((name: string) => {
    setFormAgents((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell} style={{ position: "relative" }}>
      {/* Inline delete confirmation */}
      {confirmDeleteId !== null && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#111", border: "1px solid #333", borderRadius: 8,
            padding: "20px 24px", maxWidth: 340, width: "100%",
          }}>
            <p style={{ color: "#e5e5e5", fontSize: 13, marginBottom: 16 }}>
              Delete this swarm definition? Existing runs will be orphaned.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  padding: "6px 14px", background: "#1e1e1e", border: "1px solid #333",
                  borderRadius: 4, color: "#999", cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { void confirmDelete(confirmDeleteId); }}
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

      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarLabel}>Swarms</span>
          <button className={styles.btnNew} onClick={handleNewDef}>
            + New
          </button>
        </div>
        <div className={styles.defList}>
          {defs.length === 0 && (
            <div style={{ padding: 12, color: "#555", fontSize: 11 }}>No swarms yet</div>
          )}
          {defs.map((def) => {
            const isActive = def.id === selectedDefId;
            return (
              <div
                key={def.id}
                className={`${styles.defItem} ${isActive ? styles.defItemActive : ""}`}
                onClick={() => selectDef(def)}
              >
                <span
                  className={`${styles.defItemName} ${isActive ? styles.defItemNameActive : ""}`}
                >
                  {def.name}
                </span>
                <span className={styles.defItemMeta}>
                  {def.agents.length} agent{def.agents.length !== 1 ? "s" : ""} · {def.parallelism}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main area */}
      <div className={styles.main}>
        {error && (
          <div className={styles.errorBanner} style={{ margin: "12px 16px 0" }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 8, background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
            >
              ×
            </button>
          </div>
        )}

        {selectedDefId === null && defs.length === 0 ? (
          <div className={styles.mainEmpty}>
            Create a swarm definition to get started
          </div>
        ) : selectedDefId === null ? (
          <div className={styles.mainEmpty}>
            Select a swarm or create a new one
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className={styles.tabs}>
              {(["config", "runs", "output"] as const).map((t) => (
                <button
                  key={t}
                  className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {t === "runs" && defRuns.length > 0 && (
                    <span style={{ marginLeft: 4, color: "#555", fontSize: 10 }}>
                      ({defRuns.length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Config tab */}
            {activeTab === "config" && (
              <div className={styles.tabContent}>
                <div className={styles.form}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Name</label>
                    <input
                      className={styles.input}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Swarm name"
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Task / Prompt</label>
                    <textarea
                      className={styles.textarea}
                      value={formTask}
                      onChange={(e) => setFormTask(e.target.value)}
                      placeholder="Describe the task for all agents..."
                      rows={4}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>
                      Agents ({formAgents.length} selected)
                    </label>
                    <div className={styles.agentGrid}>
                      {APPROVED_AGENTS.map((agent) => {
                        const checked = formAgents.includes(agent);
                        return (
                          <label key={agent} className={styles.agentCheckRow}>
                            <input
                              type="checkbox"
                              className={styles.agentCheckbox}
                              checked={checked}
                              onChange={() => toggleAgent(agent)}
                            />
                            <span
                              className={`${styles.agentCheckLabel} ${checked ? styles.agentCheckLabelSelected : ""}`}
                            >
                              {agent}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <div className={styles.fieldGroup} style={{ flex: 1 }}>
                      <label className={styles.label}>Parallelism</label>
                      <select
                        className={styles.select}
                        value={formParallelism}
                        onChange={(e) =>
                          setFormParallelism(e.target.value as SwarmDef["parallelism"])
                        }
                      >
                        <option value="sequential">sequential</option>
                        <option value="parallel">parallel</option>
                        <option value="fan-out">fan-out</option>
                      </select>
                    </div>

                    <div className={styles.fieldGroup} style={{ flex: 1 }}>
                      <label className={styles.label}>Model</label>
                      <select
                        className={styles.select}
                        value={formModel}
                        onChange={(e) =>
                          setFormModel(e.target.value as SwarmDef["model"])
                        }
                      >
                        <option value="sonnet">sonnet</option>
                        <option value="opus">opus</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formActions}>
                    <button
                      className={styles.btnSave}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Definition"}
                    </button>
                    {selectedDef && (
                      <button className={styles.btnDelete} onClick={handleDelete}>
                        Delete
                      </button>
                    )}
                  </div>

                  {selectedDef && (
                    <div style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>
                      id: {selectedDef.id}
                      {" · "}
                      updated: {new Date(selectedDef.updatedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Runs tab */}
            {activeTab === "runs" && (
              <div className={styles.tabContent}>
                <div className={styles.runsHeader}>
                  <span
                    style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555" }}
                  >
                    Run History
                  </span>
                  <button
                    className={styles.btnLaunch}
                    onClick={handleLaunch}
                    disabled={launching || !selectedDefId}
                  >
                    {launching ? "Launching..." : "▶ Launch Run"}
                  </button>
                </div>

                {defRuns.length === 0 ? (
                  <div className={styles.noRuns}>No runs yet. Click Launch to start one.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className={styles.runsTable}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Run ID</th>
                          <th className={styles.th}>Started</th>
                          <th className={styles.th}>Duration</th>
                          <th className={styles.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defRuns.map((run) => {
                          const isSelected = run.id === selectedRunId;
                          return (
                            <tr
                              key={run.id}
                              className={`${styles.tr} ${isSelected ? styles.trActive : ""}`}
                              onClick={() => {
                                setSelectedRunId(run.id);
                                setActiveTab("output");
                              }}
                            >
                              <td className={styles.td}>
                                <span className={styles.runId}>
                                  {run.id.slice(0, 8)}…
                                </span>
                              </td>
                              <td className={styles.td}>{fmtTime(run.startedAt)}</td>
                              <td className={styles.td} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
                                {fmtDuration(run)}
                              </td>
                              <td className={styles.td}>
                                <span
                                  className={styles.statusBadge}
                                  style={{
                                    color: STATUS_COLOR[run.status],
                                    background: statusBgColor(run.status),
                                    border: `1px solid ${STATUS_COLOR[run.status]}44`,
                                  }}
                                >
                                  {run.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Output tab */}
            {activeTab === "output" && (
              <div className={styles.tabContent}>
                {selectedRun ? (
                  <>
                    <div className={styles.outputHeader}>
                      <div className={styles.outputMeta}>
                        {selectedRun.id.slice(0, 8)}… ·{" "}
                        <span
                          style={{
                            color: STATUS_COLOR[selectedRun.status],
                            fontWeight: 700,
                          }}
                        >
                          {selectedRun.status}
                        </span>
                        {" · "}
                        {fmtDuration(selectedRun)}
                        {(selectedRun.status === "running" || selectedRun.status === "queued") && (
                          <>
                            {" "}
                            <span className={styles.pollingDot} />
                            <span style={{ color: "#555" }}>polling</span>
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(selectedRun.status === "running" || selectedRun.status === "queued") && (
                          <button
                            className={styles.btnCancel}
                            onClick={() => handleCancel(selectedRun.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedRun.error && (
                      <div
                        className={styles.errorBanner}
                        style={{ marginBottom: 10 }}
                      >
                        Error: {selectedRun.error}
                      </div>
                    )}

                    <pre className={styles.logBlock}>
                      {selectedRun.logs.length === 0 ? (
                        <span className={styles.logEmpty}>No output yet…</span>
                      ) : (
                        selectedRun.logs.join("\n")
                      )}
                    </pre>
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 200,
                      color: "#555",
                      fontSize: 12,
                    }}
                  >
                    Select a run from the Runs tab to view output
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
