import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const pm2Url = process.env.PM2_STATS_URL;
  if (!pm2Url) {
    return NextResponse.json({ processes: [], ts: Date.now() });
  }

  try {
    const res = await fetch(`${pm2Url}/api/pm2-stats`, {
      signal: AbortSignal.timeout(5000),
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ processes: [], ts: Date.now() });
  }
}
