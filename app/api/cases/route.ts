import { NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/hantacount';
import { getCached, setCached } from '@/lib/dataCache';

// ISR for fresh fetches; on failure the handler bypasses cache via the catch
// branch and returns last-known-good with no-store so it isn't pinned in any
// edge layer.
export const revalidate = 300;

export async function GET() {
  const startedAt = Date.now();
  try {
    const data = await fetchDashboardData();
    await setCached(data);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cases] ok upstream=${elapsedMs}ms countries=${data.countries.length} news=${data.news.length}`,
    );
    return NextResponse.json(
      { ...data, stale: false, cachedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const elapsedMs = Date.now() - startedAt;
    const cached = await getCached();

    if (cached) {
      const ageSeconds = Math.floor((Date.now() - cached.storedAt) / 1000);
      console.warn(
        `[cases] upstream_failed err="${message}" upstream=${elapsedMs}ms serving_stale age=${ageSeconds}s`,
      );
      return NextResponse.json(
        {
          ...cached.data,
          stale: true,
          cachedAt: new Date(cached.storedAt).toISOString(),
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    console.error(
      `[cases] upstream_failed_cold err="${message}" upstream=${elapsedMs}ms no_cache_available`,
    );
    return NextResponse.json(
      { error: 'upstream_unavailable', message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
