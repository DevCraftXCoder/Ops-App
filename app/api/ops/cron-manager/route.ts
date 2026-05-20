import { NextRequest, NextResponse } from "next/server";
import * as blob from "@/lib/cf-blob";


const CRON_JOBS_KEY = "ops/cron-jobs.json";

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

interface ClassifiedJob {
  name: string;
  schedule: string | null;
  eligibility: "CF_READY" | "CF_WEBHOOK" | "PM2_ONLY" | "RESTART_ONLY" | "ALREADY_MIGRATED";
  reason: string;
  gamemodeSuspend: boolean;
}

interface Pm2Process {
  name: string;
  memMb: number;
  cpuPct: number;
  restarts: number;
  status: string;
  uptimeMs: number;
}

async function loadCronJobs(): Promise<CronJobRow[]> {
  const data = await blob.getJSON<CronJobRow[]>(CRON_JOBS_KEY);
  return data ?? [];
}

async function saveCronJobs(jobs: CronJobRow[]): Promise<void> {
  await blob.put(CRON_JOBS_KEY, JSON.stringify(jobs), {
    contentType: "application/json",
  });
}

export async function GET() {
  const cfJobs = await loadCronJobs();

  const pm2Url = process.env.PM2_STATS_URL;
  const secret = process.env.STATS_SECRET ?? "";

  if (!pm2Url) {
    return NextResponse.json({ pm2Jobs: [], cfJobs, pm2Error: "PM2_STATS_URL not configured" });
  }

  const headers = { "x-stats-secret": secret };

  const [classifyResult, statsResult] = await Promise.allSettled([
    fetch(`${pm2Url}/api/pm2/classify`, { signal: AbortSignal.timeout(8000), headers }),
    fetch(`${pm2Url}/pm2-stats`,        { signal: AbortSignal.timeout(5000), headers }),
  ]);

  // Parse classify response
  let pm2Jobs: ClassifiedJob[] = [];
  let pm2Error: string | undefined;

  if (classifyResult.status === "fulfilled" && classifyResult.value.ok) {
    const body = await classifyResult.value.json() as { jobs?: ClassifiedJob[] };
    pm2Jobs = body.jobs ?? [];
  } else {
    pm2Error =
      classifyResult.status === "rejected"
        ? String(classifyResult.reason)
        : `classify HTTP ${classifyResult.value.status}`;
  }

  // Parse pm2-stats and attach live process info to each classified job
  if (statsResult.status === "fulfilled" && statsResult.value.ok) {
    const statsBody = await statsResult.value.json() as { processes?: Pm2Process[] };
    const procMap = new Map<string, Pm2Process>(
      (statsBody.processes ?? []).map((p) => [p.name, p]),
    );
    // Attach live status to jobs by overwriting the generic gamemodeSuspend flag
    // (the proc map is available downstream — surface it as an enriched field)
    pm2Jobs = pm2Jobs.map((job) => {
      const proc = procMap.get(job.name);
      if (!proc) return job;
      return { ...job, _proc: proc } as ClassifiedJob & { _proc: Pm2Process };
    });
  }

  return NextResponse.json({ pm2Jobs, cfJobs, ...(pm2Error ? { pm2Error } : {}) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobs = await loadCronJobs();

  const job: CronJobRow = {
    id: crypto.randomUUID(),
    name: body.name ?? "untitled",
    schedule: body.schedule ?? "0 7 * * *",
    target_url: body.target_url ?? "",
    token_key: body.token_key ?? "PIPELINE_TOKEN",
    enabled: 1,
    gamemode_suspend: body.gamemode_suspend ?? 0,
    migrated_from: body.migrated_from ?? null,
    created_at: Math.floor(Date.now() / 1000),
  };

  jobs.push(job);
  await saveCronJobs(jobs);
  return NextResponse.json(job, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const jobs = await loadCronJobs();
  const idx = jobs.findIndex((j) => j.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.enabled !== undefined) jobs[idx].enabled = body.enabled;
  if (body.gamemode_suspend !== undefined) jobs[idx].gamemode_suspend = body.gamemode_suspend;

  await saveCronJobs(jobs);
  return NextResponse.json(jobs[idx]);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let jobs = await loadCronJobs();
  jobs = jobs.filter((j) => j.id !== id);
  await saveCronJobs(jobs);
  return NextResponse.json({ ok: true });
}
