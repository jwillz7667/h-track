'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Globe, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { motion, useSpring, useTransform } from 'motion/react';
import type { CountryCaseData, DashboardData } from '@/lib/hantacount';

const POLL_INTERVAL_MS = 120_000;
const VIEW_CYCLE_MS = 15_000;
const CLOCK_TICK_MS = 60_000;
const STALE_PILL_THRESHOLD_SECONDS = 900; // 15 min

type ViewMode = 0 | 1; // 0 = map, 1 = spotlight

const TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [viewTick, setViewTick] = useState(0);
  const [clock, setClock] = useState<Date | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Read broadcast flag post-mount so we don't break Next.js static rendering
  // with useSearchParams. ?broadcast=1 bumps font scale + hides hover.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBroadcast(params.get('broadcast') === '1');
  }, []);

  // Auto-start the broadcast audio bed in OBS broadcast mode. We don't try
  // autoplay outside broadcast mode because the browser will block it without
  // a prior user gesture; the manual toggle button handles that case.
  useEffect(() => {
    if (!broadcast) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.35;
    audio.play().then(() => setAudioOn(true)).catch(() => {
      // Autoplay blocked — operator can hit the toggle to start manually.
    });
  }, [broadcast]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioOn) {
      audio.pause();
      setAudioOn(false);
    } else {
      audio.volume = 0.35;
      audio.play().then(() => setAudioOn(true)).catch(() => {});
    }
  };

  // Wall clock + view rotation. Two cheap setIntervals — not drift-sensitive
  // (60s and 15s ticks don't compound visibly even over days).
  useEffect(() => {
    setClock(new Date());
    const view = setInterval(() => setViewTick((t) => t + 1), VIEW_CYCLE_MS);
    const tick = setInterval(() => setClock(new Date()), CLOCK_TICK_MS);
    return () => {
      clearInterval(view);
      clearInterval(tick);
    };
  }, []);

  // Drift-corrected poller. Instead of setInterval (which accumulates drift
  // over 24h and races with slow networks), schedule the next call based on
  // an absolute next-deadline so cadence is stable even if a single fetch is
  // slow.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let nextDeadline = Date.now();

    const load = async () => {
      nextDeadline += POLL_INTERVAL_MS;
      try {
        const res = await fetch('/api/cases', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`feed responded ${res.status}`);
        }
        const json = (await res.json()) as DashboardData | { error: string; message?: string };
        if (cancelled) return;
        if ('error' in json) {
          // 503 cold-start path — keep last known data if any.
          setFetchError(json.message ?? json.error);
        } else {
          setData(json);
          setFetchError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          const delay = Math.max(1000, nextDeadline - Date.now());
          timeoutId = setTimeout(load, delay);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const countries = data?.countries ?? [];
  const news = data?.news ?? [];
  const summary = data?.summary;
  const attribution = data?.attribution;

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => b.totalCases - a.totalCases),
    [countries],
  );

  // Top countries (cases > 0) that we rotate through in the spotlight panel.
  const spotlightPool = useMemo(
    () => sortedCountries.filter((c) => c.totalCases > 0).slice(0, 6),
    [sortedCountries],
  );

  // True cold start — neither cache nor a live fetch has succeeded.
  if (!data || !summary || !attribution) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0a] text-white flex items-center justify-center font-sans border-t-4 border-[#CC0000]">
        <div className="text-center max-w-md px-6">
          <div className="w-3 h-3 bg-[#CC0000] rounded-full animate-pulse mx-auto" />
          <div className="text-gray-400 font-bold italic uppercase tracking-widest text-xs mt-3">
            Connecting to hantacount feed
          </div>
          {fetchError && (
            <div className="text-gray-700 italic text-[10px] mt-6 max-w-xs mx-auto">
              {fetchError} · retrying every {POLL_INTERVAL_MS / 1000}s
            </div>
          )}
        </div>
      </div>
    );
  }

  const fatalityRate =
    summary.totalCases > 0
      ? ((summary.deaths / summary.totalCases) * 100).toFixed(1) + '%'
      : '0%';

  const lastUpdatedAt = parseISO(data.lastUpdated);
  const cachedAt = data.cachedAt ? parseISO(data.cachedAt) : null;
  const cacheAgeSeconds = cachedAt ? Math.floor((Date.now() - cachedAt.getTime()) / 1000) : 0;
  const isStale = data.stale === true || cacheAgeSeconds > STALE_PILL_THRESHOLD_SECONDS;
  const viewMode: ViewMode = (viewTick % 2) as ViewMode;
  const spotlightCountry =
    spotlightPool.length > 0
      ? spotlightPool[Math.floor(viewTick / 2) % spotlightPool.length]
      : null;

  return (
    <div
      className={`h-screen w-screen bg-[#0a0a0a] text-white flex flex-col font-sans overflow-hidden border-t-4 border-[#CC0000] ${
        broadcast ? 'broadcast-mode' : ''
      }`}
    >
      {/* Top Header */}
      <header className="bg-[#CC0000] h-14 flex items-center px-4 justify-between shrink-0 shadow-lg relative z-20">
        <div className="flex items-center gap-4">
          <div className="bg-white text-[#CC0000] px-3 py-1 font-black italic text-xl skew-x-[-15deg]">
            <span className="transform skew-x-[15deg] block">H-TRACK</span>
          </div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Hantavirus Global Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold uppercase italic">
          <FeedStatusPill stale={isStale} lastUpdatedAt={lastUpdatedAt} fetchError={fetchError} />
          <div className="bg-black/20 px-3 py-1 rounded hidden md:block">
            Feed: {format(lastUpdatedAt, 'yyyy-MM-dd HH:mm')} UTC
          </div>
          {clock && (
            <div className="bg-black/20 px-3 py-1 rounded">
              Now: {format(clock, 'HH:mm')}
            </div>
          )}
          {!broadcast && (
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={audioOn ? 'Mute broadcast bed' : 'Play broadcast bed'}
              title={audioOn ? 'Mute broadcast bed' : 'Play broadcast bed'}
              className="bg-black/20 hover:bg-black/40 transition px-2.5 py-1.5 rounded"
            >
              {audioOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </header>

      {/* Broadcast audio bed. Drop a royalty-free orchestral/ambient loop at
          /public/audio/broadcast.mp3 — auto-plays in ?broadcast=1, manually
          toggleable otherwise. See CLAUDE.md → Broadcast audio for sources. */}
      <audio ref={audioRef} src="/audio/broadcast.mp3" loop preload="auto" />

      {/* Ticker Below Header */}
      <div className="bg-[#1a1a1a] h-8 border-b border-white/10 flex items-center overflow-hidden shrink-0">
        <div className="bg-[#CC0000] px-4 h-full flex items-center font-black italic text-[10px] uppercase skew-x-[-15deg] ml-[-10px] pr-8 z-10 shrink-0 shadow-xl relative">
          <span className="transform skew-x-[15deg]">Breaking News</span>
        </div>
        <div className="flex-grow overflow-hidden flex items-center relative gap-12 whitespace-nowrap px-4 font-bold text-xs tracking-wide text-gray-300 italic">
          <div className="whitespace-nowrap inline-block" style={{ animation: 'ticker 600s linear infinite' }}>
            {news.map((n, i) => (
              <span key={`a-${i}`} className="mx-6 text-white">
                <span className="text-[#CC0000] font-black mr-2 uppercase">{n.country}:</span>
                {n.message}
                <span className="text-white/20 mx-4">•</span>
              </span>
            ))}
            {news.map((n, i) => (
              <span key={`b-${i}`} className="mx-6 text-white">
                <span className="text-[#CC0000] font-black mr-2 uppercase">{n.country}:</span>
                {n.message}
                <span className="text-white/20 mx-4">•</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4 bg-[radial-gradient(circle_at_center,_#1a1a1a_0%,_#0a0a0a_100%)]">
        {/* Left Sidebar - Key Metrics */}
        <aside className="w-64 flex flex-col gap-4 shrink-0">
          <MetricTile
            label="Total Confirmed Cases"
            value={summary.totalCases}
            sub={`Across ${summary.countriesAffected} countries`}
            accent
          />
          <MetricTile
            label="Active Surveillance"
            value={summary.contactsTraced}
            sub={`▲ Contacts traced · ${summary.critical} critical`}
            subAccent
          />
          <MetricTile
            label="Case Fatality Rate"
            value={fatalityRate}
            valueClass="text-[#CC0000]"
            sub={`${summary.deaths.toLocaleString()} confirmed fatalities`}
            accent
          />
        </aside>

        {/* Center 1 - Auto-scrolling List */}
        <section className="flex-1 bg-black/40 border border-white/5 rounded flex flex-col overflow-hidden shadow-inner min-w-[250px]">
          <div className="p-3 bg-[#111] border-b border-white/10 flex justify-between items-center z-10 shrink-0">
            <h2 className="text-sm font-black italic uppercase text-white flex items-center gap-2">
              <Globe size={14} className="text-[#CC0000]" /> Impacted Regions
            </h2>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <table className="w-full text-left border-collapse sticky top-0 z-20 bg-[#111]">
              <thead className="text-[9px] uppercase font-bold text-gray-400 italic border-b border-white/10">
                <tr>
                  <th className="p-2 pl-4">Rank</th>
                  <th className="p-2">Country</th>
                  <th className="p-2 text-right text-[#CC0000]">Cases</th>
                  <th className="p-2 text-right pr-4">Deaths</th>
                </tr>
              </thead>
            </table>
            <div className="absolute inset-0 top-[29px] overflow-hidden">
              <table className="w-full text-left border-collapse" style={{ animation: 'autoScroll 40s linear infinite' }}>
                <tbody className="text-xs italic font-bold uppercase">
                  {[...Array(2)].map((_, dupIdx) => (
                    <React.Fragment key={dupIdx}>
                      {sortedCountries.map((c, idx) => (
                        <tr key={`${dupIdx}-${c.code}`} className="border-b border-white/5 bg-[#0a0a0a]/50">
                          <td className="p-3 pl-4 text-gray-500">{idx + 1}</td>
                          <td className="p-3 text-gray-300">
                            {c.country}
                            <span className="text-[9px] text-gray-600 block">{c.code}</span>
                          </td>
                          <td className="p-3 text-right text-white font-black text-sm">
                            {c.totalCases.toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-gray-500 pr-4">
                            {c.deaths.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Center 2 - Rotating view: Map / Country Spotlight */}
        <section className="flex-[1.5] flex flex-col gap-4 overflow-hidden min-w-[350px]">
          <div className="bg-black/40 border border-white/5 rounded flex flex-col shadow-inner flex-1 overflow-hidden transition-all duration-1000 ease-in-out relative">
            <div className="p-3 flex justify-between items-center bg-[#111] border-b border-white/10 shrink-0">
              <h2 className="text-sm font-black italic uppercase">
                {viewMode === 0 && 'Live Global Hotspots'}
                {viewMode === 1 && spotlightCountry
                  ? `Country Spotlight · ${spotlightCountry.country}`
                  : viewMode === 1
                    ? 'Country Spotlight'
                    : null}
              </h2>
              <div className="flex gap-1">
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${
                      viewMode === i ? 'bg-[#CC0000]' : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex-1 w-full p-4 relative">
              {viewMode === 0 && (
                <WorldMap countries={countries} lastUpdated={data.lastUpdated} />
              )}
              {viewMode === 1 && spotlightCountry && (
                <CountrySpotlight country={spotlightCountry} />
              )}
            </div>
          </div>

          <div className="h-40 grid grid-cols-2 gap-4 shrink-0">
            <div className="bg-[#111] border-l-4 border-gray-600 rounded flex flex-col justify-between p-3 shadow-inner">
              <span className="text-[10px] uppercase font-bold text-gray-500 italic">Data Sources</span>
              <div className="flex flex-col gap-2">
                {attribution.whoDon && (
                  <a
                    href={attribution.whoDonUrl ?? 'https://www.who.int/emergencies/disease-outbreak-news'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/5 p-2 flex justify-between items-center border border-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-xs font-black italic">WHO {attribution.whoDon}</span>
                    <span className="text-[#CC0000] font-black text-[10px]">SYNCED</span>
                  </a>
                )}
                <a
                  href={attribution.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/5 p-2 flex justify-between items-center border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <span className="text-xs font-black italic">hantacount.com</span>
                  <span className="text-[#CC0000] font-black text-[10px]">{attribution.license}</span>
                </a>
              </div>
            </div>
            <div className="bg-[#111] border-l-4 border-[#CC0000] rounded flex flex-col justify-between p-3 shadow-inner relative overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
              <span className="text-[10px] uppercase font-bold text-gray-500 italic z-10">System Status</span>
              <div className="flex-1 flex items-center justify-center z-10">
                <span
                  className={`text-2xl font-black italic uppercase tracking-widest text-center leading-tight ${
                    isStale ? 'text-amber-400' : 'text-green-500'
                  }`}
                >
                  {isStale ? (
                    <>
                      Stale
                      <br />
                      Feed
                    </>
                  ) : (
                    <>
                      Operation
                      <br />
                      Normal
                    </>
                  )}
                </span>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] scale-150 rotate-12">
                <div className="text-7xl font-black italic">SYS</div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Sidebar - Feed */}
        <aside className="w-80 flex flex-col gap-4 shrink-0">
          <div className="flex-1 bg-[#111] border-t-4 border-gray-600 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-3 bg-black/40 font-black italic uppercase text-xs tracking-widest border-b border-white/10 flex justify-between items-center shrink-0">
              <span>Live Updates</span>
              <span className="text-[9px] text-gray-500 font-bold normal-case">
                {news.length} events
              </span>
            </div>
            <div className="flex-grow overflow-hidden flex flex-col divide-y divide-white/5">
              {news.slice(0, 10).map((item, idx) => {
                const ts = parseISO(item.timestamp);
                return (
                  <div
                    key={item.id}
                    className={`p-3 transition-opacity duration-500 ${
                      idx === 0 && item.isBreaking
                        ? 'bg-[#CC0000]/20 border-l-2 border-[#CC0000]'
                        : 'bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-gray-500 italic uppercase">
                        {format(ts, 'yyyy-MM-dd')}
                      </span>
                      <span className="text-[9px] font-black uppercase italic tracking-wider bg-white/10 text-gray-300 px-1.5 py-0.5 rounded-sm">
                        {item.country}
                      </span>
                    </div>
                    <p className="text-[11px] italic font-bold text-gray-300 leading-snug line-clamp-4">
                      {item.isBreaking && (
                        <span className="text-[#CC0000] font-black mr-1 uppercase">Alert:</span>
                      )}
                      {item.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-32 bg-[#CC0000] p-4 flex flex-col justify-center shadow-lg relative overflow-hidden shrink-0">
            <div className="absolute -right-4 -bottom-4 opacity-20 scale-150 rotate-12">
              <div className="text-7xl font-black italic">!</div>
            </div>
            <span className="text-[10px] font-black uppercase text-white/80 z-10 relative">Clinical Notice</span>
            <span className="text-sm font-black italic leading-tight uppercase relative z-10 mt-1">
              HPS is primarily transmitted through aerosolised rodent excrement, not person-to-person.
            </span>
          </div>
        </aside>
      </main>

      {/* Attribution footer — CC-BY-4.0 requires visible credit to the source. */}
      <footer className="bg-[#080808] border-t border-white/5 text-[10px] italic text-gray-500 px-4 py-1 flex items-center justify-between shrink-0">
        <span>
          Data ·{' '}
          <a href={attribution.source} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white underline">
            hantacount.com
          </a>{' '}
          · licensed {attribution.license} · sources include WHO, UKHSA, RIVM, ISCIII, RKI, CDC
        </span>
        <span>
          {isStale && cachedAt ? (
            <>Serving cached feed · last upstream success {formatDistanceToNowStrict(cachedAt)} ago</>
          ) : (
            <>Polling every {POLL_INTERVAL_MS / 1000}s · upstream cache 10 min</>
          )}
        </span>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes ticker {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
          }
          @keyframes autoScroll {
            0% { transform: translateY(0); }
            100% { transform: translateY(-50%); }
          }
          .line-clamp-4 {
            display: -webkit-box;
            -webkit-line-clamp: 4;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .line-clamp-6 {
            display: -webkit-box;
            -webkit-line-clamp: 6;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          /* Broadcast capture mode — bump baseline for 1080p H.264 legibility,
             kill hover transitions that would never trigger in a headless OBS browser. */
          .broadcast-mode {
            font-size: 18px;
          }
          .broadcast-mode *:hover {
            transition: none !important;
          }
        `,
      }} />
    </div>
  );
}

// --- Subcomponents ---------------------------------------------------------

function FeedStatusPill({
  stale,
  lastUpdatedAt,
  fetchError,
}: {
  stale: boolean;
  lastUpdatedAt: Date;
  fetchError: string | null;
}) {
  // Three states: live (green pulse), stale (amber), offline (red - never reached
  // because no-data triggers the cold-start screen instead). fetchError surfaces
  // upstream issues even when we're still serving cached data.
  if (stale) {
    return (
      <div
        className="flex items-center gap-2 bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 rounded text-amber-300"
        title={fetchError ?? 'serving last-known-good cache'}
      >
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Stale · {formatDistanceToNowStrict(lastUpdatedAt)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" title={`feed updated ${lastUpdatedAt.toISOString()}`}>
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Live data feed
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  accent = false,
  subAccent = false,
  valueClass,
}: {
  label: string;
  value: number | string;
  sub: string;
  accent?: boolean;
  subAccent?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`bg-[#111] border-l-4 ${
        accent ? 'border-[#CC0000] bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]' : 'border-gray-600'
      } p-4 flex flex-col justify-between h-1/3 shadow-2xl`}
    >
      <span className="text-xs font-bold text-gray-400 uppercase italic">{label}</span>
      <span className={`text-5xl font-black italic leading-none ${valueClass ?? 'text-white'}`}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </span>
      <span
        className={`text-[10px] font-bold italic uppercase mt-1 ${
          subAccent ? 'text-red-400' : 'text-gray-500'
        }`}
      >
        {sub}
      </span>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  // useSpring animates between integer values; useTransform rounds + formats.
  // Stiffness/damping chosen for a ~600ms settle — visible but not distracting.
  const spring = useSpring(value, { stiffness: 80, damping: 16 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span>{display}</motion.span>;
}

// Memoize by lastUpdated. The map renders ~170 country geographies on every
// pass — expensive at 60fps. Countries-data is referentially new on every poll
// even when payload is identical, so we key on the canonical timestamp.
const WorldMap = memo(
  function WorldMap({ countries }: { countries: CountryCaseData[]; lastUpdated: string }) {
    const maxCases = Math.max(1, ...countries.map((c) => c.totalCases));
    return (
      <div className="absolute inset-0 flex items-center justify-center p-2 bg-[radial-gradient(circle_at_center,_#111_0%,_#0a0a0a_100%)]">
        <ComposableMap
          projectionConfig={{ scale: 140 }}
          width={800}
          height={400}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={TOPOJSON_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1a1a1a"
                  stroke="#333"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>
          {countries.map(({ code, coordinates, totalCases }) => {
            if (totalCases === 0) return null;
            const size = Math.max(3, (totalCases / maxCases) * 15);
            return (
              <Marker key={code} coordinates={coordinates}>
                <circle r={size} fill="#CC0000" fillOpacity={0.4} className="animate-pulse" />
                <circle r={size / 2} fill="#FF3333" />
              </Marker>
            );
          })}
        </ComposableMap>
      </div>
    );
  },
  (prev, next) => prev.lastUpdated === next.lastUpdated,
);

function CountrySpotlight({ country }: { country: CountryCaseData }) {
  return (
    <div className="absolute inset-0 p-6 flex flex-col gap-3 overflow-hidden bg-[radial-gradient(circle_at_top_right,_#1a1a1a_0%,_#0a0a0a_100%)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold text-gray-500 italic uppercase tracking-widest">
            {country.code} · last event {country.lastEvent}
          </div>
          <div className="text-4xl font-black italic uppercase mt-1">{country.country}</div>
        </div>
        <div className="text-right">
          <div className="text-[#CC0000] text-5xl font-black italic leading-none">
            {country.totalCases}
          </div>
          <div className="text-[10px] font-bold text-gray-500 italic uppercase mt-1">
            confirmed cases · {country.deaths} deaths
          </div>
        </div>
      </div>
      {country.note && (
        <p className="text-xs italic text-gray-300 leading-relaxed flex-1 overflow-hidden line-clamp-6">
          {country.note}
        </p>
      )}
      <div className="flex items-center justify-between text-[10px] italic">
        <span className="text-gray-600 uppercase">Source: {country.source}</span>
        {country.sourceUrl && (
          <a
            href={country.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white inline-flex items-center gap-1"
          >
            Read more <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
