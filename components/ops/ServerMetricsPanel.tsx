"use client";

import React, { useEffect, useRef, useState } from "react";
import { useThrottledIntervalMs } from "@/hooks/useWindowFocused";

interface ServiceInfo {
  name: string;
  status: "ok" | "error";
  latencyMs: number;
}

interface MetricsData {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; free: number; usedPct: number };
  uptime: number;
  platform: string;
  services: ServiceInfo[];
  timestamp: number;
}

interface ServerMetricsPanelProps {
  onMetricsUpdate?: (metrics: MetricsData) => void;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function BarStat({
  label,
  value,
  max,
  color,
  display,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  display: string;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "#ccc" }}>{display}</span>
      </div>
      <div style={{ height: 4, background: "#2a2a2a", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

export function ServerMetricsPanel({ onMetricsUpdate }: ServerMetricsPanelProps) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const onMetricsUpdateRef = useRef(onMetricsUpdate);
  useEffect(() => { onMetricsUpdateRef.current = onMetricsUpdate; }, [onMetricsUpdate]);
  const pollMs = useThrottledIntervalMs(5000, 30_000);

  // Re-render every 30s so the "last updated" label stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/ops/metrics");
        if (!res.ok) throw new Error(`${res.status}`);
        const data: MetricsData = await res.json();
        setMetrics(data);
        setError(null);
        onMetricsUpdateRef.current?.(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    }
    fetchMetrics();
    const id = setInterval(fetchMetrics, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return (
    <div style={{ padding: "0 0 8px" }}>
      {/* Services */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>
        Services
      </div>
      {error && (
        <div style={{ fontSize: 10, color: "#dc2828", marginBottom: 6 }}>
          Error: {error}
        </div>
      )}
      {(!metrics || metrics.services.length === 0) && !error && (
        <div style={{ fontSize: 10, color: "#555", marginBottom: 6 }}>Loading...</div>
      )}
      {metrics?.services.map((svc) => (
        <div
          key={svc.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            fontSize: 10,
            color: "#ccc",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: svc.status === "ok" ? "#22c55e" : "#dc2828",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {svc.name}
          </span>
          <span style={{ color: "#555", fontSize: 9 }}>
            {svc.latencyMs < 0 ? "No response" : svc.latencyMs === 0 ? "< 1ms" : `${svc.latencyMs}ms`}
          </span>
        </div>
      ))}

      {/* Divider */}
      <div style={{ borderTop: "1px solid #222", margin: "8px 0" }} />

      {/* CPU & Memory */}
      {metrics && (
        metrics.cpu.usage === -1 ? (
          <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
            CPU / memory N/A — edge runtime
          </div>
        ) : (
        <>
          <BarStat
            label={`CPU (${metrics.cpu.cores} cores)`}
            value={metrics.cpu.usage}
            max={100}
            color={metrics.cpu.usage > 80 ? "#dc2828" : metrics.cpu.usage > 60 ? "#f59e0b" : "#3b82f6"}
            display={`${metrics.cpu.usage}%`}
          />
          <BarStat
            label="Memory"
            value={metrics.memory.usedPct}
            max={100}
            color={metrics.memory.usedPct > 85 ? "#dc2828" : metrics.memory.usedPct > 70 ? "#f59e0b" : "#22c55e"}
            display={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
          />
          <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>
            Uptime: <span style={{ color: "#888" }}>{formatUptime(metrics.uptime)}</span>
            {" · "}
            <span>{metrics.platform}</span>
          </div>
        </>
        )
      )}
      {/* Last updated timestamp */}
      {metrics && (
        <div style={{ fontSize: 9, color: "#444", marginTop: 8, borderTop: "1px solid #1e1e1e", paddingTop: 6 }}>
          {(() => {
            const elapsedSec = Math.round((Date.now() - metrics.timestamp) / 1000);
            const label = elapsedSec >= 60
              ? `${Math.floor(elapsedSec / 60)}m ago`
              : `${elapsedSec}s ago`;
            return <>Last updated: <span style={{ color: "#555" }}>{label}</span></>;
          })()}
        </div>
      )}
    </div>
  );
}
