import { NextRequest, NextResponse } from "next/server";
import * as blob from "@/lib/cf-blob";

export const runtime = "edge";

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
  return NextResponse.json({ pm2Jobs: [], cfJobs });
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
