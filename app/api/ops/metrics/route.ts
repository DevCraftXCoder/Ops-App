import { NextResponse } from "next/server";


export async function GET() {
  const services = [
    { name: "ops-app", url: null },
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
