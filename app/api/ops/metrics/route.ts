import { NextResponse } from "next/server";

// PM2_STATS_URL must be the CF Tunnel URL (https://stats.frxncois.com) so it is
// reachable from the CF Workers edge.  localhost:9003 does not exist there.
const STATS_SERVER_URL =
  process.env.PM2_STATS_URL ?? "https://stats.frxncois.com";

export async function GET() {
  const services: Array<{ name: string; url: string | null }> = [
    { name: "ops-app", url: null },
    { name: "stats-server", url: `${STATS_SERVER_URL}/health` },
  ];

  const serviceResults = await Promise.all(
    services.map(async (svc) => {
      if (!svc.url) {
        return { name: svc.name, status: "ok" as const, latencyMs: 0 };
      }
      const start = Date.now();
      try {
        const res = await fetch(svc.url, { signal: AbortSignal.timeout(5000) });
        return {
          name: svc.name,
          status: (res.ok ? "ok" : "error") as "ok" | "error",
          latencyMs: Date.now() - start,
        };
      } catch {
        return { name: svc.name, status: "error" as const, latencyMs: -1 };
      }
    })
  );

  return NextResponse.json({
    cpu: { usage: -1, cores: 0 },
    memory: { used: 0, total: 0, free: 0, usedPct: 0 },
    uptime: 0,
    platform: "edge",
    services: serviceResults,
    timestamp: Date.now(),
  });
}
