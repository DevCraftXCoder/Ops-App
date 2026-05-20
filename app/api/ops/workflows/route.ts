import { NextRequest, NextResponse } from "next/server";
import * as blob from "@/lib/cf-blob";

export const runtime = "edge";

const WORKFLOWS_KEY = "ops/workflows.json";

interface WorkflowData {
  id: string;
  name: string;
  nodes: unknown[];
  edges: unknown[];
}

async function loadWorkflows(): Promise<WorkflowData[]> {
  const data = await blob.getJSON<WorkflowData[]>(WORKFLOWS_KEY);
  return data ?? [];
}

async function saveWorkflows(wfs: WorkflowData[]): Promise<void> {
  await blob.put(WORKFLOWS_KEY, JSON.stringify(wfs), {
    contentType: "application/json",
  });
}

export async function GET() {
  const workflows = await loadWorkflows();
  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workflows = await loadWorkflows();

  const wf: WorkflowData = {
    id: crypto.randomUUID(),
    name: body.name ?? "Untitled",
    nodes: [],
    edges: [],
  };

  workflows.push(wf);
  await saveWorkflows(workflows);
  return NextResponse.json(wf, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const workflows = await loadWorkflows();
  const idx = workflows.findIndex((w) => w.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.nodes) workflows[idx].nodes = body.nodes;
  if (body.edges) workflows[idx].edges = body.edges;
  if (body.name) workflows[idx].name = body.name;

  await saveWorkflows(workflows);
  return NextResponse.json(workflows[idx]);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let workflows = await loadWorkflows();
  workflows = workflows.filter((w) => w.id !== id);
  await saveWorkflows(workflows);
  return NextResponse.json({ ok: true });
}
