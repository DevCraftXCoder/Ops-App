import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as blob from "@/lib/cf-blob";
import { verifyToken } from "@/lib/auth-token";
import { getCloudflareContext } from "@opennextjs/cloudflare";


const DEFS_KEY = "ops/swarm-defs.json";
const RUNS_KEY = "ops/swarm-runs.json";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwarmDef {
  id: string;
  name: string;
  task: string;
  agents: string[];
  parallelism: "sequential" | "parallel" | "fan-out";
  model: "sonnet" | "opus";
  createdAt: number;
  updatedAt: number;
}

interface SwarmRun {
  id: string;
  defId: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  startedAt: number;
  endedAt?: number;
  logs: string[];
  error?: string;
}

// ── Approved agent list (static — from .claude/rules/agent-selection.md) ─────

const APPROVED_AGENTS = [
  "implementation-expert",
  "ops-expert",
  "project-reviewer",
  "planner",
  "research-lead",
  "adversarial-reviewer",
  "co-songwriter",
  "youtube-ideas",
  "frontend-expert",
  "sso-expert",
  "analytics-reporter",
  "qa-agent",
  "master-auditor",
  "dfe-existence",
  "dfe-security",
  "dfe-logic",
  "dfe-runtime",
  "dfe-artifacts",
  "mobile-ui-expert",
  "ui-design-expert",
  "underground-feature-expert",
  "d1-migration-expert",
  "ev-betta-ops",
  "stripe-expert",
  "pm2-health-expert",
  "swarm-orchestrator",
  "architecture-drift",
  "deployment-verifier",
  "migration-safety-auditor",
  "api-contract-enforcer",
  "cost-intelligence",
  "anti-abuse-engineer",
] as const;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function isAuthed(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ops_session")?.value;
  const password = process.env.OPS_PASSWORD ?? "";
  if (!token || !password) return false;
  return verifyToken(token, password, "ops");
}

// ── Blob helpers ──────────────────────────────────────────────────────────────

async function loadDefs(): Promise<SwarmDef[]> {
  const data = await blob.getJSON<SwarmDef[]>(DEFS_KEY);
  return data ?? [];
}

async function saveDefs(defs: SwarmDef[]): Promise<void> {
  await blob.put(DEFS_KEY, JSON.stringify(defs), { contentType: "application/json" });
}

async function loadRuns(): Promise<SwarmRun[]> {
  const data = await blob.getJSON<SwarmRun[]>(RUNS_KEY);
  return data ?? [];
}

async function saveRuns(runs: SwarmRun[]): Promise<void> {
  await blob.put(RUNS_KEY, JSON.stringify(runs), { contentType: "application/json" });
}

// ── Swarm execution (runs async via ctx.waitUntil) ────────────────────────────

async function executeSwarm(run: SwarmRun, def: SwarmDef): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  // Update status to running
  const runs = await loadRuns();
  const idx = runs.findIndex((r) => r.id === run.id);
  if (idx === -1) return;
  runs[idx].status = "running";
  runs[idx].logs.push(`[${new Date().toISOString()}] Swarm started: ${def.name}`);
  runs[idx].logs.push(`[${new Date().toISOString()}] Parallelism: ${def.parallelism} | Model: ${def.model}`);
  runs[idx].logs.push(`[${new Date().toISOString()}] Agents: ${def.agents.join(", ")}`);
  await saveRuns(runs);

  if (!openrouterKey) {
    const failRuns = await loadRuns();
    const fi = failRuns.findIndex((r) => r.id === run.id);
    if (fi !== -1) {
      failRuns[fi].status = "failed";
      failRuns[fi].error = "OPENROUTER_API_KEY not configured";
      failRuns[fi].endedAt = Date.now();
      failRuns[fi].logs.push(`[${new Date().toISOString()}] ERROR: OPENROUTER_API_KEY not set`);
      await saveRuns(failRuns);
    }
    return;
  }

  const modelId =
    def.model === "opus"
      ? "anthropic/claude-opus-4-7"
      : "anthropic/claude-sonnet-4-6";

  try {
    if (def.parallelism === "sequential") {
      // Run agents one by one, passing prior output as context
      let context = "";
      for (const agentName of def.agents) {
        const logRuns = await loadRuns();
        const li = logRuns.findIndex((r) => r.id === run.id);
        if (li !== -1 && logRuns[li].status === "cancelled") return;

        const prompt = context
          ? `You are the ${agentName} agent. Prior agent output:\n${context}\n\nYour task: ${def.task}`
          : `You are the ${agentName} agent. Your task: ${def.task}`;

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openrouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ops-app.frxncois.workers.dev",
            "X-Title": "Frxncois Ops Swarm",
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const currentRuns = await loadRuns();
        const ci = currentRuns.findIndex((r) => r.id === run.id);
        if (ci === -1) return;

        if (!res.ok) {
          currentRuns[ci].logs.push(
            `[${new Date().toISOString()}] Agent ${agentName}: HTTP ${res.status}`
          );
          await saveRuns(currentRuns);
          continue;
        }

        const data = await res.json() as { choices: Array<{ message: { content: string } }> };
        const text = data.choices?.[0]?.message?.content ?? "";
        context = text;

        currentRuns[ci].logs.push(
          `[${new Date().toISOString()}] Agent ${agentName} completed (${text.length} chars)`
        );
        currentRuns[ci].logs.push(`--- ${agentName} output ---`);
        currentRuns[ci].logs.push(text.slice(0, 500) + (text.length > 500 ? "…" : ""));
        await saveRuns(currentRuns);
      }
    } else {
      // parallel or fan-out: run all agents concurrently
      const results = await Promise.allSettled(
        def.agents.map(async (agentName) => {
          const prompt = `You are the ${agentName} agent. Your task: ${def.task}`;
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://ops-app.frxncois.workers.dev",
              "X-Title": "Frxncois Ops Swarm",
            },
            body: JSON.stringify({
              model: modelId,
              max_tokens: 1024,
              messages: [{ role: "user", content: prompt }],
            }),
          });
          if (!res.ok) return { agentName, text: `HTTP ${res.status}`, ok: false };
          const data = await res.json() as { choices: Array<{ message: { content: string } }> };
          const text = data.choices?.[0]?.message?.content ?? "";
          return { agentName, text, ok: true };
        })
      );

      const finalRuns = await loadRuns();
      const fi = finalRuns.findIndex((r) => r.id === run.id);
      if (fi === -1) return;

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { agentName, text, ok } = result.value;
          finalRuns[fi].logs.push(
            `[${new Date().toISOString()}] Agent ${agentName}: ${ok ? "done" : "failed"} (${text.length} chars)`
          );
          if (ok) {
            finalRuns[fi].logs.push(`--- ${agentName} output ---`);
            finalRuns[fi].logs.push(text.slice(0, 500) + (text.length > 500 ? "…" : ""));
          } else {
            finalRuns[fi].logs.push(`ERROR: ${text}`);
          }
        } else {
          finalRuns[fi].logs.push(
            `[${new Date().toISOString()}] Agent error: ${result.reason}`
          );
        }
      }
      await saveRuns(finalRuns);
    }

    // Mark done
    const doneRuns = await loadRuns();
    const di = doneRuns.findIndex((r) => r.id === run.id);
    if (di !== -1 && doneRuns[di].status !== "cancelled") {
      doneRuns[di].status = "done";
      doneRuns[di].endedAt = Date.now();
      doneRuns[di].logs.push(`[${new Date().toISOString()}] Swarm completed successfully`);
      await saveRuns(doneRuns);
    }
  } catch (err) {
    const errRuns = await loadRuns();
    const ei = errRuns.findIndex((r) => r.id === run.id);
    if (ei !== -1) {
      errRuns[ei].status = "failed";
      errRuns[ei].error = String(err);
      errRuns[ei].endedAt = Date.now();
      errRuns[ei].logs.push(`[${new Date().toISOString()}] ERROR: ${String(err)}`);
      await saveRuns(errRuns);
    }
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [swarms, runs] = await Promise.all([loadDefs(), loadRuns()]);
  return NextResponse.json({ swarms, runs });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    action: "create_def" | "launch" | "cancel";
    name?: string;
    task?: string;
    agents?: string[];
    parallelism?: SwarmDef["parallelism"];
    model?: SwarmDef["model"];
    defId?: string;
    runId?: string;
  };

  const { action } = body;

  if (action === "create_def") {
    const { name, task, agents, parallelism, model } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }
    if (!task?.trim()) {
      return NextResponse.json({ error: "task_required" }, { status: 400 });
    }
    const agentList = (agents ?? []).filter((a) =>
      APPROVED_AGENTS.includes(a as (typeof APPROVED_AGENTS)[number])
    );

    const now = Date.now();
    const def: SwarmDef = {
      id: crypto.randomUUID(),
      name: name.trim(),
      task: task.trim(),
      agents: agentList,
      parallelism: parallelism ?? "sequential",
      model: model ?? "sonnet",
      createdAt: now,
      updatedAt: now,
    };

    const defs = await loadDefs();
    defs.unshift(def);
    await saveDefs(defs);
    return NextResponse.json(def, { status: 201 });
  }

  if (action === "launch") {
    const { defId } = body;
    if (!defId) {
      return NextResponse.json({ error: "defId_required" }, { status: 400 });
    }

    const [defs, runs] = await Promise.all([loadDefs(), loadRuns()]);
    const def = defs.find((d) => d.id === defId);
    if (!def) {
      return NextResponse.json({ error: "def_not_found" }, { status: 404 });
    }

    // Serialize: reject if any run is currently running (v1 constraint)
    const activeRun = runs.find((r) => r.status === "running" || r.status === "queued");
    if (activeRun) {
      return NextResponse.json(
        { error: "swarm_busy", message: "Another run is active. Wait for it to finish." },
        { status: 409 }
      );
    }

    const run: SwarmRun = {
      id: crypto.randomUUID(),
      defId,
      status: "queued",
      startedAt: Date.now(),
      logs: [`[${new Date().toISOString()}] Run queued for: ${def.name}`],
    };

    runs.unshift(run);
    await saveRuns(runs);

    // Use ctx.waitUntil to run async after response is sent
    const { ctx } = await getCloudflareContext();
    ctx.waitUntil(executeSwarm(run, def));

    return NextResponse.json({ runId: run.id }, { status: 202 });
  }

  if (action === "cancel") {
    const { runId } = body;
    if (!runId) {
      return NextResponse.json({ error: "runId_required" }, { status: 400 });
    }

    const runs = await loadRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    if (runs[idx].status !== "running" && runs[idx].status !== "queued") {
      return NextResponse.json({ error: "run_not_cancellable" }, { status: 409 });
    }

    runs[idx].status = "cancelled";
    runs[idx].endedAt = Date.now();
    runs[idx].logs.push(`[${new Date().toISOString()}] Cancelled by user`);
    await saveRuns(runs);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
