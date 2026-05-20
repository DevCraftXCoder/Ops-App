import { NextRequest, NextResponse } from "next/server";
import * as blob from "@/lib/cf-blob";

export const runtime = "edge";

const TICKETS_KEY = "ops/tickets.json";

interface OpsTicket {
  id: string;
  title: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved";
  createdAt: string;
  updatedAt: string;
  logs: string;
  snapshot: Record<string, unknown>;
  linkedWorkflowId?: string;
  linkedRunId?: string;
  notes: string;
}

async function loadTickets(): Promise<OpsTicket[]> {
  const data = await blob.getJSON<OpsTicket[]>(TICKETS_KEY);
  return data ?? [];
}

async function saveTickets(tickets: OpsTicket[]): Promise<void> {
  await blob.put(TICKETS_KEY, JSON.stringify(tickets), {
    contentType: "application/json",
  });
}

export async function GET() {
  const tickets = await loadTickets();
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tickets = await loadTickets();

  const ticket: OpsTicket = {
    id: crypto.randomUUID(),
    title: body.title ?? "Untitled",
    service: body.service ?? "unknown",
    severity: body.severity ?? "medium",
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: body.logs ?? "",
    snapshot: body.snapshot ?? {},
    notes: "",
  };

  tickets.unshift(ticket);
  await saveTickets(tickets);
  return NextResponse.json(ticket, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const tickets = await loadTickets();
  const idx = tickets.findIndex((t) => t.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.status) tickets[idx].status = body.status;
  if (body.notes !== undefined) tickets[idx].notes = body.notes;
  tickets[idx].updatedAt = new Date().toISOString();

  await saveTickets(tickets);
  return NextResponse.json(tickets[idx]);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let tickets = await loadTickets();
  tickets = tickets.filter((t) => t.id !== id);
  await saveTickets(tickets);
  return NextResponse.json({ ok: true });
}
