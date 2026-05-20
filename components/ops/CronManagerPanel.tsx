"use client";

import React, { useEffect, useState, useCallback } from "react";
import styles from "./cron-manager.module.css";
import type { Pm2Process } from "@/hooks/usePm2Stats";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface ClassifiedJob {
  name: string;
  schedule: string | null;
  eligibility: "CF_READY" | "CF_WEBHOOK" | "PM2_ONLY" | "RESTART_ONLY" | "ALREADY_MIGRATED";
  reason: string;
  gamemodeSuspend: boolean;
}

interface CronJobRow {
  id: string;
  name: string;
  schedule: string;
  target_url: string;
  token_key: string;
  enabled: number;
  gamemode_suspend: number;
  migrated_from: string | null;
  created_at: number;
}

interface FetchData {
  pm2Jobs: ClassifiedJob[];
  cfJobs: CronJobRow[];
  pm2Error?: string;
  cfError?: string;
}

type ActiveTab = "pm2" | "cf" | "log";

// ── Badge config ──────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<
  ClassifiedJob["eligibility"],
  { background: string; color: string; label: string }
> = {
  CF_READY:         { background: "rgba(34,197,94,0.15)",  color: "#22c55e",  label: "CF_READY" },
  CF_WEBHOOK:       { background: "rgba(245,158,11,0.15)", color: "#f59e0b",  label: "CF_WEBHOOK" },
  PM2_ONLY:         { background: "rgba(220,40,40,0.10)",  color: "#dc404099", label: "PM2_ONLY" },
  RESTART_ONLY:     { background: "rgba(100,100,100,0.15)", color: "#888",    label: "RESTART_ONLY" },
  ALREADY_MIGRATED: { background: "rgba(59,130,246,0.15)", color: "#3b82f6",  label: "MIGRATED" },
};

// ── Add-job form state ────────────────────────────────────────────────────────

interface AddFormState {
  name: string;
  schedule: string;
  target_url: string;
  token_key: "PIPELINE_TOKEN" | "EV_BETTA_TOKEN" | "INGEST_SECRET";
}

const EMPTY_FORM: AddFormState = {
  name: "",
  schedule: "0 7 * * *",
  target_url: "",
  token_key: "PIPELINE_TOKEN",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface CronManagerPanelProps {
  pm2Processes?: Pm2Process[] | null;
}

export function CronManagerPanel({ pm2Processes }: CronManagerPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("pm2");
  const [pm2Jobs, setPm2Jobs]     = useState<ClassifiedJob[]>([]);
  const [cfJobs, setCfJobs]       = useState<CronJobRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [migrating, setMigrating] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Add-job form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState<AddFormState>(EMPTY_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError]           = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/cron-manager", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as FetchData;
      setPm2Jobs(data.pm2Jobs ?? []);
      setCfJobs(data.cfJobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cron data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Migrate job ───────────────────────────────────────────────────────────────

  const handleMigrate = useCallback(async (job: ClassifiedJob) => {
    setMigrating((prev) => new Set([...prev, job.name]));
    setCardErrors((prev) => { const next = { ...prev }; delete next[job.name]; return next; });

    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: job.name,
          schedule: job.schedule ?? "0 7 * * *",
          target_url: job.eligibility === "CF_WEBHOOK"
            ? `https://stats.frxncois.com/api/pm2-webhook/${job.name}`
            : `https://www.frxncois.com/api/cron/${job.name}`,
          token_key: job.eligibility === "CF_WEBHOOK" ? "INGEST_SECRET" : "PIPELINE_TOKEN",
          gamemode_suspend: 1,
          migrated_from: job.name,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Migration failed";
      setCardErrors((prev) => ({ ...prev, [job.name]: msg }));
    } finally {
      setMigrating((prev) => {
        const next = new Set(prev);
        next.delete(job.name);
        return next;
      });
    }
  }, [fetchData]);

  // ── Gamemode toggle ───────────────────────────────────────────────────────────

  const handleGamemodeToggle = useCallback(async (cfJob: CronJobRow) => {
    const newVal = cfJob.gamemode_suspend ? 0 : 1;
    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cfJob.id, gamemode_suspend: newVal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch {
      // non-critical — silently ignore
    }
  }, [fetchData]);

  // ── CF registry: toggle enabled ────────────────────────────────────────────

  const handleToggleEnabled = useCallback(async (job: CronJobRow) => {
    const newVal = job.enabled ? 0 : 1;
    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, enabled: newVal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch {
      // silently ignore
    }
  }, [fetchData]);

  // ── CF registry: delete ────────────────────────────────────────────────────

  const handleDelete = useCallback(async (job: CronJobRow) => {
    if (!window.confirm(`Delete CF cron job "${job.name}"?`)) return;
    try {
      const res = await fetch(`/api/ops/cron-manager?id=${encodeURIComponent(job.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch {
      // silently ignore
    }
  }, [fetchData]);

  // ── Add-job form submit ────────────────────────────────────────────────────

  const handleAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setAddError(null);

    if (!addForm.name.trim()) {
      setValidationError("Job name is required.");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(addForm.name.trim())) {
      setValidationError("Job name must be alphanumeric with dashes or underscores only.");
      return;
    }
    if (!addForm.target_url.startsWith("http://") && !addForm.target_url.startsWith("https://")) {
      setValidationError("Target URL must start with http:// or https://");
      return;
    }
    if (!/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(addForm.schedule.trim())) {
      setValidationError("Schedule must be a valid cron expression with 5 space-separated fields.");
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      await fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add job");
    } finally {
      setAddSubmitting(false);
    }
  }, [addForm, fetchData]);

  // ── Derived counts ─────────────────────────────────────────────────────────

  const cfCount        = pm2Jobs.filter((j) => j.eligibility === "CF_READY" || j.eligibility === "CF_WEBHOOK").length;
  const webhookCount   = pm2Jobs.filter((j) => j.eligibility === "CF_WEBHOOK").length;
  const pm2OnlyCount   = pm2Jobs.filter((j) => j.eligibility === "PM2_ONLY" || j.eligibility === "RESTART_ONLY").length;
  const migratedCount  = pm2Jobs.filter((j) => j.eligibility === "ALREADY_MIGRATED").length;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const findCfJob = (name: string): CronJobRow | undefined =>
    cfJobs.find((c) => c.name === name);

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <p className={styles.title}>Cron Manager</p>
        </div>
        <p style={{ fontSize: 11, color: "#666", margin: "0 0 10px 0" }}>
          Loading cron jobs...
        </p>
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeleton} style={{ width: "60%" }} />
              <div className={styles.skeleton} style={{ width: "40%", height: "10px" }} />
              <div className={styles.skeleton} style={{ width: "80%", height: "10px" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <p className={styles.title}>Cron Manager</p>
        <div className={styles.chips}>
          <span className={styles.chip}>CF: {cfCount}</span>
          <span className={styles.chip}>Webhook: {webhookCount}</span>
          <span className={styles.chip}>PM2-only: {pm2OnlyCount}</span>
          <span className={styles.chip}>Migrated: {migratedCount}</span>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.btnToggle} onClick={fetchData}>Retry</button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {(["pm2", "cf", "log"] as const).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            style={{ padding: "10px 16px", minWidth: 80 }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "pm2" ? "PM2 Jobs" : tab === "cf" ? "CF Registry" : "Migration Log"}
          </button>
        ))}
      </div>

      {/* Tab: PM2 Jobs */}
      {activeTab === "pm2" && (
        <div className={styles.grid}>
          {pm2Jobs.length === 0 && (
            <p className={styles.empty} style={{ gridColumn: "1 / -1" }}>
              No PM2 jobs found — is the PM2 stats endpoint configured?
            </p>
          )}
          {pm2Jobs.map((job) => {
            const badge      = BADGE_STYLES[job.eligibility];
            const isMigrating = migrating.has(job.name);
            const cfJob       = findCfJob(job.name);
            const canMigrate  = job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK";
            const showMigrateBtn = canMigrate;
            const showGamemode =
              cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK");
            const pm2Proc = pm2Processes?.find((p) => p.name === job.name);

            const migrateLabel = job.eligibility === "CF_WEBHOOK"
              ? "Setup Webhook Relay"
              : "Migrate to CF";

            return (
              <div key={job.name} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.jobName}>{job.name}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {pm2Proc && pm2Proc.status === "online" && (
                      <span
                        className={`${styles.pm2Status} ${styles.statusOnline}`}
                        title="Process is online"
                      >
                        {"●"}
                      </span>
                    )}
                    {pm2Proc && pm2Proc.status !== "online" && (
                      <span
                        className={`${styles.pm2Status} ${styles.statusStopped}`}
                        title="Process is stopped"
                      >
                        {"○"}
                      </span>
                    )}
                    <span
                      className={styles.badge}
                      style={{ background: badge.background, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>

                {pm2Proc && (
                  <div className={styles.pm2Detail}>
                    {pm2Proc.memMb.toFixed(0)} MB · {pm2Proc.cpuPct}% CPU · {pm2Proc.restarts} restarts
                  </div>
                )}

                {job.schedule && (
                  <span className={styles.schedule}>{job.schedule}</span>
                )}

                <span className={styles.reason}>{job.reason}</span>

                {cardErrors[job.name] && (
                  <span className={styles.cardError}>{cardErrors[job.name]}</span>
                )}

                <div className={styles.actions}>
                  {showMigrateBtn && (
                    <button
                      className={styles.btnMigrate}
                      disabled={isMigrating || !!cfJob}
                      title={
                        cfJob
                          ? "Already registered in CF"
                          : job.eligibility === "CF_WEBHOOK"
                            ? "Registers CF cron -> webhook relay -> PM2 wrapper"
                            : undefined
                      }
                      onClick={() => handleMigrate(job)}
                    >
                      {isMigrating && <span className={styles.spinner} />}
                      {isMigrating ? "Migrating..." : cfJob ? "Registered" : migrateLabel}
                    </button>
                  )}

                  {showGamemode && cfJob && (
                    <button
                      className={`${styles.btnToggle} ${cfJob.gamemode_suspend ? styles.btnToggleOn : ""}`}
                      onClick={() => handleGamemodeToggle(cfJob)}
                      title="Toggle gamemode suspend — when ON, job is paused during gaming sessions"
                    >
                      {cfJob.gamemode_suspend ? "Gaming: ON" : "Gaming: OFF"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: CF Registry */}
      {activeTab === "cf" && (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Schedule</th>
                  <th className={styles.th}>Target URL</th>
                  <th className={styles.th}>Enabled</th>
                  <th className={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {cfJobs.length === 0 && (
                  <tr>
                    <td className={styles.td} colSpan={5}>
                      <span style={{ color: "#aaa", display: "flex", alignItems: "center", gap: 6 }}>
                        No CF jobs yet — use &apos;+ Add Job&apos; below to register one.
                      </span>
                    </td>
                  </tr>
                )}
                {cfJobs.map((job) => (
                  <tr key={job.id}>
                    <td className={styles.td}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>
                        {job.name}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#888" }}>
                        {job.schedule}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.truncate} title={job.target_url}>
                        {job.target_url.length > 40
                          ? job.target_url.slice(0, 40) + "..."
                          : job.target_url}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <button
                        className={`${styles.btnToggle} ${job.enabled ? styles.btnToggleOn : ""}`}
                        onClick={() => handleToggleEnabled(job)}
                      >
                        {job.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td className={styles.td}>
                      <button
                        className={styles.btnDelete}
                        onClick={() => handleDelete(job)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inline add-job form */}
          {!showAddForm ? (
            <button className={styles.btnAddOpen} onClick={() => setShowAddForm(true)}>
              + Add Job
            </button>
          ) : (
            <form className={styles.addForm} onSubmit={handleAddSubmit}>
              <p className={styles.addFormTitle}>New CF Cron Job</p>

              {validationError && (
                <div style={{
                  background: "#dc2828",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  marginBottom: 4,
                }}>
                  {validationError}
                </div>
              )}

              {addError && (
                <div className={styles.errorBanner}>
                  <span>{addError}</span>
                </div>
              )}

              <div className={styles.addFormRow}>
                <input
                  className={styles.input}
                  placeholder="name (alphanumeric, dashes, underscores)"
                  value={addForm.name}
                  onChange={(e) => {
                    setValidationError(null);
                    setAddForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  required
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                  <input
                    className={styles.input}
                    style={{ flex: "unset", width: "100%" }}
                    placeholder="schedule (cron)"
                    value={addForm.schedule}
                    onChange={(e) => {
                      setValidationError(null);
                      setAddForm((f) => ({ ...f, schedule: e.target.value }));
                    }}
                    required
                  />
                  <details style={{ fontSize: 11, color: "#666" }}>
                    <summary style={{ cursor: "pointer", userSelect: "none", listStyle: "none", color: "#888" }}>
                      Cron examples
                    </summary>
                    <pre style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "#666",
                      margin: "4px 0 0 0",
                      padding: "6px 8px",
                      background: "#0d0d0d",
                      borderRadius: 4,
                      lineHeight: "1.7",
                      whiteSpace: "pre",
                    }}>
{`0 7 * * *      — Daily at 7am UTC
0 */6 * * *    — Every 6 hours
0 0 * * 0      — Weekly on Sunday midnight
*/5 * * * *    — Every 5 minutes`}
                    </pre>
                  </details>
                </div>
              </div>

              <div className={styles.addFormRow}>
                <input
                  className={styles.input}
                  placeholder="target_url (https://...)"
                  value={addForm.target_url}
                  onChange={(e) => {
                    setValidationError(null);
                    setAddForm((f) => ({ ...f, target_url: e.target.value }));
                  }}
                  required
                />
                <select
                  className={styles.select}
                  value={addForm.token_key}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      token_key: e.target.value as AddFormState["token_key"],
                    }))
                  }
                >
                  <option value="PIPELINE_TOKEN">PIPELINE_TOKEN</option>
                  <option value="EV_BETTA_TOKEN">EV_BETTA_TOKEN</option>
                  <option value="INGEST_SECRET">INGEST_SECRET</option>
                </select>
              </div>

              <div className={styles.actions}>
                <button
                  type="submit"
                  className={styles.btnAdd}
                  disabled={addSubmitting}
                >
                  {addSubmitting ? "Adding..." : "Add Job"}
                </button>
                <button
                  type="button"
                  className={styles.btnToggle}
                  onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); setAddError(null); setValidationError(null); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* Tab: Migration Log */}
      {activeTab === "log" && (
        <div className={styles.logList}>
          {cfJobs
            .filter((j) => j.migrated_from !== null)
            .sort((a, b) => b.created_at - a.created_at)
            .map((job) => (
              <div key={job.id} className={styles.logItem}>
                <span
                  style={{ color: "#666", fontSize: 14, flexShrink: 0 }}
                  title="Migration status unknown"
                >
                  {"•"}
                </span>
                <span className={styles.logName}>{job.name}</span>
                {job.migrated_from && job.migrated_from !== job.name && (
                  <span className={styles.logFrom}>from: {job.migrated_from}</span>
                )}
                <span className={styles.logDate}>
                  {new Date(job.created_at * 1000).toLocaleDateString()}
                </span>
              </div>
            ))}
          {cfJobs.filter((j) => j.migrated_from !== null).length === 0 && (
            <p className={styles.empty}>No migrations recorded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
