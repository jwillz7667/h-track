# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hantavirus Tracker — an ESPN-style Next.js 15 / React 19 dashboard that visualises the live global MV Hondius / Andes virus outbreak. Designed for **24/7 broadcast capture** (YouTube livestream via OBS browser source), wired to real upstream data from hantacount.com (CC-BY-4.0).

## Commands

- `npm run dev` — Next.js dev server
- `npm run build` — production build (`output: 'standalone'` for container deploy)
- `npm start` — run the built app
- `npm run lint` — `eslint .` (manual; `next.config.ts` sets `eslint.ignoreDuringBuilds: true`)
- `npm run clean` — `next clean`
- `npx tsc --noEmit` — typecheck (no test framework configured)

Install requires `npm install --legacy-peer-deps` because `react-simple-maps@3` declares a peer of `react ≤18` but the project ships React 19. Removing the flag breaks install.

## Environment

- `HANTACOUNT_CACHE_PATH` — disk path for the last-known-good cache JSON. Defaults to `/tmp/hantacount-cache.json`. Mount this on a persistent volume in Railway/Fly so cache survives container restarts.
- `GEMINI_API_KEY` / `APP_URL` — listed in `.env.example`; auto-injected by AI Studio at runtime. Not consumed in source today.
- `DISABLE_HMR=true` — fully disables webpack file watching (set by AI Studio to prevent flicker during agent edits). Guard in `next.config.ts`; do not remove.

## Architecture

The dashboard is a single-page client that polls one server route. There is no database in-repo; all state comes from the public **hantacount.com** dataset (CC-BY-4.0).

### Data path

```
hantacount.com /api/cases (index)          ┐
hantacount.com /api/cases/<date> × N       ┘─▶ lib/hantacount.ts (aggregate)
                                               │
                                               ▼
                       ┌─── lib/dataCache.ts (disk-backed last-known-good)
                       │           ▲
                       ▼           │ setCached on success
                  app/api/cases/route.ts (ISR 5 min)
                                ▼ getCached on failure
                       app/api/health/route.ts (supervisor probe)
                                ▼
                       app/page.tsx (polls every 120s, drift-corrected)
```

- `lib/hantacount.ts` — upstream types, `fetchDashboardData()`, and the pure `aggregate(snapshots)` function. The aggregator reconstructs per-country `history` by walking every snapshot, computes per-country `trend` by diffing the latest snapshot against the previous, and synthesises the news feed from `timeline[]` (badged "WHO") plus each country's `note` field (badged with its ISO-2 code).
- `lib/dataCache.ts` — process-singleton in-memory cache + atomic disk mirror at `HANTACOUNT_CACHE_PATH`. On first request the disk cache is loaded into memory; on every successful upstream fetch the new payload is written via `tmp + rename` (avoids torn reads). **Critical for 24/7 broadcast**: this is what keeps the stream alive when hantacount.com has an outage.
- `app/api/cases/route.ts` — Route Handler. Fan-out fetches every snapshot detail in parallel with `next.revalidate = 300`. On upstream success: stores result via `setCached` and returns `{ ..., stale: false, cachedAt }`. On failure: serves last-known-good with `stale: true`, falling back to `503` only on cold-start failure (no cache yet).
- `app/api/health/route.ts` — `force-dynamic`, returns `{ status: 'ok' | 'stale' | 'cold', ageSeconds, lastSuccessAt, countries, uptimeSeconds }`. `cold` → 503 (supervisor restart). `stale` (>1h old) → 200 (still serving but operator-visible). Wired to the Docker `HEALTHCHECK` and Railway `healthcheckPath`.
- `app/error.tsx` + `app/global-error.tsx` — error boundaries with 8-second auto-reset. One unhandled exception from recharts / react-simple-maps / motion must not black out OBS.
- `app/page.tsx` — `'use client'`. Three `useEffect`s:
  1. Wall clock + 15s view rotation (`viewTick`).
  2. **Drift-corrected polling loop** for `/api/cases` — absolute next-deadline math, NOT `setInterval` (which accumulates drift over 24h).
  3. Broadcast-flag detection (`?broadcast=1` query → bumps font scale for 1080p H.264 capture).
  Renders a **stale pill** in the header when `data.stale === true`; never shows a full-screen error wall when we have any cached data. CC-BY-4.0 attribution footer is **required** — do not remove.
- `app/layout.tsx` — root layout, Inter + Oswald fonts via CSS variables.

### Center-panel view rotation (15s each, 45s full cycle)

`viewTick % 3` selects: `0` = world map, `1` = trajectory chart, `2` = country spotlight. Spotlight rotates through the top-6 countries by total cases via `floor(viewTick / 3) % spotlightPool.length`, so each gets ~45s of airtime per full sub-cycle.

### Key shape notes

- Upstream gives ISO-2 country codes (`"NL"`, `"ES"`) with separate `lat`/`lng` fields; the aggregator emits `coordinates: [lng, lat]` because that's what `react-simple-maps` `<Marker>` expects.
- Upstream has no "active cases" concept — the aggregator approximates with `cases - deaths` for the metric box.
- `NewsUpdate.timestamp` is an **ISO string**, not a `Date`, because the data crosses an HTTP boundary. The page parses it with `parseISO` from `date-fns` before formatting.
- `DashboardData.stale` and `cachedAt` are optional and set **only by the route handler**, never by the aggregator.

### Map / chart libraries

`recharts` drives the area chart; `react-simple-maps` + `<ComposableMap>` renders the world map with markers loaded from the jsdelivr `world-atlas` topojson. `motion` powers count-up animations on metric tiles via `useSpring` + `useTransform`. `motion` must stay in `transpilePackages` in `next.config.ts`. The `<WorldMap>` component is `React.memo`'d on `lastUpdated` because re-rendering ~170 country geographies + markers is expensive at 60fps and the underlying data only changes every 5 min.

## Deployment

- `Dockerfile` — multi-stage build on `node:22-alpine`, runs as non-root `nextjs` user, uses Next.js standalone output. Built-in `HEALTHCHECK` calls `/api/health` via node's global `fetch` (no curl/wget install).
- `railway.json` — points Railway at the Dockerfile with `/api/health` probe and `ON_FAILURE` restart policy. Mount a volume at `/data` so the cache persists across container restarts.
- `.github/workflows/ci.yml` — typecheck + build on every push/PR.
- `.github/workflows/deploy.yml` — Railway deploy on push to `main`. Skips cleanly when `RAILWAY_TOKEN` secret is not set.

## Conventions specific to this repo

- Path alias `@/*` → repo root (see `tsconfig.json`).
- Tailwind v4 via `@tailwindcss/postcss`; global styles in `app/globals.css`.
- Remote images allowed only from `picsum.photos` (see `next.config.ts`).
- `output: 'standalone'` — build target is a containerised server.
- ESPN red is `#CC0000` throughout; keep on-brand when adding UI.
- Use the drift-corrected pattern (chained `setTimeout` with absolute `nextDeadline`) for any new long-running polling loops — `setInterval` accumulates drift over a 24/7 stream.
