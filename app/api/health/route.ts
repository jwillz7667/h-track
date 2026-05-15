import { NextResponse } from 'next/server';
import { getCached, setCached, getCachePath } from '@/lib/dataCache';
import { fetchDashboardData } from '@/lib/hantacount';

// Always fresh — supervisors poll this every few seconds.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// `cold` = process has never fetched upstream successfully. Returned with HTTP 200
//          (Railway/Docker deploy probes hit /api/health before any user has
//           visited /api/cases — failing here would block the rollout) and we
//           fire a warm-up fetch in the background so the cache fills within
//           a few seconds.
// `stale` = last success > 1h ago → still 200, dashboard keeps streaming on the
//           last-known-good payload, operators can spot a quiet failure via
//           the body's `state` field.
// `ok`    = within the freshness budget.
const STALE_AFTER_SECONDS = 3600;

let warmingPromise: Promise<void> | null = null;

function startWarmup(): void {
  if (warmingPromise) return;
  warmingPromise = (async () => {
    try {
      const data = await fetchDashboardData();
      await setCached(data);
      console.log(`[health] warmup ok countries=${data.countries.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[health] warmup failed err=${message}`);
    } finally {
      warmingPromise = null;
    }
  })();
}

export async function GET() {
  const cached = await getCached();
  const now = Date.now();
  const ageSeconds = cached ? Math.floor((now - cached.storedAt) / 1000) : null;
  const status: 'ok' | 'stale' | 'cold' = !cached
    ? 'cold'
    : (ageSeconds ?? 0) > STALE_AFTER_SECONDS
      ? 'stale'
      : 'ok';

  if (status === 'cold') startWarmup();

  return NextResponse.json(
    {
      status,
      ageSeconds,
      lastSuccessAt: cached ? new Date(cached.storedAt).toISOString() : null,
      countries: cached?.data.countries.length ?? 0,
      historyPoints: cached?.data.countries[0]?.history.length ?? 0,
      cachePath: getCachePath(),
      uptimeSeconds: Math.floor(process.uptime()),
      warming: warmingPromise !== null,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
