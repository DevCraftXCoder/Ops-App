"use client";

import React, { useCallback, useDeferredValue, useEffect, useState } from "react";
import styles from "./cron-manager.module.css";
import type { Pm2Process } from "@/hooks/usePm2Stats";

interface ClassifiedJob {
  name: string;
  schedule: string | null;
  eligibility: "CF_READY" | "CF_WEBHOOK" | "PM2_ONLY" | "RESTART_ONLY" | "ALREADY_MIGRATED";
  reason: string;
  gamemodeSuspend: boolean;
  _proc?: Pm2Process;
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

interface ModeState {
  mode: string;
  changedAt: number;
  suspended_crons: string[];
}

interface AddFormState {
  name: string;
  schedule: string;
  target_url: string;
  token_key: "PIPELINE_TOKEN" | "EV_BETTA_TOKEN" | "INGEST_SECRET";
}

interface CronManagerPanelProps {
  pm2Processes?: Pm2Process[] | null;
}

type ActiveTab = "pm2" | "cf" | "log";
type ViewMode = "comfortable" | "compact" | "list";
type JobSeverity = "healthy" | "warning" | "unstable";
type SeverityFilter = "all" | JobSeverity;
type EligibilityFilter = "all" | ClassifiedJob["eligibility"];
type TriggerFilter = "all" | "direct" | "webhook" | "legacy" | "migrated";
type FrequencyFilter = "all" | "minutes" | "hourly" | "daily" | "weekly" | "custom";

const EMPTY_FORM: AddFormState = {
  name: "",
  schedule: "0 7 * * *",
  target_url: "",
  token_key: "PIPELINE_TOKEN",
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ELIGIBILITY_META: Record<
  ClassifiedJob["eligibility"],
  {
    label: string;
    shortLabel: string;
    tone: JobSeverity | "info" | "inactive";
    trigger: TriggerFilter;
  }
> = {
  CF_READY: {
    label: "Ready",
    shortLabel: "Direct schedule",
    tone: "healthy",
    trigger: "direct",
  },
  CF_WEBHOOK: {
    label: "Webhook",
    shortLabel: "Relay required",
    tone: "warning",
    trigger: "webhook",
  },
  PM2_ONLY: {
    label: "Legacy PM2",
    shortLabel: "Manual migration",
    tone: "inactive",
    trigger: "legacy",
  },
  RESTART_ONLY: {
    label: "Restart focus",
    shortLabel: "Stability review",
    tone: "warning",
    trigger: "legacy",
  },
  ALREADY_MIGRATED: {
    label: "Migrated",
    shortLabel: "In CF registry",
    tone: "info",
    trigger: "migrated",
  },
};

function parseCron(schedule: string | null) {
  if (!schedule) return null;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function formatUtcTime(hour: number, minute: number) {
  return new Date(Date.UTC(2026, 0, 1, hour, minute)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function describeCron(schedule: string | null) {
  const parsed = parseCron(schedule);
  if (!parsed) return "Schedule unavailable";
  const { minute, hour, dayOfWeek } = parsed;

  if (minute.startsWith("*/") && hour === "*") {
    return `Every ${minute.slice(2)} minutes`;
  }

  if (minute === "0" && hour.startsWith("*/")) {
    return `Every ${hour.slice(2)} hours`;
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfWeek === "*") {
    return `Daily at ${formatUtcTime(Number(hour), Number(minute))} UTC`;
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfWeek)) {
    return `Weekly on ${WEEKDAYS[Number(dayOfWeek) % 7]} at ${formatUtcTime(Number(hour), Number(minute))} UTC`;
  }

  return schedule ?? "Custom schedule";
}

function getFrequencyBucket(schedule: string | null): Exclude<FrequencyFilter, "all"> {
  const parsed = parseCron(schedule);
  if (!parsed) return "custom";
  const { minute, hour, dayOfWeek } = parsed;

  if (minute.startsWith("*/")) return "minutes";
  if (hour.startsWith("*/")) return "hourly";
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfWeek === "*") return "daily";
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfWeek)) return "weekly";
  return "custom";
}

function getTimelineMeta(schedule: string | null) {
  const parsed = parseCron(schedule);
  if (!parsed) {
    return { left: 6, width: 14, cadenceLabel: "Custom cadence" };
  }

  if (parsed.minute.startsWith("*/")) {
    const interval = Number(parsed.minute.slice(2)) || 5;
    return {
      left: 4,
      width: Math.max(10, Math.min(88, (interval / 60) * 100)),
      cadenceLabel: `Repeats every ${interval} minutes`,
    };
  }

  if (parsed.hour.startsWith("*/")) {
    const interval = Number(parsed.hour.slice(2)) || 1;
    return {
      left: 6,
      width: Math.max(10, Math.min(88, (interval / 24) * 100)),
      cadenceLabel: `Repeats every ${interval} hours`,
    };
  }

  if (/^\d+$/.test(parsed.hour)) {
    return {
      left: (Number(parsed.hour) / 24) * 100,
      width: 4.5,
      cadenceLabel: /^\d+$/.test(parsed.dayOfWeek) ? "Weekly anchor" : "Daily anchor",
    };
  }

  return { left: 6, width: 14, cadenceLabel: "Custom cadence" };
}

function getNextRunDate(schedule: string | null) {
  const parsed = parseCron(schedule);
  if (!parsed) return null;

  const now = new Date();

  if (parsed.minute.startsWith("*/") && parsed.hour === "*") {
    const interval = Number(parsed.minute.slice(2));
    if (!interval) return null;
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(Math.floor(next.getUTCMinutes() / interval) * interval + interval);
    return next;
  }

  if (parsed.minute === "0" && parsed.hour.startsWith("*/")) {
    const interval = Number(parsed.hour.slice(2));
    if (!interval) return null;
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(Math.floor(next.getUTCHours() / interval) * interval + interval);
    return next;
  }

  if (/^\d+$/.test(parsed.minute) && /^\d+$/.test(parsed.hour)) {
    const minute = Number(parsed.minute);
    const hour = Number(parsed.hour);
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ));

    if (/^\d+$/.test(parsed.dayOfWeek)) {
      const targetDay = Number(parsed.dayOfWeek) % 7;
      const currentDay = now.getUTCDay();
      let delta = targetDay - currentDay;
      if (delta < 0 || (delta === 0 && next <= now)) delta += 7;
      next.setUTCDate(next.getUTCDate() + delta);
      return next;
    }

    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  return null;
}

function formatCountdown(target: Date | null) {
  if (!target) return "Next run unavailable";
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return "Due now";

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) return `Next in ${Math.max(1, totalMinutes)}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `Next in ${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `Next in ${days}d ${remainingHours}h`;
}

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp) return "Waiting for refresh";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `Last checked ${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Last checked ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `Last checked ${diffHours}h ago`;
}

function formatUptime(uptimeMs: number | undefined) {
  if (!uptimeMs || uptimeMs <= 0) return "Fresh process";
  const totalMinutes = Math.floor(uptimeMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m uptime`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m uptime`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h uptime`;
}

function getJobSeverity(proc?: Pm2Process): JobSeverity {
  if (!proc) return "warning";
  if (proc.status !== "online" || proc.restarts >= 20 || proc.cpuPct >= 90) return "unstable";
  if (proc.restarts >= 2 || proc.cpuPct >= 60 || proc.memMb >= 350) return "warning";
  return "healthy";
}

function getRestartChipLabel(proc?: Pm2Process) {
  if (!proc) return "Process telemetry unavailable";
  if (proc.restarts === 0) return "No restarts";
  if (proc.restarts === 1) return "1 restart";
  return `${proc.restarts} restarts`;
}

function getRestartSeverityLabel(proc?: Pm2Process) {
  if (!proc) return "Needs review";
  if (proc.restarts >= 20) return "Critical attention";
  if (proc.restarts >= 2) return "Needs watching";
  return "Healthy";
}

function getMigrationPriorityScore(job: ClassifiedJob, proc: Pm2Process | undefined, cfJob?: CronJobRow) {
  if (cfJob) return -1;

  let score = 0;
  if (job.eligibility === "CF_READY") score += 50;
  if (job.eligibility === "CF_WEBHOOK") score += 35;
  if (job.eligibility === "RESTART_ONLY") score += 10;
  if (getJobSeverity(proc) === "unstable") score += 30;
  if (getJobSeverity(proc) === "warning") score += 15;
  if (proc?.restarts) score += Math.min(proc.restarts, 20);
  return score;
}

function buildMigrationPayload(job: ClassifiedJob) {
  return {
    name: job.name,
    schedule: job.schedule ?? "0 7 * * *",
    target_url: job.eligibility === "CF_WEBHOOK"
      ? `https://stats.frxncois.com/api/pm2-webhook/${job.name}`
      : `https://www.frxncois.com/api/cron/${job.name}`,
    token_key: job.eligibility === "CF_WEBHOOK" ? "INGEST_SECRET" : "PIPELINE_TOKEN",
    gamemode_suspend: 1,
    migrated_from: job.name,
  };
}

export function CronManagerPanel({ pm2Processes }: CronManagerPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("pm2");
  const [pm2Jobs, setPm2Jobs] = useState<ClassifiedJob[]>([]);
  const [cfJobs, setCfJobs] = useState<CronJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [controlBusy, setControlBusy] = useState<Record<string, string>>({});
  const [controlErrors, setControlErrors] = useState<Record<string, string>>({});
  const [suspendedCrons, setSuspendedCrons] = useState<string[]>([]);
  const [gamemodeLoading, setGamemodeLoading] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("comfortable");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("all");
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [inspectedJobName, setInspectedJobName] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [confirmCronDeleteId, setConfirmCronDeleteId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

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
      setLastSyncAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cron data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchModeState = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/mode-state", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as ModeState;
      setSuspendedCrons(data.suspended_crons ?? []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchModeState();
  }, [fetchData, fetchModeState]);

  useEffect(() => {
    setSelectedJobs((prev) => {
      const next = new Set<string>();
      for (const name of prev) {
        if (pm2Jobs.some((job) => job.name === name)) next.add(name);
      }
      return next;
    });

    if (inspectedJobName && !pm2Jobs.some((job) => job.name === inspectedJobName)) {
      setInspectedJobName(null);
    }
  }, [inspectedJobName, pm2Jobs]);

  const findCfJob = useCallback((name: string) => {
    return cfJobs.find((job) => job.name === name);
  }, [cfJobs]);

  const resolvePm2Proc = useCallback((job: ClassifiedJob) => {
    return job._proc ?? pm2Processes?.find((process) => process.name === job.name);
  }, [pm2Processes]);

  const registerJob = useCallback(async (job: ClassifiedJob, shouldRefresh = true) => {
    setMigrating((prev) => new Set([...prev, job.name]));
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[job.name];
      return next;
    });

    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildMigrationPayload(job)),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }

      if (shouldRefresh) await fetchData();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Migration failed";
      setCardErrors((prev) => ({ ...prev, [job.name]: message }));
      return false;
    } finally {
      setMigrating((prev) => {
        const next = new Set(prev);
        next.delete(job.name);
        return next;
      });
    }
  }, [fetchData]);

  const handlePm2Control = useCallback(async (
    jobName: string,
    action: "start" | "stop" | "restart",
  ) => {
    setControlBusy((prev) => ({ ...prev, [jobName]: action }));
    setControlErrors((prev) => {
      const next = { ...prev };
      delete next[jobName];
      return next;
    });

    try {
      const res = await fetch("/api/ops/pm2-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: jobName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Control action failed";
      setControlErrors((prev) => ({ ...prev, [jobName]: message }));
    } finally {
      setControlBusy((prev) => {
        const next = { ...prev };
        delete next[jobName];
        return next;
      });
    }
  }, [fetchData]);

  const handleMigrate = useCallback(async (job: ClassifiedJob) => {
    await registerJob(job, true);
  }, [registerJob]);

  const handleGamemodeToggle = useCallback(async (job: ClassifiedJob, cfJob?: CronJobRow) => {
    const jobName = job.name;
    setGamemodeLoading((prev) => new Set([...prev, jobName]));

    const isSuspended = suspendedCrons.includes(jobName);
    const patchBody = isSuspended ? { remove: jobName } : { add: jobName };

    try {
      const modeRes = await fetch("/api/ops/mode-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (modeRes.ok) {
        const modeData = await modeRes.json() as { suspended_crons?: string[] };
        setSuspendedCrons(modeData.suspended_crons ?? []);
      }

      if (cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK")) {
        const newValue = cfJob.gamemode_suspend ? 0 : 1;
        await fetch("/api/ops/cron-manager", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cfJob.id, gamemode_suspend: newValue }),
        }).catch(() => {
          // mode-state is the authority
        });
        await fetchData();
      }
    } catch {
      // non-critical
    } finally {
      setGamemodeLoading((prev) => {
        const next = new Set(prev);
        next.delete(jobName);
        return next;
      });
    }
  }, [fetchData, suspendedCrons]);

  const handleToggleEnabled = useCallback(async (job: CronJobRow) => {
    const newValue = job.enabled ? 0 : 1;
    try {
      const res = await fetch("/api/ops/cron-manager", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, enabled: newValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch {
      // silently ignore
    }
  }, [fetchData]);

  const handleDelete = useCallback((job: CronJobRow) => {
    setConfirmCronDeleteId(job.id);
  }, []);

  const confirmCronDelete = useCallback(async (id: string) => {
    setConfirmCronDeleteId(null);
    try {
      const res = await fetch(`/api/ops/cron-manager?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch {
      // silently ignore
    }
  }, [fetchData]);

  const handleAddSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
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

  const allPm2Resolved = pm2Jobs.map((job) => {
    const proc = resolvePm2Proc(job);
    const cfJob = findCfJob(job.name);
    return {
      job,
      proc,
      cfJob,
      severity: getJobSeverity(proc),
      frequency: getFrequencyBucket(job.schedule),
      trigger: ELIGIBILITY_META[job.eligibility].trigger,
      description: describeCron(job.schedule),
      nextRun: formatCountdown(getNextRunDate(job.schedule)),
    };
  });

  const cfCount = allPm2Resolved.filter(({ job }) => (
    job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK"
  )).length;
  const webhookCount = allPm2Resolved.filter(({ job }) => job.eligibility === "CF_WEBHOOK").length;
  const pm2OnlyCount = allPm2Resolved.filter(({ job }) => (
    job.eligibility === "PM2_ONLY" || job.eligibility === "RESTART_ONLY"
  )).length;
  const migratedCount = allPm2Resolved.filter(({ job }) => job.eligibility === "ALREADY_MIGRATED").length;
  const unstableCount = allPm2Resolved.filter(({ severity }) => severity === "unstable").length;
  const warningCount = allPm2Resolved.filter(({ severity }) => severity === "warning").length;
  const healthyCount = allPm2Resolved.filter(({ severity }) => severity === "healthy").length;
  const eligibleCount = allPm2Resolved.filter(({ job, cfJob }) => {
    return !cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK");
  }).length;
  const readinessScore = Math.round(((eligibleCount + migratedCount) / Math.max(pm2Jobs.length, 1)) * 100);

  const recommendedJobs = [...allPm2Resolved]
    .filter(({ job, cfJob }) => !cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK"))
    .sort((a, b) => (
      getMigrationPriorityScore(b.job, b.proc, b.cfJob) - getMigrationPriorityScore(a.job, a.proc, a.cfJob)
    ))
    .slice(0, 3);

  const blockers = [
    pm2OnlyCount > 0 ? `${pm2OnlyCount} legacy-only jobs still need manual migration design` : null,
    unstableCount > 0 ? `${unstableCount} jobs are unstable and should be stabilized before migration` : null,
    webhookCount > 0 ? `${webhookCount} jobs depend on the webhook relay path` : null,
  ].filter(Boolean) as string[];

  const filteredJobs = allPm2Resolved.filter(({ job, severity, frequency, trigger, description }) => {
    const matchesQuery = deferredSearch.length === 0
      || job.name.toLowerCase().includes(deferredSearch)
      || description.toLowerCase().includes(deferredSearch)
      || (job.schedule ?? "").toLowerCase().includes(deferredSearch);

    const matchesSeverity = severityFilter === "all" || severity === severityFilter;
    const matchesEligibility = eligibilityFilter === "all" || job.eligibility === eligibilityFilter;
    const matchesTrigger = triggerFilter === "all" || trigger === triggerFilter;
    const matchesFrequency = frequencyFilter === "all" || frequency === frequencyFilter;

    return matchesQuery && matchesSeverity && matchesEligibility && matchesTrigger && matchesFrequency;
  });

  const allVisibleSelected = filteredJobs.length > 0 && filteredJobs.every(({ job }) => selectedJobs.has(job.name));
  const selectedResolved = filteredJobs.filter(({ job }) => selectedJobs.has(job.name));
  const selectedMigrateable = selectedResolved.filter(({ job, cfJob }) => {
    return !cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK");
  });

  const inspectedResolved = inspectedJobName
    ? allPm2Resolved.find(({ job }) => job.name === inspectedJobName)
    : null;

  const handleToggleSelection = (jobName: string) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobName)) next.delete(jobName);
      else next.add(jobName);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const { job } of filteredJobs) next.delete(job.name);
        return next;
      }
      for (const { job } of filteredJobs) next.add(job.name);
      return next;
    });
  };

  const handleBulkMigrate = useCallback(async () => {
    for (const { job } of selectedMigrateable) {
      await registerJob(job, false);
    }
    await fetchData();
    setSelectedJobs(new Set());
  }, [fetchData, registerJob, selectedMigrateable]);

  const handleBulkGaming = useCallback(async (enabled: boolean) => {
    for (const { job, cfJob } of selectedResolved) {
      const isSuspended = suspendedCrons.includes(job.name);
      if ((enabled && !isSuspended) || (!enabled && isSuspended)) {
        await handleGamemodeToggle(job, cfJob);
      }
    }
  }, [handleGamemodeToggle, selectedResolved, suspendedCrons]);

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.summaryShell}>
          <div className={styles.headingBlock}>
            <div>
              <p className={styles.eyebrow}>Cron migration</p>
              <p className={styles.title}>Cron Manager</p>
            </div>
          </div>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.skeleton} style={{ width: "36%" }} />
              <div className={styles.skeleton} style={{ width: "78%", height: 12 }} />
              <div className={styles.skeleton} style={{ width: "62%", height: 10 }} />
              <div className={styles.skeleton} style={{ width: "100%", height: 40 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.summaryShell}>
        <div className={styles.headingBlock}>
          <div className={styles.headingCopy}>
            <p className={styles.eyebrow}>Cron migration</p>
            <p className={styles.title}>Cron Manager</p>
            <p className={styles.subtitle}>
              Prioritize risky jobs first, migrate what is ready, and keep legacy PM2 work visible.
            </p>
          </div>
          <div className={styles.summaryMeta}>
            <span className={styles.metaLabel}>{formatRelativeTime(lastSyncAt)}</span>
            <span className={styles.metaLabel}>Readiness {readinessScore}%</span>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total jobs</span>
            <strong className={styles.kpiValue}>{pm2Jobs.length}</strong>
            <span className={styles.kpiTrend}>{healthyCount} healthy</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Ready to migrate</span>
            <strong className={styles.kpiValue}>{eligibleCount}</strong>
            <span className={styles.kpiTrend}>{cfCount} CF-capable</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Migrated</span>
            <strong className={styles.kpiValue}>{migratedCount}</strong>
            <span className={styles.kpiTrend}>{Math.round((migratedCount / Math.max(pm2Jobs.length, 1)) * 100)}% of fleet</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Unhealthy</span>
            <strong className={styles.kpiValueDanger}>{unstableCount}</strong>
            <span className={styles.kpiTrend}>{warningCount} warnings</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Legacy PM2</span>
            <strong className={styles.kpiValueMuted}>{pm2OnlyCount}</strong>
            <span className={styles.kpiTrend}>{webhookCount} relay-based</span>
          </div>
        </div>

        <div className={styles.workflowStrip}>
          <div className={styles.workflowCard}>
            <span className={styles.workflowLabel}>Next recommended migrations</span>
            <div className={styles.recommendationList}>
              {recommendedJobs.length === 0 && (
                <span className={styles.workflowValue}>No immediate migrations queued</span>
              )}
              {recommendedJobs.map(({ job, severity, description }) => (
                <div key={job.name} className={styles.recommendationItem}>
                  <span className={styles.recommendationName}>{job.name}</span>
                  <span className={`${styles.inlinePill} ${severity === "unstable" ? styles.pillDanger : severity === "warning" ? styles.pillWarning : styles.pillSuccess}`}>
                    {severity}
                  </span>
                  <span className={styles.recommendationMeta}>{description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.workflowCard}>
            <span className={styles.workflowLabel}>Migration blockers</span>
            <div className={styles.blockerList}>
              {blockers.length === 0 && (
                <span className={styles.workflowValue}>No blockers surfaced from current data</span>
              )}
              {blockers.map((blocker) => (
                <span key={blocker} className={styles.blockerItem}>{blocker}</span>
              ))}
            </div>
          </div>

          <div className={styles.workflowCard}>
            <span className={styles.workflowLabel}>Progress</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${Math.min(100, readinessScore)}%` }} />
            </div>
            <span className={styles.workflowValue}>
              {migratedCount} deployed, {eligibleCount} ready, {unstableCount} need attention
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.secondaryButton} onClick={fetchData}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.tabs}>
        {(["pm2", "cf", "log"] as const).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "pm2" ? "PM2 jobs" : tab === "cf" ? "CF registry" : "Migration log"}
          </button>
        ))}
      </div>

      {activeTab === "pm2" && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search job name or cron expression"
              />
            </div>

            <div className={styles.filterRow}>
              <select
                className={styles.select}
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
              >
                <option value="all">All health</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="unstable">Unstable</option>
              </select>

              <select
                className={styles.select}
                value={triggerFilter}
                onChange={(event) => setTriggerFilter(event.target.value as TriggerFilter)}
              >
                <option value="all">All triggers</option>
                <option value="direct">Direct schedule</option>
                <option value="webhook">Webhook relay</option>
                <option value="legacy">Legacy PM2</option>
                <option value="migrated">Migrated</option>
              </select>

              <select
                className={styles.select}
                value={eligibilityFilter}
                onChange={(event) => setEligibilityFilter(event.target.value as EligibilityFilter)}
              >
                <option value="all">All states</option>
                <option value="CF_READY">Ready</option>
                <option value="CF_WEBHOOK">Webhook</option>
                <option value="PM2_ONLY">Legacy PM2</option>
                <option value="RESTART_ONLY">Restart focus</option>
                <option value="ALREADY_MIGRATED">Migrated</option>
              </select>

              <select
                className={styles.select}
                value={frequencyFilter}
                onChange={(event) => setFrequencyFilter(event.target.value as FrequencyFilter)}
              >
                <option value="all">All cadence</option>
                <option value="minutes">Minute cadence</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className={styles.viewSwitcher}>
              {(["comfortable", "compact", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`${styles.viewButton} ${viewMode === mode ? styles.viewButtonActive : ""}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "comfortable" ? "Comfortable" : mode === "compact" ? "Compact" : "List view"}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.bulkBar}>
            <div className={styles.bulkCopy}>
              <button className={styles.secondaryButton} onClick={handleSelectAllVisible}>
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>
              <span className={styles.bulkLabel}>
                {filteredJobs.length} shown / {selectedResolved.length} selected
              </span>
            </div>

            <div className={styles.bulkActions}>
              <button
                className={styles.primaryButton}
                disabled={selectedMigrateable.length === 0}
                onClick={() => { void handleBulkMigrate(); }}
              >
                Bulk migrate
              </button>
              <button
                className={styles.secondaryButton}
                disabled={selectedResolved.length === 0}
                onClick={() => { void handleBulkGaming(true); }}
              >
                Bulk pause in gaming
              </button>
              <button
                className={styles.secondaryButton}
                disabled={selectedResolved.length === 0}
                onClick={() => { void handleBulkGaming(false); }}
              >
                Resume selected
              </button>
            </div>
          </div>

          <div
            className={`${styles.grid} ${viewMode === "compact" ? styles.gridCompact : ""} ${viewMode === "list" ? styles.gridList : ""}`}
          >
            {filteredJobs.length === 0 && (
              <p className={styles.empty}>No jobs match the current search and filters.</p>
            )}

            {filteredJobs.map(({ job, proc, cfJob, severity, description, frequency, nextRun }) => {
              const meta = ELIGIBILITY_META[job.eligibility];
              const timeline = getTimelineMeta(job.schedule);
              const isMigrating = migrating.has(job.name);
              const isOnline = proc?.status === "online";
              const busyAction = controlBusy[job.name];
              const isBusy = !!busyAction;
              const procExists = !!proc;
              const isSelected = selectedJobs.has(job.name);
              const isSuspended = suspendedCrons.includes(job.name);
              const gamemodeInFlight = gamemodeLoading.has(job.name);
              const canMigrate = !cfJob && (job.eligibility === "CF_READY" || job.eligibility === "CF_WEBHOOK");
              const showControls = job.eligibility !== "ALREADY_MIGRATED";
              const showStartStop = job.eligibility !== "RESTART_ONLY";
              const migrateLabel = job.eligibility === "CF_WEBHOOK" ? "Setup relay" : "Migrate";

              return (
                <article
                  key={job.name}
                  className={`${styles.card} ${severity === "healthy" ? styles.cardHealthy : severity === "warning" ? styles.cardWarning : styles.cardUnstable} ${isSelected ? styles.cardSelected : ""} ${viewMode === "compact" ? styles.cardCompact : ""} ${viewMode === "list" ? styles.cardList : ""}`}
                  onClick={() => setInspectedJobName(job.name)}
                >
                  <div className={styles.cardTop}>
                    <label
                      className={styles.selector}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelection(job.name)}
                      />
                    </label>

                    <div className={styles.cardIdentity}>
                      <div className={styles.cardEyebrow}>Job name</div>
                      <h3 className={styles.jobName}>{job.name}</h3>
                      <p className={styles.scheduleLead}>{description}</p>
                      <p className={styles.scheduleSubline}>
                        <span>{nextRun}</span>
                        <span>{formatUptime(proc?.uptimeMs)}</span>
                      </p>
                    </div>

                    <div className={styles.cardStatus}>
                      <span className={`${styles.statusBadge} ${meta.tone === "healthy" ? styles.badgeSuccess : meta.tone === "warning" ? styles.badgeWarning : meta.tone === "info" ? styles.badgeInfo : styles.badgeMuted}`}>
                        {meta.label}
                      </span>
                      <span className={`${styles.statusPill} ${isOnline ? styles.pillSuccess : styles.pillDanger}`}>
                        {isOnline ? "Online" : "Stopped"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.timelineBlock}>
                    <div className={styles.timelineHead}>
                      <span className={styles.timelineLabel}>Schedule</span>
                      <span className={styles.timelineMeta}>{timeline.cadenceLabel}</span>
                    </div>
                    <div className={styles.timelineTrack}>
                      <div
                        className={styles.timelineWindow}
                        style={{ left: `${timeline.left}%`, width: `${timeline.width}%` }}
                      />
                    </div>
                    <div className={styles.timelineScale}>
                      <span>00:00</span>
                      <span>12:00</span>
                      <span>24:00</span>
                    </div>
                  </div>

                  <div className={styles.metaChips}>
                    <span className={`${styles.inlinePill} ${severity === "healthy" ? styles.pillSuccess : severity === "warning" ? styles.pillWarning : styles.pillDanger}`}>
                      {getRestartSeverityLabel(proc)}
                    </span>
                    <span className={`${styles.inlinePill} ${severity === "healthy" ? styles.pillNeutral : severity === "warning" ? styles.pillWarningSoft : styles.pillDangerSoft}`}>
                      {getRestartChipLabel(proc)}
                    </span>
                    <span className={styles.inlinePill}>{meta.shortLabel}</span>
                    <span className={styles.inlinePill}>{frequency}</span>
                    <span className={styles.inlinePill}>{cfJob ? "Registered in CF" : "Not registered"}</span>
                    <span className={`${styles.inlinePill} ${isSuspended ? styles.pillInfo : styles.pillNeutral}`}>
                      {isSuspended ? "Paused in gaming" : "Runs in gaming"}
                    </span>
                  </div>

                  <p className={styles.reason}>{job.reason}</p>

                  {(controlErrors[job.name] || cardErrors[job.name]) && (
                    <span className={styles.cardError}>
                      {controlErrors[job.name] ?? cardErrors[job.name]}
                    </span>
                  )}

                  <details
                    className={styles.details}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary>Advanced metadata</summary>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailCell}>
                        <span className={styles.detailLabel}>Raw cron</span>
                        <strong>{job.schedule ?? "Unavailable"}</strong>
                      </div>
                      <div className={styles.detailCell}>
                        <span className={styles.detailLabel}>Trigger type</span>
                        <strong>{meta.shortLabel}</strong>
                      </div>
                      <div className={styles.detailCell}>
                        <span className={styles.detailLabel}>Memory / CPU</span>
                        <strong>{proc ? `${proc.memMb.toFixed(0)} MB / ${proc.cpuPct}%` : "Unavailable"}</strong>
                      </div>
                      <div className={styles.detailCell}>
                        <span className={styles.detailLabel}>Registry</span>
                        <strong>{cfJob ? cfJob.target_url : "No CF registry row yet"}</strong>
                      </div>
                    </div>
                  </details>

                  <div className={styles.cardFooter}>
                    <div className={styles.primaryActionWrap}>
                      {canMigrate && (
                        <button
                          className={styles.primaryButton}
                          disabled={isMigrating}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMigrate(job);
                          }}
                        >
                          {isMigrating && <span className={styles.spinner} />}
                          {isMigrating ? "Migrating..." : migrateLabel}
                        </button>
                      )}
                    </div>

                    <div className={styles.inlineActions}>
                      <button
                        className={styles.secondaryButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setInspectedJobName(job.name);
                        }}
                      >
                        Inspect
                      </button>

                      {showStartStop && (
                        <button
                          className={styles.ghostButton}
                          disabled={isBusy || isOnline || !procExists}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePm2Control(job.name, "start");
                          }}
                        >
                          {busyAction === "start" && <span className={styles.spinner} />}
                          Start
                        </button>
                      )}

                      {showStartStop && (
                        <button
                          className={styles.ghostButton}
                          disabled={isBusy || !isOnline}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePm2Control(job.name, "stop");
                          }}
                        >
                          {busyAction === "stop" && <span className={styles.spinner} />}
                          Stop
                        </button>
                      )}

                      {showControls && (
                        <button
                          className={styles.ghostButton}
                          disabled={isBusy || !procExists}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePm2Control(job.name, "restart");
                          }}
                        >
                          {busyAction === "restart" && <span className={styles.spinner} />}
                          Restart
                        </button>
                      )}

                      {showControls && (
                        <button
                          className={`${styles.ghostButton} ${isSuspended ? styles.ghostButtonActive : ""}`}
                          disabled={gamemodeInFlight}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleGamemodeToggle(job, cfJob);
                          }}
                        >
                          {gamemodeInFlight && <span className={styles.spinner} />}
                          {isSuspended ? "Gaming pause" : "Allow in gaming"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {inspectedResolved && (
            <aside className={styles.inspector}>
              <div className={styles.inspectorHeader}>
                <div>
                  <p className={styles.inspectorEyebrow}>Job inspector</p>
                  <h3 className={styles.inspectorTitle}>{inspectedResolved.job.name}</h3>
                </div>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setInspectedJobName(null)}
                >
                  Close
                </button>
              </div>

              <div className={styles.inspectorSection}>
                <span className={styles.inspectorLabel}>Status</span>
                <div className={styles.metaChips}>
                  <span className={`${styles.inlinePill} ${inspectedResolved.severity === "healthy" ? styles.pillSuccess : inspectedResolved.severity === "warning" ? styles.pillWarning : styles.pillDanger}`}>
                    {inspectedResolved.severity}
                  </span>
                  <span className={styles.inlinePill}>{ELIGIBILITY_META[inspectedResolved.job.eligibility].label}</span>
                  <span className={styles.inlinePill}>{inspectedResolved.nextRun}</span>
                </div>
              </div>

              <div className={styles.inspectorSection}>
                <span className={styles.inspectorLabel}>Runtime</span>
                <div className={styles.inspectorGrid}>
                  <div className={styles.inspectorStat}>
                    <span className={styles.detailLabel}>Memory</span>
                    <strong>{inspectedResolved.proc ? `${inspectedResolved.proc.memMb.toFixed(0)} MB` : "Unavailable"}</strong>
                  </div>
                  <div className={styles.inspectorStat}>
                    <span className={styles.detailLabel}>CPU</span>
                    <strong>{inspectedResolved.proc ? `${inspectedResolved.proc.cpuPct}%` : "Unavailable"}</strong>
                  </div>
                  <div className={styles.inspectorStat}>
                    <span className={styles.detailLabel}>Restarts</span>
                    <strong>{inspectedResolved.proc?.restarts ?? "Unavailable"}</strong>
                  </div>
                  <div className={styles.inspectorStat}>
                    <span className={styles.detailLabel}>Uptime</span>
                    <strong>{formatUptime(inspectedResolved.proc?.uptimeMs)}</strong>
                  </div>
                </div>
              </div>

              <div className={styles.inspectorSection}>
                <span className={styles.inspectorLabel}>Migration posture</span>
                <div className={styles.inspectorStack}>
                  <p className={styles.inspectorText}>{inspectedResolved.description}</p>
                  <p className={styles.inspectorText}>{inspectedResolved.job.reason}</p>
                  <p className={styles.inspectorText}>
                    Registry: {inspectedResolved.cfJob ? inspectedResolved.cfJob.target_url : "No CF registry row yet"}
                  </p>
                </div>
              </div>
            </aside>
          )}
        </>
      )}

      {activeTab === "cf" && (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Schedule</th>
                  <th className={styles.th}>Target</th>
                  <th className={styles.th}>Enabled</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cfJobs.length === 0 && (
                  <tr>
                    <td className={styles.td} colSpan={5}>
                      <span className={styles.emptyInline}>
                        No CF jobs yet. Register one from PM2 Jobs or add a manual cron entry below.
                      </span>
                    </td>
                  </tr>
                )}
                {cfJobs.map((job) => (
                  <tr key={job.id}>
                    <td className={styles.td}>
                      <span className={styles.tableName}>{job.name}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.tableMono}>{job.schedule}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.truncate} title={job.target_url}>
                        {job.target_url}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <button
                        className={`${styles.secondaryButton} ${job.enabled ? styles.ghostButtonActive : ""}`}
                        onClick={() => { void handleToggleEnabled(job); }}
                      >
                        {job.enabled ? "Enabled" : "Paused"}
                      </button>
                    </td>
                    <td className={styles.td}>
                      <button className={styles.ghostButtonDanger} onClick={() => handleDelete(job)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!showAddForm ? (
            <button className={styles.addOpenButton} onClick={() => setShowAddForm(true)}>
              Add CF job
            </button>
          ) : (
            <form className={styles.addForm} onSubmit={handleAddSubmit}>
              <p className={styles.addFormTitle}>New CF cron job</p>

              {validationError && <div className={styles.errorBanner}>{validationError}</div>}
              {addError && <div className={styles.errorBanner}>{addError}</div>}

              <div className={styles.addFormRow}>
                <input
                  className={styles.searchInput}
                  placeholder="name"
                  value={addForm.name}
                  onChange={(event) => {
                    setValidationError(null);
                    setAddForm((prev) => ({ ...prev, name: event.target.value }));
                  }}
                  required
                />
                <input
                  className={styles.searchInput}
                  placeholder="schedule"
                  value={addForm.schedule}
                  onChange={(event) => {
                    setValidationError(null);
                    setAddForm((prev) => ({ ...prev, schedule: event.target.value }));
                  }}
                  required
                />
              </div>

              <div className={styles.addFormRow}>
                <input
                  className={styles.searchInput}
                  placeholder="https://target-url"
                  value={addForm.target_url}
                  onChange={(event) => {
                    setValidationError(null);
                    setAddForm((prev) => ({ ...prev, target_url: event.target.value }));
                  }}
                  required
                />
                <select
                  className={styles.select}
                  value={addForm.token_key}
                  onChange={(event) => {
                    setAddForm((prev) => ({
                      ...prev,
                      token_key: event.target.value as AddFormState["token_key"],
                    }));
                  }}
                >
                  <option value="PIPELINE_TOKEN">PIPELINE_TOKEN</option>
                  <option value="EV_BETTA_TOKEN">EV_BETTA_TOKEN</option>
                  <option value="INGEST_SECRET">INGEST_SECRET</option>
                </select>
              </div>

              <div className={styles.inlineActions}>
                <button type="submit" className={styles.primaryButton} disabled={addSubmitting}>
                  {addSubmitting ? "Adding..." : "Add job"}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm(EMPTY_FORM);
                    setAddError(null);
                    setValidationError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {activeTab === "log" && (
        <div className={styles.logList}>
          {cfJobs
            .filter((job) => job.migrated_from !== null)
            .sort((a, b) => b.created_at - a.created_at)
            .map((job) => (
              <div key={job.id} className={styles.logItem}>
                <div className={styles.logIdentity}>
                  <span className={styles.logName}>{job.name}</span>
                  <span className={styles.logMeta}>{new Date(job.created_at * 1000).toLocaleString()}</span>
                </div>
                <span className={styles.inlinePill}>
                  {job.migrated_from && job.migrated_from !== job.name ? `From ${job.migrated_from}` : "Direct registration"}
                </span>
                <span className={styles.inlinePill}>{job.schedule}</span>
              </div>
            ))}

          {cfJobs.filter((job) => job.migrated_from !== null).length === 0 && (
            <p className={styles.empty}>No migrations recorded yet.</p>
          )}
        </div>
      )}

      {/* Inline delete confirmation */}
      {confirmCronDeleteId !== null && (
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
              {`Delete CF cron job "${cfJobs.find((j) => j.id === confirmCronDeleteId)?.name ?? confirmCronDeleteId}"?`}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmCronDeleteId(null)}
                style={{
                  padding: "6px 14px", background: "#1e1e1e", border: "1px solid #333",
                  borderRadius: 4, color: "#999", cursor: "pointer", fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { void confirmCronDelete(confirmCronDeleteId); }}
                style={{
                  padding: "6px 14px", background: "#7f1d1d", border: "1px solid #dc2828",
                  borderRadius: 4, color: "#fca5a5", cursor: "pointer", fontSize: 12,
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
