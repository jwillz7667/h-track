import { NextResponse } from 'next/server';
import { getCached, getCachePath } from '@/lib/dataCache';

// Always fresh — supervisors poll this every few seconds.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// `cold` = process has never fetched upstream successfully → 503 so the
// supervisor will not yet route traffic / will restart.
// `stale` = last success > 1h ago → still 200 so the dashboard keeps streaming,
// but operators can spot a quiet failure.
// `ok`   = within the freshness budget.
const STALE_AFTER_SECONDS = 3600;

export async function GET() {
  const cached = await getCached();
  const now = Date.now();
  const ageSeconds = cached ? Math.floor((now - cached.storedAt) / 1000) : null;
  const status: 'ok' | 'stale' | 'cold' = !cached
    ? 'cold'
    : (ageSeconds ?? 0) > STALE_AFTER_SECONDS
      ? 'stale'
      : 'ok';
  const httpStatus = status === 'cold' ? 503 : 200;

  return NextResponse.json(
    {
      status,
      ageSeconds,
      lastSuccessAt: cached ? new Date(cached.storedAt).toISOString() : null,
      countries: cached?.data.countries.length ?? 0,
      historyPoints: cached?.data.countries[0]?.history.length ?? 0,
      cachePath: getCachePath(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
