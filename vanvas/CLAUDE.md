# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoxCanvas (vanvas) is a lightweight, hand-drawn-style drawing application built with Next.js 16 App Router. It supports freehand drawing, shapes, SVG export, and voice input via a dual-channel ASR system. The long-term vision (documented in `docs/task-generate.md`) is AI-driven drawing where users describe what they want in natural language and the system generates structured task plans.

## Commands

```bash
npm run dev       # Start dev server (Turbopack, port 3000)
npm run build     # Production build
npm run start     # Start production server
```

No test suite or linter is configured yet.

## Architecture

### Data Layer (3-tier)

```
API Routes (app/api/*)
  → Services (services/*)          — business logic, DTO conversion
    → Data Access (data-access/*)  — raw DB queries via Drizzle
      → SQLite (data/vanvas.db)    — WAL mode, auto-migrates on first connect
```

- **`lib/db/index.ts`** — singleton DB connection; runs `CREATE TABLE IF NOT EXISTS` migrations inline (no migration tool used at runtime despite drizzle-kit being installed).
- **`lib/db/schema.ts`** — Drizzle ORM schema definitions for `canvases`, `commands`, `tasks` tables.
- **`data-access/canvas.dao.ts`** — raw CRUD against the `canvases` table using Drizzle.
- **`services/canvas.service.ts`** — thin service layer; maps DAO records to DTOs.

### Canvas Data Model

Canvas state is stored as a JSON string in `canvases.state`: `{"objects": [...]}`. Each object has a `type` (line/dashed/arrow/arc-arrow/rect/diamond/circle/ellipse/text), geometry, and style properties. Shared type definitions are in `lib/types/draw-object.ts`. See `docs/shapes.md` for how each shape is rendered.

### Rendering

- **Rough.js** renders geometric shapes (rect/diamond/circle/ellipse) via its built-in APIs. Lines/arrows/dashed/arc-arrow use `rc.line()` with custom geometry calculations. **Text** uses Canvas native `ctx.fillText()` — Rough.js does not support text. See `docs/shapes.md` for details.
- Gallery previews and the modal use inline SVG (`<svg>` + `<path>`, `<rect>`, etc.) — fill styles use SVG `<pattern>` definitions for hachure/cross-hatch/dots.

### ASR (Automatic Speech Recognition)

Located in `modules/asr/`. **Single-channel GLM-ASR** (Web Speech fast channel removed due to network issues):

1. **`use-asr.ts`** — React hook: records via `MediaRecorder` → sends audio blob to GLM batch provider → returns text. Statuses: idle → listening → processing → idle.
2. **`providers/glm-asr.ts`** — Client-side: converts browser audio (webm) to 16kHz mono WAV, POSTs to `/api/asr`.
3. **`/api/asr/route.ts`** — Server-side proxy to ZhiPu GLM-ASR-2512 (requires `ZHIPU_API_KEY`).

### Page Structure (App Router)

| Route | Purpose |
|---|---|
| `/` | Homepage with feature grid and CTA |
| `/paint` | New blank canvas |
| `/paint/[id]` | Edit existing canvas (fetches state from API) |
| `/my` | Gallery of saved canvases (fetches from GET /api/canvas) |

### Key Components

- **`RoughCanvas`** — core drawing. Pointer events, drawing state, tool selection (pen/line/dashed/arrow/arc-arrow/rect/diamond/circle/ellipse/text), zoom, undo. Receives `objects` and `onObjectsChange`.
- **`PaintPageClient`** — orchestrates canvas + save dialog + chat panel. Routes AI commands to `/api/canvas/[id]/command` when canvasId is available.
- **`ChatPanel`** — collapsible side panel with text chat + voice input (GLM-ASR). Routes messages to command API for AI drawing, falls back to `/api/chat` stub when no canvasId.
- **`Sidebar`** — collapsible left nav.
- **`CanvasCard`** / **`CanvasModal`** — gallery with SVG thumbnail + SVG export.

### AI Drawing Pipeline

Fully implemented (see `docs/ai.md` for design, `docs/shapes.md` for rendering):

```
ChatPanel → POST /api/canvas/[id]/command { message }
  → loadSession (DB)
  → taskGenerate (LLM #1: intent → TaskPlan DAG)
  → runOrchestrator (toposort → serial layers)
    → createHandler / modifyHandler / deleteHandler / connectHandler
      → sub-workflow (LLM #2: style refinement, only when needed)
      → DrawObject assembled
  → persist (commands + tasks tables)
  → return { response, objects[] }
→ frontend: setObjects() → RoughCanvas full redraw
```

Key files:
- `lib/llm/` — OpenAI-compatible provider (env: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_NAME)
- `lib/workflow/task-generate.ts` — Layer 1 LLM: intent → task DAG
- `lib/workflow/sub-workflows/` — Layer 2 LLM: style refinement
- `lib/orchestrator/orchestrator.ts` — DAG execution engine
- `lib/handlers/` — 4 handlers (CREATE/MODIFY/DELETE/CONNECT)
- `app/api/canvas/[id]/command/route.ts` — API entry point

## Environment Variables

Set in `.env.local` (gitignored). See `.env.example` for template.

```bash
ZHIPU_API_KEY=...     # Required for GLM-ASR voice recognition
LLM_API_KEY=...        # Required for AI drawing (LLM provider)
LLM_BASE_URL=...       # Required — OpenAI-compatible endpoint
LLM_MODEL_NAME=...     # Required — model name (e.g. glm-4-flash)
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Drawing**: Rough.js 4
- **Logging**: Pino (server-side)
- **Package manager**: npm
