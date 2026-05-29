# Ops App

Workflow automation, monitoring, alerting & ticketing dashboard.

## Features

- **Dashboard** — Real-time server metrics, service health, CPU/memory bars, PM2 process stats
- **Alerts** — Auto-generated alerts from metrics thresholds (CPU > 80%, memory > 85%, service down), one-click ticket creation
- **Tickets** — Incident tracking with severity levels, status workflow (open → investigating → resolved), notes, system snapshots
- **Workflows** — Visual drag-and-drop workflow builder powered by React Flow — schedule triggers, HTTP requests, webhooks, fan-out/join, shell scripts, email, limits
- **Cron Manager** — PM2 ↔ CF Workers cron migration panel with eligibility classification, gamemode suspend toggles, inline job creation

## Stack

- **Next.js 15** (App Router, Turbopack)
- **React 19** + **@xyflow/react** (workflow canvas)
- **Cloudflare Workers** deployment via `@opennextjs/cloudflare`
- **R2** blob storage for persistent state (tickets, workflows, cron jobs)
- **Web Crypto** for HMAC session tokens

## Setup

```bash
cp env.example.txt .env.local   # fill in secrets
pnpm install
pnpm dev                         # http://localhost:3000
```

## Deploy

```bash
pnpm run deploy   # builds via opennextjs-cloudflare + wrangler deploy
```

## Design

Dark theme (`#0a0a0a` background), purple accent (`#a855f7`), Syne headings, DM Sans body, JetBrains Mono code.

## Recent Additions (Last 30 Days)

- Ops workflow UI refinements — streamlined alert and ticket creation
- OpenRouter LLM backend (replaces direct Anthropic API) — multi-provider model selection
- @opennextjs/cloudflare 1.19 compatibility fixes + open-next config
- PM2 control panel with direct process management and gamemode suspend toggles
