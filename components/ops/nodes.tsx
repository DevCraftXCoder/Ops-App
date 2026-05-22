"use client";

import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";

// ── Accent colors ──────────────────────────────────────────────────────────────
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const TEAL   = "#14b8a6";
const ORANGE = "#f97316";
const RED    = "#dc2828";
const PURPLE = "#a855f7";
const GREY   = "#6b7280";

// ── BaseNode ───────────────────────────────────────────────────────────────────
function BaseNode({
  accent,
  label,
  children,
  hasTarget = true,
  hasSource = true,
}: {
  accent: string;
  label: string;
  children?: React.ReactNode;
  hasTarget?: boolean;
  hasSource?: boolean;
}) {
  const healthColor = label.toLowerCase().includes("ticket") ? RED : label.toLowerCase().includes("watch") ? AMBER : GREEN;
  return (
    <div
      className={`workflow-node-shell ${label.toLowerCase().includes("ticket") ? "workflow-node-error" : ""}`}
      style={{
        background: "linear-gradient(135deg, rgba(32,32,34,0.92), rgba(18,18,20,0.86))",
        border: "1px solid rgba(255,255,255,0.13)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 160,
        maxWidth: 220,
        fontSize: 11,
        color: "#ccc",
        boxShadow: "0 16px 34px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.04)",
        position: "relative",
        backdropFilter: "blur(10px)",
      }}
    >
      <span
        title="Node health"
        style={{
          position: "absolute",
          top: 7,
          right: 8,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: healthColor,
          boxShadow: `0 0 12px ${healthColor}`,
        }}
      />
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: "#555", border: "1px solid #777", width: 8, height: 8 }}
        />
      )}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: accent,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: "#555", border: "1px solid #777", width: 8, height: 8 }}
        />
      )}
    </div>
  );
}

// ── Field helper ───────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 9, color: "#666", marginBottom: 2 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#111",
          border: "1px solid #333",
          borderRadius: 3,
          padding: "2px 4px",
          fontSize: 10,
          color: "#ccc",
          outline: "none",
          boxSizing: "border-box",
        }}
        className="nodrag"
      />
    </div>
  );
}

// ── Trigger nodes ──────────────────────────────────────────────────────────────
function ScheduleNode({ data }: NodeProps) {
  const d = data as { cron?: string; enabled?: boolean; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={BLUE} label="Schedule Trigger" hasTarget={false}>
      <Field label="Cron" value={d.cron ?? ""} onChange={(v) => d.onChange?.("cron", v)} placeholder="0 * * * *" />
      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} className="nodrag">
        <input type="checkbox" checked={!!d.enabled} onChange={(e) => d.onChange?.("enabled", e.target.checked)} className="nodrag" />
        <span style={{ fontSize: 10 }}>Enabled</span>
      </label>
    </BaseNode>
  );
}

function OnDemandNode({ data }: NodeProps) {
  const d = data as { label?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={GREEN} label="On Demand" hasTarget={false}>
      <Field label="Label" value={d.label ?? ""} onChange={(v) => d.onChange?.("label", v)} placeholder="Run manually" />
    </BaseNode>
  );
}

function WatchFileNode({ data }: NodeProps) {
  const d = data as { filePath?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={AMBER} label="Watch File" hasTarget={false}>
      <Field label="File Path" value={d.filePath ?? ""} onChange={(v) => d.onChange?.("filePath", v)} placeholder="/path/to/file" />
    </BaseNode>
  );
}

// ── Action nodes ───────────────────────────────────────────────────────────────
function ShellScriptNode({ data }: NodeProps) {
  const d = data as { script?: string };
  const preview = (d.script ?? "").split("\n")[0] || "(empty)";
  return (
    <BaseNode accent={TEAL} label="Shell Script">
      <div style={{ fontSize: 9, color: "#666", marginBottom: 4 }}>Script preview:</div>
      <div style={{ background: "#111", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, fontFamily: "monospace", color: TEAL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {preview}
      </div>
      <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>(not available in serverless)</div>
    </BaseNode>
  );
}

function HttpRequestNode({ data }: NodeProps) {
  const d = data as { method?: string; url?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={BLUE} label="HTTP Request">
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <select
          value={d.method ?? "GET"}
          onChange={(e) => d.onChange?.("method", e.target.value)}
          className="nodrag"
          style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, color: "#ccc", width: 60 }}
        >
          {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
            <option key={m} style={{ background: "#1a1a1a", color: "#fff" }}>{m}</option>
          ))}
        </select>
        <input
          type="text"
          value={d.url ?? ""}
          onChange={(e) => d.onChange?.("url", e.target.value)}
          placeholder="https://..."
          className="nodrag"
          style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, color: "#ccc", outline: "none", minWidth: 0 }}
        />
      </div>
    </BaseNode>
  );
}

function SendEmailNode({ data }: NodeProps) {
  const d = data as { to?: string; subject?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={GREEN} label="Send Email">
      <Field label="To" value={d.to ?? ""} onChange={(v) => d.onChange?.("to", v)} placeholder="user@example.com" />
      <Field label="Subject" value={d.subject ?? ""} onChange={(v) => d.onChange?.("subject", v)} placeholder="Subject" />
    </BaseNode>
  );
}

function WebhookNode({ data }: NodeProps) {
  const d = data as { url?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={PURPLE} label="Webhook">
      <Field label="URL (Discord/Slack)" value={d.url ?? ""} onChange={(v) => d.onChange?.("url", v)} placeholder="https://hooks.slack.com/..." />
    </BaseNode>
  );
}

function CreateTicketNode({ data }: NodeProps) {
  const d = data as { title?: string; severity?: string; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={RED} label="Create Ticket">
      <Field label="Title" value={d.title ?? ""} onChange={(v) => d.onChange?.("title", v)} placeholder="Issue title" />
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 9, color: "#666", marginBottom: 2 }}>Severity</div>
        <select
          value={d.severity ?? "medium"}
          onChange={(e) => d.onChange?.("severity", e.target.value)}
          className="nodrag"
          style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, color: "#ccc" }}
        >
          {["low", "medium", "high", "critical"].map((s) => <option key={s} style={{ background: "#1a1a1a", color: "#fff" }}>{s}</option>)}
        </select>
      </div>
    </BaseNode>
  );
}

// ── Flow control nodes ─────────────────────────────────────────────────────────
function SplitNode({ data }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="workflow-node-shell" style={{ background: "linear-gradient(135deg, rgba(45,30,18,0.92), rgba(20,18,16,0.88))", border: "1px solid rgba(249,115,22,0.34)", borderLeft: `3px solid ${ORANGE}`, borderRadius: 6, padding: "8px 10px", minWidth: 176, fontSize: 11, color: "#ccc", position: "relative", boxShadow: "0 16px 34px rgba(0,0,0,0.44), 0 0 24px rgba(249,115,22,0.12)" }}>
      <Handle type="target" position={Position.Top} style={{ background: "#555", border: "1px solid #777", width: 8, height: 8 }} />
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ORANGE, marginBottom: 4 }}>Split</div>
      <div style={{ fontSize: 10, color: "#888" }}>{d.label ?? "Branch A / B"}</div>
      <Handle id="a" type="source" position={Position.Bottom} style={{ left: "30%", background: "#555", border: "1px solid #777", width: 8, height: 8 }} />
      <Handle id="b" type="source" position={Position.Bottom} style={{ left: "70%", background: "#555", border: "1px solid #777", width: 8, height: 8 }} />
    </div>
  );
}

function GroupContainerNode({ data }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="workflow-group-container">
      <span>{d.label ?? "Group"}</span>
    </div>
  );
}

function MultiplexNode({ data }: NodeProps) {
  const d = data as { staggerMs?: number; onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={PURPLE} label="Multiplex">
      <Field label="Stagger (ms)" value={String(d.staggerMs ?? 0)} onChange={(v) => d.onChange?.("staggerMs", Number(v))} type="number" placeholder="0" />
    </BaseNode>
  );
}

function JoinNode() {
  return (
    <BaseNode accent={TEAL} label="Join">
      <div style={{ fontSize: 10, color: "#888" }}>Wait for parallel branches</div>
    </BaseNode>
  );
}

// ── Limit nodes ────────────────────────────────────────────────────────────────
function LimitNode({ label, fieldKey, placeholder, data }: { label: string; fieldKey: string; placeholder: string; data: NodeProps["data"] }) {
  const d = data as Record<string, unknown> & { onChange?: (k: string, v: unknown) => void };
  return (
    <BaseNode accent={GREY} label={label}>
      <Field label="Value" value={String(d[fieldKey] ?? "")} onChange={(v) => d.onChange?.(fieldKey, Number(v))} type="number" placeholder={placeholder} />
    </BaseNode>
  );
}

function MaxRunTimeNode({ data }: NodeProps) { return <LimitNode label="Max Run Time" fieldKey="maxRunTime" placeholder="60 (sec)" data={data} />; }
function MaxLogSizeNode({ data }: NodeProps) { return <LimitNode label="Max Log Size" fieldKey="maxLogSize" placeholder="1024 (KB)" data={data} />; }
function MaxMemoryNode({ data }: NodeProps) { return <LimitNode label="Max Memory" fieldKey="maxMemory" placeholder="512 (MB)" data={data} />; }
function MaxCpuNode({ data }: NodeProps) { return <LimitNode label="Max CPU" fieldKey="maxCpu" placeholder="80 (%)" data={data} />; }

// ── Exports ────────────────────────────────────────────────────────────────────
export const NODE_TYPES = {
  schedule: ScheduleNode,
  onDemand: OnDemandNode,
  watchFile: WatchFileNode,
  shellScript: ShellScriptNode,
  httpRequest: HttpRequestNode,
  sendEmail: SendEmailNode,
  webhook: WebhookNode,
  createTicket: CreateTicketNode,
  split: SplitNode,
  multiplex: MultiplexNode,
  join: JoinNode,
  maxRunTime: MaxRunTimeNode,
  maxLogSize: MaxLogSizeNode,
  maxMemory: MaxMemoryNode,
  maxCpu: MaxCpuNode,
  groupContainer: GroupContainerNode,
} as const;

export const NODE_PALETTE = [
  { group: "Triggers", items: [
    { type: "schedule", label: "Schedule", accent: BLUE },
    { type: "onDemand", label: "On Demand", accent: GREEN },
    { type: "watchFile", label: "Watch File", accent: AMBER },
  ] },
  { group: "Actions", items: [
    { type: "shellScript", label: "Shell Script", accent: TEAL },
    { type: "httpRequest", label: "HTTP Request", accent: BLUE },
    { type: "sendEmail", label: "Send Email", accent: GREEN },
    { type: "webhook", label: "Webhook", accent: PURPLE },
    { type: "createTicket", label: "Create Ticket", accent: RED },
  ] },
  { group: "Flow Control", items: [
    { type: "split", label: "Split", accent: ORANGE },
    { type: "multiplex", label: "Multiplex", accent: PURPLE },
    { type: "join", label: "Join", accent: TEAL },
  ] },
  { group: "Limits", items: [
    { type: "maxRunTime", label: "Max Run Time", accent: GREY },
    { type: "maxLogSize", label: "Max Log Size", accent: GREY },
    { type: "maxMemory", label: "Max Memory", accent: GREY },
    { type: "maxCpu", label: "Max CPU", accent: GREY },
  ] },
];

export const EDGE_TYPE_OPTIONS = [
  { value: "success", label: "On Success", stroke: GREEN },
  { value: "error", label: "On Error", stroke: RED },
  { value: "continue", label: "On Continue", stroke: TEAL },
  { value: "critical", label: "On Critical", stroke: ORANGE },
] as const;
