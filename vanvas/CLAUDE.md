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

Canvas state is stored as a JSON string in `canvases.state`: `{"objects": [...]}`. Each object has a `type` (line/dashed/arrow/arc-arrow/rect/diamond/circle/ellipse), geometry, and style properties (stroke, fill, roughness, fillStyle). The `commands` and `tasks` tables are designed for the planned AI task-generate workflow but are not yet wired into the API.

### Rendering

- **Rough.js** (`roughjs` package) renders all canvas objects with a hand-drawn aesthetic.
- The canvas is an HTML `<canvas>` element; Rough.js draws onto it imperatively.
- Gallery previews and the modal use inline SVG (`<svg>` + `<path>`, `<rect>`, etc.) to render the same objects without Rough.js — fill styles use SVG `<pattern>` definitions for hachure/cross-hatch/dots.

### ASR (Automatic Speech Recognition)

Located in `modules/asr/`. A dual-channel architecture:

1. **Fast channel (Web Speech API)** — `providers/webspeech.ts`: browser-native speech recognition for real-time streaming. Used via `IStreamingProvider` interface.
2. **Slow channel (GLM-ASR)** — `providers/glm-asr.ts`: sends recorded audio blob to `/api/asr` which proxies to ZhiPu (智谱) GLM-ASR-2512 API. Used via `IBatchProvider` interface. Converts browser audio to 16kHz mono WAV before sending.
3. **`use-asr.ts`** — React hook orchestrating both channels. Records via `MediaRecorder`, runs Web Speech concurrently, then after stopping fires the batch channel asynchronously. If the batch result differs, it silently replaces the text and sets `wasCorrected = true`.
4. **`/api/asr/route.ts`** — server-side proxy to ZhiPu API (requires `ZHIPU_API_KEY` env var). Validates WAV headers before forwarding.

### Page Structure (App Router)

| Route | Purpose |
|---|---|
| `/` | Homepage with feature grid and CTA |
| `/paint` | New blank canvas |
| `/paint/[id]` | Edit existing canvas (fetches state from API) |
| `/my` | Gallery of saved canvases (fetches from GET /api/canvas) |

### Key Components

- **`RoughCanvas`** — the core drawing component. Manages pointer events, drawing state, tool selection, zoom, undo, and redraw via Rough.js. Receives `objects` array and `onObjectsChange` callback as controlled props.
- **`PaintPageClient`** — orchestrates canvas + save dialog + chat panel. Owns the `objects` state, save logic (POST/PUT to `/api/canvas`).
- **`ChatPanel`** — collapsible side panel with text chat + voice input button. Uses `useASR` hook. Sends messages to `/api/chat` (currently a stub).
- **`Sidebar`** — collapsible left nav with links to Home, My, Paint.
- **`CanvasCard`** / **`CanvasModal`** — gallery card with SVG thumbnail preview and modal with SVG export.

### Chat API Status

`/api/chat` is a **stub** — it echoes the user's message with a hardcoded reply. The AI drawing orchestration (`docs/task-generate.md`) is fully designed but not yet implemented.

## Environment Variables

```
ZHIPU_API_KEY=...   # Required for GLM-ASR voice recognition
```

Set in `.env.local` (gitignored). Without it, ASR falls back to browser Web Speech API only.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Drawing**: Rough.js 4
- **Logging**: Pino (server-side)
- **Package manager**: npm
