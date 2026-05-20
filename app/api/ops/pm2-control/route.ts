import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth-token";

export const runtime = "edge";

// ── Auth ──────────────────────────────────────────────────────────────────────

async function isAuthed(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ops_session")?.value;
  const password = process.env.OPS_PASSWORD ?? "";
  if (!token || !password) return false;
  return verifyToken(token, password, "ops");
}

// ── POST /api/ops/pm2-control ─────────────────────────────────────────────────
// Proxies to stats-server POST /api/pm2/control
// Body: { action: "start" | "stop" | "restart", name: string }

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pm2Url = process.env.PM2_STATS_URL;
  const secret = process.env.STATS_SECRET ?? "";

  if (!pm2Url) {
    return NextResponse.json({ error: "PM2_STATS_URL not configured" }, { status: 500 });
  }

  let body: { action?: string; name?: string };
  try {
    body = await req.json() as { action?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { action, name } = body;

  if (!action || !["start", "stop", "restart"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${pm2Url}/api/pm2/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stats-secret": secret,
      },
      body: JSON.stringify({ action, name: name.trim() }),
      signal: AbortSignal.timeout(12000), // pm2 start can be slow
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream_error";
    return NextResponse.json({ error: "upstream_error", message }, { status: 502 });
  }
}
