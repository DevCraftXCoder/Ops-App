"use client";

import React, { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  Node,
  Edge,
  Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_TYPES, NODE_PALETTE, EDGE_TYPE_OPTIONS } from "./nodes";
import { theme } from "@/lib/theme";

const NODE_TOOLTIPS: Record<string, string> = {
  schedule: "Trigger workflow on a cron schedule",
  onDemand: "Trigger workflow manually",
  httpRequest: "Make an HTTP GET/POST/PUT/DELETE request",
  multiplex: "Fan out to multiple branches in parallel",
  join: "Wait for all parallel branches to complete",
  split: "Route to different branches based on success/error",
  webhook: "Send an HTTP webhook notification",
  createTicket: "Create an ops incident ticket",
  maxRunTime: "Set maximum allowed run time in seconds",
  shellScript: "Execute a shell script command",
  sendEmail: "Send an email notification",
  watchFile: "Watch a file for changes",
};

const EDGE_COLORS: Record<string, string> = {
  success: "#22c55e",
  error: "#dc2828",
  continue: "#14b8a6",
  critical: "#f97316",
};

function InspField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color: "#666", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

const INSP_INPUT: React.CSSProperties = {
  width: "100%",
  background: "#111",
  border: "1px solid #333",
  borderRadius: 3,
  padding: "3px 6px",
  fontSize: 10,
  color: "#ccc",
  outline: "none",
  boxSizing: "border-box",
};

const INSP_SELECT: React.CSSProperties = { ...INSP_INPUT, background: "#1a1a1a" };

function NodeInspectorFields({ node, onChange }: { node: Node; onChange: (key: string, value: unknown) => void }) {
  const d = node.data as Record<string, unknown>;
  const type = node.type ?? "";

  if (type === "httpRequest") {
    return (
      <>
        <InspField label="Method">
          <select value={String(d.method ?? "GET")} onChange={(e) => onChange("method", e.target.value)} style={INSP_SELECT}>
            {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m} style={{ background: "#1a1a1a", color: "#fff" }}>{m}</option>)}
          </select>
        </InspField>
        <InspField label="URL">
          <input style={INSP_INPUT} type="text" defaultValue={String(d.url ?? "")} placeholder="https://..." onBlur={(e) => onChange("url", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </InspField>
      </>
    );
  }

  if (type === "schedule") {
    return (
      <>
        <InspField label="Cron">
          <input style={INSP_INPUT} type="text" defaultValue={String(d.cron ?? "")} placeholder="0 * * * *" onBlur={(e) => onChange("cron", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </InspField>
        <InspField label="Enabled">
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={!!d.enabled} onChange={(e) => onChange("enabled", e.target.checked)} />
            <span style={{ fontSize: 10, color: "#aaa" }}>Active</span>
          </label>
        </InspField>
      </>
    );
  }

  if (type === "onDemand") {
    return (
      <InspField label="Label">
        <input style={INSP_INPUT} type="text" defaultValue={String(d.label ?? "")} placeholder="Run manually" onBlur={(e) => onChange("label", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </InspField>
    );
  }

  if (type === "multiplex") {
    return (
      <InspField label="Stagger (ms)">
        <input style={INSP_INPUT} type="number" defaultValue={String(d.staggerMs ?? 0)} placeholder="0" onBlur={(e) => onChange("staggerMs", Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </InspField>
    );
  }

  if (type === "maxRunTime") {
    return (
      <InspField label="Max Run Time (sec)">
        <input style={INSP_INPUT} type="number" defaultValue={String(d.maxRunTime ?? "")} placeholder="60" onBlur={(e) => onChange("maxRunTime", Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </InspField>
    );
  }

  if (type === "webhook") {
    return (
      <InspField label="URL">
        <input style={INSP_INPUT} type="text" defaultValue={String(d.url ?? "")} placeholder="https://hooks.slack.com/..." onBlur={(e) => onChange("url", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </InspField>
    );
  }

  if (type === "createTicket") {
    return (
      <>
        <InspField label="Title">
          <input style={INSP_INPUT} type="text" defaultValue={String(d.title ?? "")} placeholder="Issue title" onBlur={(e) => onChange("title", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </InspField>
        <InspField label="Severity">
          <select value={String(d.severity ?? "medium")} onChange={(e) => onChange("severity", e.target.value)} style={INSP_SELECT}>
            {["low", "medium", "high", "critical"].map((s) => <option key={s} style={{ background: "#1a1a1a", color: "#fff" }}>{s}</option>)}
          </select>
        </InspField>
      </>
    );
  }

  const { onChange: _omit, ...safeData } = d;
  return (
    <InspField label="Data (JSON)">
      <textarea defaultValue={JSON.stringify(safeData, null, 2)} readOnly rows={5} style={{ ...INSP_INPUT, fontFamily: "monospace", resize: "vertical", lineHeight: 1.4, opacity: 0.7 }} />
    </InspField>
  );
}

interface WorkflowData {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowCanvasProps {
  workflow: WorkflowData | null;
  onSave: (nodes: Node[], edges: Edge[]) => void;
  onRegisterSave?: (saveFn: () => void) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function WorkflowCanvas({ workflow, onSave, onRegisterSave, onDirtyChange }: WorkflowCanvasProps) {
  const initialNodes: Node[] = workflow?.nodes ?? [];
  const initialEdges: Edge[] = workflow?.edges ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedEdgeType, setSelectedEdgeType] = useState<string>("success");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const savedSnapshotRef = React.useRef<string>(JSON.stringify({ nodes: initialNodes, edges: initialEdges }));

  React.useEffect(() => {
    const fresh = workflow?.nodes ?? [];
    const freshEdges = workflow?.edges ?? [];
    setNodes(fresh);
    setEdges(freshEdges);
    savedSnapshotRef.current = JSON.stringify({ nodes: fresh, edges: freshEdges });
    onDirtyChange?.(false);
  }, [workflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const current = JSON.stringify({ nodes, edges });
    const dirty = current !== savedSnapshotRef.current;
    onDirtyChange?.(dirty);
  }, [nodes, edges, onDirtyChange]);

  React.useEffect(() => {
    if (onRegisterSave) {
      onRegisterSave(() => onSave(nodes, edges));
    }
  }, [onRegisterSave, onSave, nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeOpt = EDGE_TYPE_OPTIONS.find((e) => e.value === selectedEdgeType);
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "default",
            label: edgeOpt?.label ?? selectedEdgeType,
            style: { stroke: edgeOpt?.stroke ?? "#555", strokeWidth: 2 },
            labelStyle: { fill: "#ccc", fontSize: 10 },
            labelBgStyle: { fill: theme.bgHover },
          },
          eds
        )
      );
    },
    [selectedEdgeType, setEdges]
  );

  function handleAddNode(type: string) {
    const x = 200 + Math.random() * 400;
    const y = 100 + Math.random() * 300;
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type,
      position: { x, y },
      data: {
        onChange: (key: string, value: unknown) => {
          setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n)));
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        style={{ background: "#0d0d0d" }}
        deleteKeyCode="Delete"
      >
        <Background variant={BackgroundVariant.Dots} color="#333" gap={20} />
        <MiniMap style={{ background: theme.bgHover, border: "1px solid #333" }} nodeColor="#555" maskColor="rgba(0,0,0,0.6)" />
        <Controls style={{ background: theme.bgHover, border: "1px solid #333", borderRadius: 6 }} />

        <Panel position="top-right">
          <div style={{ background: theme.bgHover, border: "1px solid #333", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "#ccc" }}>
            <div style={{ fontSize: 9, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Edge type</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: EDGE_COLORS[selectedEdgeType] ?? "#555", flexShrink: 0, transition: "background 0.2s ease" }} />
              <select value={selectedEdgeType} onChange={(e) => setSelectedEdgeType(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, color: "#ccc", width: 120 }}>
                {EDGE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} style={{ background: "#1a1a1a", color: "#fff" }}>{opt.label}</option>)}
              </select>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right">
          <button onClick={() => onSave(nodes, edges)} style={{ background: theme.success, color: "#000", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
            SAVE
          </button>
        </Panel>
      </ReactFlow>

      <div style={{ position: "absolute", top: 8, left: 8, background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "8px", width: 160, maxHeight: "60%", overflowY: "auto", zIndex: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>Add Node</div>
        {NODE_PALETTE.map((group) => (
          <div key={group.group} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{group.group}</div>
            {group.items.map((item) => (
              <button
                key={item.type}
                onClick={() => handleAddNode(item.type)}
                title={NODE_TOOLTIPS[item.type]}
                style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderLeft: `2px solid ${item.accent}`, padding: "3px 6px", marginBottom: 2, fontSize: 10, color: "#aaa", cursor: "pointer", borderRadius: "0 3px 3px 0" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#222"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {selectedNode && (
        <div style={{ position: "absolute", top: 8, right: 8, background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "10px", width: 220, zIndex: 10, fontSize: 11, color: "#ccc", maxHeight: "80%", overflowY: "auto" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>Node Inspector</div>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Type: <span style={{ color: "#ccc" }}>{selectedNode.type}</span></div>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>ID: <span style={{ color: "#555", fontFamily: "monospace", fontSize: 9 }}>{selectedNode.id.slice(0, 8)}...</span></div>
          <NodeInspectorFields
            node={selectedNode}
            onChange={(key, value) => {
              setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, [key]: value } } : n)));
            }}
          />
          <button
            onClick={() => { setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId)); setSelectedNodeId(null); }}
            style={{ background: "rgba(220,40,40,0.15)", border: "1px solid rgba(220,40,40,0.3)", borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#dc2828", cursor: "pointer", width: "100%", marginTop: 8 }}
          >
            Delete Node
          </button>
        </div>
      )}
    </div>
  );
}
