// Last-known-good cache for DashboardData.
//
// Two layers:
//   1. process-singleton in-memory cache (survives across requests, lost on restart)
//   2. disk-backed mirror at HANTACOUNT_CACHE_PATH (survives container restarts when
//      the path is on a persistent volume; falls through to /tmp otherwise)
//
// The route handler MUST call setCached() on every successful upstream fetch
// and getCached() when upstream fails — that's what keeps the broadcast alive
// when hantacount.com has a hiccup.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DashboardData } from './hantacount';

export interface CachedEntry {
  data: DashboardData;
  storedAt: number;
}

const CACHE_PATH =
  process.env.HANTACOUNT_CACHE_PATH ?? path.join('/tmp', 'hantacount-cache.json');

let memoryCache: CachedEntry | null = null;
let loadPromise: Promise<void> | null = null;

async function loadFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed && typeof parsed.storedAt === 'number' && parsed.data) {
      memoryCache = parsed;
      console.log(
        `[cache] loaded from disk path=${CACHE_PATH} storedAt=${new Date(parsed.storedAt).toISOString()} countries=${parsed.data.countries.length}`,
      );
    }
  } catch (err) {
    // ENOENT is expected on first boot.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[cache] disk read failed path=${CACHE_PATH} err=${err.message}`);
    }
  }
}

async function ensureLoaded(): Promise<void> {
  if (memoryCache !== null) return;
  loadPromise ??= loadFromDisk();
  await loadPromise;
}

export async function getCached(): Promise<CachedEntry | null> {
  await ensureLoaded();
  return memoryCache;
}

export async function setCached(data: DashboardData): Promise<void> {
  const entry: CachedEntry = { data, storedAt: Date.now() };
  memoryCache = entry;
  try {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    // Write to a temp file then rename — atomic on POSIX, avoids torn reads
    // if a healthcheck fires while we're writing.
    const tmpPath = `${CACHE_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(entry), 'utf8');
    await fs.rename(tmpPath, CACHE_PATH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[cache] disk persist failed path=${CACHE_PATH} err=${message}`);
  }
}

export function getCachePath(): string {
  return CACHE_PATH;
}
