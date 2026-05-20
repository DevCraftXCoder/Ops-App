import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth-token";


// ── Auth ──────────────────────────────────────────────────────────────────────

async function isAuthed(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ops_session")?.value;
  const password = process.env.OPS_PASSWORD ?? "";
  if (!token || !password) return false;
  return verifyToken(token, password, "ops");
}

// ── GET /api/ops/mode-state ───────────────────────────────────────────────────
// Proxies to stats-server GET /api/pm2/mode-state
// Response: { mode: string, changedAt: number, suspended_crons: string[] }

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pm2Url = process.env.PM2_STATS_URL;
  const secret = process.env.STATS_SECRET ?? "";

  if (!pm2Url) {
    return NextResponse.json({ error: "PM2_STATS_URL not configured" }, { status: 500 });
  }

  try {
    const upstream = await fetch(`${pm2Url}/api/pm2/mode-state`, {
      headers: { "x-stats-secret": secret },
      signal: AbortSignal.timeout(5000),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream_error";
    return NextResponse.json({ error: "upstream_error", message }, { status: 502 });
  }
}

// ── PATCH /api/ops/mode-state ─────────────────────────────────────────────────
// Proxies to stats-server PATCH /api/pm2/mode-state
// Body: { suspended_crons?: string[] } | { add: string } | { remove: string }
// Response: { ok: true, suspended_crons: string[] }

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pm2Url = process.env.PM2_STATS_URL;
  const secret = process.env.STATS_SECRET ?? "";

  if (!pm2Url) {
    return NextResponse.json({ error: "PM2_STATS_URL not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${pm2Url}/api/pm2/mode-state`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-stats-secret": secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream_error";
    return NextResponse.json({ error: "upstream_error", message }, { status: 502 });
  }
}
