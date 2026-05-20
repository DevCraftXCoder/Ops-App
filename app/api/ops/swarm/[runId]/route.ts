import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as blob from "@/lib/cf-blob";
import { verifyToken } from "@/lib/auth-token";


const RUNS_KEY = "ops/swarm-runs.json";

interface SwarmRun {
  id: string;
  defId: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  startedAt: number;
  endedAt?: number;
  logs: string[];
  error?: string;
}

async function isAuthed(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ops_session")?.value;
  const password = process.env.OPS_PASSWORD ?? "";
  if (!token || !password) return false;
  return verifyToken(token, password, "ops");
}

async function loadRuns(): Promise<SwarmRun[]> {
  const data = await blob.getJSON<SwarmRun[]>(RUNS_KEY);
  return data ?? [];
}

async function saveRuns(runs: SwarmRun[]): Promise<void> {
  await blob.put(RUNS_KEY, JSON.stringify(runs), { contentType: "application/json" });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const runs = await loadRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }

  return NextResponse.json({ run, logs: run.logs });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const body = await req.json() as { status?: string };

  if (body.status !== "cancelled") {
    return NextResponse.json({ error: "only_cancel_supported" }, { status: 400 });
  }

  const runs = await loadRuns();
  const idx = runs.findIndex((r) => r.id === runId);
  if (idx === -1) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }

  if (runs[idx].status !== "running" && runs[idx].status !== "queued") {
    return NextResponse.json({ error: "run_not_cancellable" }, { status: 409 });
  }

  runs[idx].status = "cancelled";
  runs[idx].endedAt = Date.now();
  runs[idx].logs.push(`[${new Date().toISOString()}] Cancelled via PATCH`);
  await saveRuns(runs);

  return NextResponse.json({ ok: true });
}
