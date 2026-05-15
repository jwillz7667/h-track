// Client + aggregator for the public hantacount.com dataset.
//
// Upstream contract:
//   GET https://hantacount.com/api/cases        → SnapshotIndex (list of daily snapshots)
//   GET https://hantacount.com/api/cases/<date> → Snapshot (countries + timeline + summary)
// Data is CC-BY-4.0; surface attribution in the UI.

export interface UpstreamSnapshotMeta {
  date: string;
  url: string;
  csvUrl: string;
  cases: number;
  deaths: number;
  countries: number;
  contactsTraced: number;
}

export interface UpstreamSnapshotIndex {
  snapshots: UpstreamSnapshotMeta[];
  count: number;
  latest: string;
  latestCsv: string;
  license: string;
  attribution: string;
}

export interface UpstreamSummary {
  totalCases: number;
  deaths: number;
  countries: number;
  contactsTraced: number;
  critical: number;
  cfr: number;
}

export interface UpstreamCountry {
  code: string;
  name: string;
  cases: number;
  deaths: number;
  lat: number;
  lng: number;
  lastEvent: string;
  source: string;
  sourceUrl?: string;
  note?: string;
}

export interface UpstreamTimelineEvent {
  date: string;
  event: string;
  severity: 'info' | 'warning' | 'alert';
}

export interface UpstreamWhoOfficial {
  totalCases: number;
  deaths: number;
  cfr: number;
  lastDon?: string;
  lastDonDate?: string;
  url?: string;
  note?: string;
}

export interface UpstreamSnapshot {
  date: string;
  lastUpdated: string;
  summary: UpstreamSummary;
  previousSummary?: UpstreamSummary;
  previousReportAt?: string;
  whoOfficial?: UpstreamWhoOfficial;
  countries: UpstreamCountry[];
  timeline: UpstreamTimelineEvent[];
}

// Public types served by /api/cases (this app's own route handler).

export type Trend = 'up' | 'down' | 'flat';

export interface HistoryPoint {
  date: string;
  cases: number;
}

export interface CountryCaseData {
  country: string;
  code: string;
  totalCases: number;
  activeCases: number;
  deaths: number;
  trend: Trend;
  history: HistoryPoint[];
  coordinates: [number, number];
  lastEvent: string;
  source: string;
  sourceUrl?: string;
  note?: string;
}

export interface NewsUpdate {
  id: string;
  // ISO-8601 string — JSON-safe across the wire; parse with date-fns on the client.
  timestamp: string;
  country: string;
  message: string;
  isBreaking: boolean;
}

export interface DashboardSummary {
  totalCases: number;
  activeCases: number;
  deaths: number;
  cfr: number;
  countriesAffected: number;
  contactsTraced: number;
  critical: number;
}

export interface DashboardAttribution {
  source: string;
  license: string;
  whoDon?: string;
  whoDonDate?: string;
  whoDonUrl?: string;
}

export interface DashboardData {
  countries: CountryCaseData[];
  news: NewsUpdate[];
  summary: DashboardSummary;
  lastUpdated: string;
  attribution: DashboardAttribution;
  // Set by the route handler, not the aggregator. `stale` = served from
  // last-known-good cache because upstream failed; `cachedAt` is when the
  // payload was last persisted server-side.
  stale?: boolean;
  cachedAt?: string;
}

const UPSTREAM_BASE = 'https://hantacount.com';

// Match the upstream 10-min cache. Next.js will collapse concurrent requests.
const UPSTREAM_REVALIDATE_SECONDS = 300;

export async function fetchDashboardData(): Promise<DashboardData> {
  const indexRes = await fetch(`${UPSTREAM_BASE}/api/cases`, {
    next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
    headers: { Accept: 'application/json' },
  });
  if (!indexRes.ok) {
    throw new Error(`hantacount index ${indexRes.status} ${indexRes.statusText}`);
  }
  const index = (await indexRes.json()) as UpstreamSnapshotIndex;

  if (!Array.isArray(index.snapshots) || index.snapshots.length === 0) {
    throw new Error('hantacount index returned no snapshots');
  }

  const snapshots = await Promise.all(
    index.snapshots.map(async (meta) => {
      const url = meta.url.startsWith('http') ? meta.url : `${UPSTREAM_BASE}${meta.url}`;
      const res = await fetch(url, {
        next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`hantacount snapshot ${meta.date} ${res.status}`);
      }
      return (await res.json()) as UpstreamSnapshot;
    }),
  );

  return aggregate(snapshots, index);
}

// Pure transformation from upstream snapshots → dashboard shape. Exported so
// it can be unit-tested without a network.
export function aggregate(
  snapshots: UpstreamSnapshot[],
  index?: UpstreamSnapshotIndex,
): DashboardData {
  if (snapshots.length === 0) {
    throw new Error('aggregate(): at least one snapshot required');
  }

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const countries: CountryCaseData[] = latest.countries.map((c) => {
    const prev = previous?.countries.find((p) => p.code === c.code);
    const trend: Trend = !prev
      ? c.cases > 0
        ? 'up'
        : 'flat'
      : c.cases > prev.cases
        ? 'up'
        : c.cases < prev.cases
          ? 'down'
          : 'flat';

    const history: HistoryPoint[] = sorted.map((s) => {
      const point = s.countries.find((sc) => sc.code === c.code);
      return { date: s.date, cases: point?.cases ?? 0 };
    });

    return {
      country: c.name,
      code: c.code,
      totalCases: c.cases,
      // Upstream doesn't separate "active" — best proxy is cases minus deaths.
      activeCases: Math.max(0, c.cases - c.deaths),
      deaths: c.deaths,
      trend,
      history,
      // react-simple-maps Marker expects [lng, lat], upstream uses lat/lng fields.
      coordinates: [c.lng, c.lat],
      lastEvent: c.lastEvent,
      source: c.source,
      sourceUrl: c.sourceUrl,
      note: c.note,
    };
  });

  const news = buildNewsFeed(latest);

  return {
    countries,
    news,
    summary: {
      totalCases: latest.summary.totalCases,
      activeCases: countries.reduce((acc, c) => acc + c.activeCases, 0),
      deaths: latest.summary.deaths,
      cfr: latest.summary.cfr,
      countriesAffected: latest.summary.countries,
      contactsTraced: latest.summary.contactsTraced,
      critical: latest.summary.critical,
    },
    lastUpdated: latest.lastUpdated,
    attribution: {
      source: index?.attribution ?? UPSTREAM_BASE,
      license: index?.license ?? 'CC-BY-4.0',
      whoDon: latest.whoOfficial?.lastDon,
      whoDonDate: latest.whoOfficial?.lastDonDate,
      whoDonUrl: latest.whoOfficial?.url,
    },
  };
}

function buildNewsFeed(latest: UpstreamSnapshot): NewsUpdate[] {
  // Two sources: global WHO/national timeline events + per-country notes.
  // Timeline events come without a country tag → badge them with the data
  // body that publishes them ("WHO"). Per-country notes carry the ISO-2 code.
  const timelineNews: NewsUpdate[] = latest.timeline.map((e, idx) => ({
    id: `tl-${e.date}-${idx}`,
    timestamp: toIsoTimestamp(e.date),
    country: 'WHO',
    message: e.event,
    isBreaking: e.severity === 'alert',
  }));

  const countryNews: NewsUpdate[] = latest.countries
    .filter((c): c is UpstreamCountry & { note: string } => typeof c.note === 'string' && c.note.length > 0)
    .map((c) => ({
      id: `cn-${c.code}-${c.lastEvent}`,
      timestamp: toIsoTimestamp(c.lastEvent),
      country: c.code,
      message: c.note,
      isBreaking: false,
    }));

  return [...timelineNews, ...countryNews].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function toIsoTimestamp(date: string): string {
  // Upstream timeline dates are bare YYYY-MM-DD; anchor at noon UTC so
  // local-time renderers don't shift to the previous day.
  return /T/.test(date) ? date : `${date}T12:00:00Z`;
}
