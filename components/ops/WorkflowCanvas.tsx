"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  useReactFlow,
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
import styles from "./workflow-canvas.module.css";

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
  error: "#ef4444",
  continue: "#14b8a6",
  critical: "#f97316",
};

const EDGE_DURATIONS: Record<string, number> = {
  success: 18,
  continue: 24,
  critical: 42,
  error: 0,
};

function highlightMatch(label: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return label;
  const index = label.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return label;
  return (
    <>
      {label.slice(0, index)}
      <mark className={styles.searchMark}>{label.slice(index, index + trimmed.length)}</mark>
      {label.slice(index + trimmed.length)}
    </>
  );
}

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

function CanvasToolbar({
  isFullscreen,
  minimapOpacity,
  onAutoLayout,
  onFullscreenToggle,
  onMinimapOpacityChange,
}: {
  isFullscreen: boolean;
  minimapOpacity: number;
  onAutoLayout: () => void;
  onFullscreenToggle: () => void;
  onMinimapOpacityChange: (opacity: number) => void;
}) {
  const reactFlow = useReactFlow();

  return (
    <Panel position="bottom-left" className={styles.zoomPanel}>
      <button className={styles.iconButton} title="Zoom out" aria-label="Zoom out" onClick={() => reactFlow.zoomOut()}>
        -
      </button>
      <button className={styles.iconButton} title="Zoom in" aria-label="Zoom in" onClick={() => reactFlow.zoomIn()}>
        +
      </button>
      <button className={styles.iconButtonWide} title="Fit workflow" onClick={() => reactFlow.fitView({ padding: 0.18, duration: 240 })}>
        Fit
      </button>
      <button className={styles.iconButtonWide} title="Auto arrange nodes" onClick={onAutoLayout}>
        Layout
      </button>
      <button className={styles.iconButton} title={isFullscreen ? "Exit fullscreen" : "Expand canvas"} aria-label={isFullscreen ? "Exit fullscreen" : "Expand canvas"} onClick={onFullscreenToggle}>
        {isFullscreen ? "↙" : "↗"}
      </button>
      <label className={styles.minimapControl} title="Minimap transparency">
        <span>Map</span>
        <input
          type="range"
          min="0.25"
          max="1"
          step="0.05"
          value={minimapOpacity}
          onChange={(e) => onMinimapOpacityChange(Number(e.target.value))}
        />
      </label>
    </Panel>
  );
}

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [minimapOpacity, setMinimapOpacity] = useState(0.72);
  const [guide, setGuide] = useState<{ x?: number; y?: number } | null>(null);

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
      const durationMs = EDGE_DURATIONS[selectedEdgeType] ?? 20;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            label: `${edgeOpt?.label ?? selectedEdgeType} · ${durationMs}ms`,
            animated: selectedEdgeType !== "error",
            data: { edgeType: selectedEdgeType, durationMs },
            className: `${styles.edgeFlow} ${styles[`edgeFlow_${selectedEdgeType}` as keyof typeof styles] ?? ""}`,
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

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const edgeType = String((edge.data as { edgeType?: string } | undefined)?.edgeType ?? "").toLowerCase();
        const className = edgeType ? styles[`edgeFlow_${edgeType}` as keyof typeof styles] : "";
        return {
          ...edge,
          type: edge.type ?? "smoothstep",
          animated: edge.animated ?? edgeType !== "error",
          className: `${styles.edgeFlow} ${className} ${edge.className ?? ""}`,
          style: { strokeWidth: 2.4, ...(edge.style ?? {}) },
        };
      }),
    [edges]
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

  const handleAddHealthTemplate = useCallback(() => {
    const baseX = 220 + Math.random() * 120;
    const baseY = 140 + Math.random() * 80;
    const ids = {
      trigger: crypto.randomUUID(),
      request: crypto.randomUUID(),
      split: crypto.randomUUID(),
      ticket: crypto.randomUUID(),
    };
    setNodes((nds) => [
      ...nds,
      {
        id: ids.trigger,
        type: "schedule",
        position: { x: baseX, y: baseY },
        data: { cron: "*/5 * * * *", enabled: true },
      },
      {
        id: ids.request,
        type: "httpRequest",
        position: { x: baseX + 260, y: baseY },
        data: { method: "GET", url: "https://stats.frxncois.com/health" },
      },
      {
        id: ids.split,
        type: "split",
        position: { x: baseX + 520, y: baseY + 10 },
        data: { label: "ok / error" },
      },
      {
        id: ids.ticket,
        type: "createTicket",
        position: { x: baseX + 760, y: baseY + 86 },
        data: { title: "Health check failed", severity: "high", status: "failed" },
      },
    ]);
    setEdges((eds) => [
      ...eds,
      {
        id: `${ids.trigger}-${ids.request}`,
        source: ids.trigger,
        target: ids.request,
        type: "smoothstep",
        label: "On Continue · 24ms",
        animated: true,
        data: { edgeType: "continue", durationMs: 24 },
        style: { stroke: EDGE_COLORS.continue, strokeWidth: 2.4 },
      },
      {
        id: `${ids.request}-${ids.split}`,
        source: ids.request,
        target: ids.split,
        type: "smoothstep",
        label: "On Success · 18ms",
        animated: true,
        data: { edgeType: "success", durationMs: 18 },
        style: { stroke: EDGE_COLORS.success, strokeWidth: 2.4 },
      },
      {
        id: `${ids.split}-${ids.ticket}`,
        source: ids.split,
        sourceHandle: "b",
        target: ids.ticket,
        type: "smoothstep",
        label: "On Error · 0ms",
        animated: false,
        data: { edgeType: "error", durationMs: 0 },
        style: { stroke: EDGE_COLORS.error, strokeWidth: 2.4 },
      },
    ]);
  }, [setEdges, setNodes]);

  const handleAutoLayout = useCallback(() => {
    const typeRank: Record<string, number> = {
      schedule: 0,
      onDemand: 0,
      watchFile: 0,
      shellScript: 1,
      httpRequest: 1,
      sendEmail: 2,
      webhook: 2,
      split: 2,
      multiplex: 1,
      join: 3,
      createTicket: 3,
      maxRunTime: 4,
      maxLogSize: 4,
      maxMemory: 4,
      maxCpu: 4,
    };
    const columnCounts = new Map<number, number>();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === "groupContainer") return node;
        const column = typeRank[node.type ?? ""] ?? 2;
        const row = columnCounts.get(column) ?? 0;
        columnCounts.set(column, row + 1);
        return { ...node, position: { x: 120 + column * 250, y: 100 + row * 145 } };
      })
    );
  }, [setNodes]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.type === "groupContainer") return;
    const id = crypto.randomUUID();
    setNodes((nds) => [
      ...nds,
      {
        ...node,
        id,
        selected: true,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
      },
    ]);
    setSelectedNodeId(id);
  }, [nodes, selectedNodeId, setNodes]);

  const handleGroupSelected = useCallback(() => {
    const selected = nodes.filter((node) => selectedNodeIds.includes(node.id) && node.type !== "groupContainer");
    if (selected.length < 2) return;
    const minX = Math.min(...selected.map((node) => node.position.x));
    const minY = Math.min(...selected.map((node) => node.position.y));
    const maxX = Math.max(...selected.map((node) => node.position.x + 220));
    const maxY = Math.max(...selected.map((node) => node.position.y + 120));
    const id = crypto.randomUUID();
    setNodes((nds) => [
      {
        id,
        type: "groupContainer",
        position: { x: minX - 28, y: minY - 44 },
        data: { label: "Grouped sequence" },
        style: { width: maxX - minX + 56, height: maxY - minY + 76 },
        selectable: true,
        draggable: true,
        zIndex: -1,
      },
      ...nds,
    ]);
  }, [nodes, selectedNodeIds, setNodes]);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const filteredPalette = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase();
    if (!q) return NODE_PALETTE;
    return NODE_PALETTE
      .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)) }))
      .filter((group) => group.items.length > 0);
  }, [nodeSearch]);

  return (
    <div className={`${styles.canvasShell} ${isFullscreen ? styles.fullscreen : ""}`}>
      <div className={styles.groupGlow} />
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDrag={(_, node) => {
          const nearbyX = nodes.find((n) => n.id !== node.id && Math.abs(n.position.x - node.position.x) < 12)?.position.x;
          const nearbyY = nodes.find((n) => n.id !== node.id && Math.abs(n.position.y - node.position.y) < 12)?.position.y;
          setGuide(nearbyX || nearbyY ? { x: nearbyX, y: nearbyY } : null);
        }}
        onNodeDragStart={(event, node) => {
          if ("altKey" in event && event.altKey && node.type !== "groupContainer") {
            const id = crypto.randomUUID();
            setNodes((nds) => [
              ...nds,
              {
                ...node,
                id,
                selected: true,
                position: { x: node.position.x + 34, y: node.position.y + 34 },
              },
            ]);
            setSelectedNodeId(id);
          }
        }}
        onNodeDragStop={() => setGuide(null)}
        onSelectionChange={({ nodes: selected }) => setSelectedNodeIds(selected.map((node) => node.id))}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        snapToGrid
        snapGrid={[12, 12]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        panOnDrag={[1, 2]}
        style={{ background: "#0d0d0d" }}
        deleteKeyCode="Delete"
      >
        <Background variant={BackgroundVariant.Dots} color="#30323a" gap={20} />
        <MiniMap
          className={styles.minimap}
          style={{ opacity: minimapOpacity, background: "rgba(12,12,14,0.88)", border: "1px solid #333" }}
          nodeColor={(node) => (node.type === "createTicket" ? EDGE_COLORS.error : node.type === "split" ? EDGE_COLORS.critical : "#777")}
          maskColor="rgba(0,0,0,0.48)"
        />

        <Panel position="top-right">
          <div className={styles.edgeTypePanel}>
            <div style={{ fontSize: 9, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Edge type</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: EDGE_COLORS[selectedEdgeType] ?? "#555", flexShrink: 0, transition: "background 0.2s ease" }} />
              <select value={selectedEdgeType} onChange={(e) => setSelectedEdgeType(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 3, padding: "2px 4px", fontSize: 10, color: "#ccc", width: 120 }}>
                {EDGE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} style={{ background: "#1a1a1a", color: "#fff" }}>{opt.label}</option>)}
              </select>
            </div>
          </div>
        </Panel>

        <CanvasToolbar
          isFullscreen={isFullscreen}
          minimapOpacity={minimapOpacity}
          onAutoLayout={handleAutoLayout}
          onFullscreenToggle={() => setIsFullscreen((value) => !value)}
          onMinimapOpacityChange={setMinimapOpacity}
        />

        <Panel position="bottom-right">
          <button onClick={() => onSave(nodes, edges)} className={styles.stickySave}>
            SAVE
          </button>
        </Panel>
      </ReactFlow>
      <div className={styles.gridFade} />
      {guide?.x !== undefined && <div className={styles.alignGuideVertical} style={{ left: guide.x }} />}
      {guide?.y !== undefined && <div className={styles.alignGuideHorizontal} style={{ top: guide.y }} />}

      <div className={styles.nodePalette}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>Add Node</div>
        <input
          className={styles.nodeSearch}
          value={nodeSearch}
          onChange={(e) => setNodeSearch(e.target.value)}
          placeholder="Search nodes..."
          aria-label="Search nodes"
        />
        <button className={styles.templateButton} onClick={handleAddHealthTemplate} title="Add a preset health check workflow">
          Health check preset
        </button>
        {filteredPalette.map((group) => (
          <div key={group.group} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{group.group}</div>
            {group.items.map((item) => (
              <button
                key={item.type}
                onClick={() => handleAddNode(item.type)}
                title={NODE_TOOLTIPS[item.type]}
                className={styles.paletteItem}
                style={{ borderLeftColor: item.accent }}
              >
                <span className={styles.paletteIcon} style={{ background: item.accent }}>{item.label.slice(0, 1)}</span>
                <span>{highlightMatch(item.label, nodeSearch)}</span>
              </button>
            ))}
          </div>
        ))}
        {filteredPalette.length === 0 && <div className={styles.paletteEmpty}>No matching nodes</div>}
      </div>

      {selectedNode && (
        <div className={styles.contextToolbar}>
          <button onClick={handleDuplicateSelected}>Duplicate</button>
          <button onClick={handleGroupSelected} disabled={selectedNodeIds.length < 2}>Group</button>
          <button onClick={() => { setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId)); setSelectedNodeId(null); }}>
            Delete
          </button>
        </div>
      )}

      {selectedNode && (
        <div className={styles.nodeInspector}>
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
