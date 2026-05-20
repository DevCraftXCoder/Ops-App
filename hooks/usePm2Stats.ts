"use client";
import { useState, useEffect } from "react";

export interface Pm2Process {
  name: string;
  memMb: number;
  cpuPct: number;
  restarts: number;
  status: string;
  uptimeMs: number;
}

export interface Pm2Stats {
  processes: Pm2Process[];
  ts: number;
  totalMemMb: number;
  topConsumer: string;
}

export function usePm2Stats(intervalMs = 15_000): Pm2Stats | null {
  const [data, setData] = useState<Pm2Stats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/pm2-stats", {
          headers: { "x-requested-with": "XMLHttpRequest" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          processes?: Pm2Process[];
          ts?: number;
        };
        const processes: Pm2Process[] = json.processes ?? [];
        const sorted = [...processes].sort((a, b) => b.memMb - a.memMb);
        setData({
          processes: sorted,
          ts: json.ts ?? Date.now(),
          totalMemMb: processes.reduce((s, p) => s + p.memMb, 0),
          topConsumer: sorted[0]?.name ?? "—",
        });
      } catch {
        // silently swallow -- stats are non-critical
      }
    };

    fetchStats();
    const id = setInterval(fetchStats, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return data;
}
