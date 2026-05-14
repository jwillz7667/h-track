'use client';

import React, { useState, useEffect } from 'react';
import { initialCountries, initialNews, CountryCaseData, NewsUpdate } from '../lib/data';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
  const [countries, setCountries] = useState<CountryCaseData[]>(initialCountries);
  const [news, setNews] = useState<NewsUpdate[]>(initialNews);
  
  useEffect(() => {
    let tickCount = 0;
    
    const interval = setInterval(() => {
      tickCount++;
      
      setCountries(prev => {
        const next = [...prev];
        // 70% chance to update cases on this tick
        const shouldUpdateCases = Math.random() > 0.3;
        let breakingNewsTriggered = false;
        
        if (shouldUpdateCases) {
          // Weight towards some countries, or just random
          const rtIndex = Math.floor(Math.random() * next.length);
          const randCases = Math.floor(Math.random() * 3) + 1; // 1 to 3 cases
          
          const isFatality = Math.random() > 0.95; // 5% chance of fatality
          const isRecovery = Math.random() > 0.90; // 10% chance of recovery
          
          let activeChange = randCases;
          let totalChange = randCases;
          let deathChange = 0;
          
          if (isFatality && next[rtIndex].activeCases > 0) {
             activeChange -= 1;
             deathChange += 1;
          } else if (isRecovery && next[rtIndex].activeCases > 0) {
             activeChange -= 1;
          }
          
          next[rtIndex] = {
            ...next[rtIndex],
            activeCases: Math.max(0, next[rtIndex].activeCases + activeChange),
            totalCases: next[rtIndex].totalCases + totalChange,
            deaths: next[rtIndex].deaths + deathChange,
            trend: 'up'
          };
          
          // Update the current day's history so the chart area bumps up
          const histLen = next[rtIndex].history.length;
          if (histLen > 0) {
              const newHist = [...next[rtIndex].history];
              newHist[histLen - 1] = { ...newHist[histLen - 1], cases: newHist[histLen - 1].cases + totalChange };
              next[rtIndex].history = newHist;
          }

          // Trigger breaking news on large jumps or fatalities, or randomly
          const isBreaking = isFatality || (randCases >= 3) || Math.random() > 0.8;
          if (isBreaking || tickCount % 8 === 0) { // Guarantee some news every 8 ticks
            breakingNewsTriggered = true;
            setNews(prevNews => {
                // Import getRandomNews if we hadn't already (we can rely on the data.ts export)
                const newUpdate = require('../lib/data').getRandomNews(next[rtIndex].country, next[rtIndex].code, isBreaking, randCases);
                return [newUpdate, ...prevNews].slice(0, 30); // Keep last 30
            });
          }
        }
        
        if (!breakingNewsTriggered && tickCount % 12 === 0) {
          const randomCountry = next[Math.floor(Math.random() * next.length)];
          setNews(prevNews => {
             const newUpdate = require('../lib/data').getRandomNews(randomCountry.country, randomCountry.code, false);
             return [newUpdate, ...prevNews].slice(0, 30);
          });
        }

        // Randomly adjust trends for other countries to simulate real-time ebb and flow
        return next.map(c => {
          if (Math.random() > 0.92) return {...c, trend: 'flat'};
          if (Math.random() > 0.95 && c.activeCases > 0) return {...c, trend: 'down', activeCases: c.activeCases - 1};
          return c;
        });
      });
      
    }, 5000); // Trigger every 5 seconds for a dynamic livestream feel

    return () => clearInterval(interval);
  }, []);

  const globalTimeline = React.useMemo(() => {
    if (!countries.length) return [];
    const days = countries[0].history.length;
    const timeline = [];
    for (let i = 0; i < days; i++) {
        let dailyTotal = 0;
        let dateLabel = '';
        countries.forEach(c => {
            if (c.history[i]) {
                dailyTotal += c.history[i].cases;
                dateLabel = c.history[i].date;
            }
        });
        timeline.push({ date: dateLabel, totalCases: dailyTotal });
    }
    return timeline;
  }, [countries]);

  const totalGlobalCases = countries.reduce((acc, c) => acc + c.totalCases, 0);
  const totalActive = countries.reduce((acc, c) => acc + c.activeCases, 0);
  const totalDeaths = countries.reduce((acc, c) => acc + c.deaths, 0);
  const fatalityRate = totalGlobalCases > 0 ? ((totalDeaths / totalGlobalCases) * 100).toFixed(1) + '%' : '0%';
  
  const sortedCountries = [...countries].sort((a,b) => b.activeCases - a.activeCases);

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex flex-col font-sans overflow-hidden border-t-4 border-[#CC0000]">
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
        <div className="flex items-center gap-6 text-xs font-bold uppercase italic">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span> LIVE DATA FEED
          </div>
          <div className="bg-black/20 px-3 py-1 rounded">
            UPDATE: {format(new Date(), 'HH:mm')} ET
          </div>
        </div>
      </header>
      
      {/* Ticker Below Header */}
      <div className="bg-[#1a1a1a] h-8 border-b border-white/10 flex items-center overflow-hidden shrink-0">
        <div className="bg-[#CC0000] px-4 h-full flex items-center font-black italic text-[10px] uppercase skew-x-[-15deg] ml-[-10px] pr-8 z-10 shrink-0 shadow-xl relative">
            <span className="transform skew-x-[15deg]">Breaking News</span>
        </div>
        <div className="flex-grow overflow-hidden flex items-center relative gap-12 whitespace-nowrap px-4 font-bold text-xs tracking-wide text-gray-300 italic">
            <div className="whitespace-nowrap inline-block" style={{ animation: 'ticker 40s linear infinite' }}>
                {news.map((n, i) => (
                    <span key={i} className="mx-6 text-white">
                        <span className="text-[#CC0000] font-black mr-2 uppercase">{n.country}:</span>
                        {n.message.replace('BREAKING: ', '')}
                        <span className="text-white/20 mx-4">•</span>
                    </span>
                ))}
                {news.map((n, i) => (
                    <span key={`dup-${i}`} className="mx-6 text-white">
                        <span className="text-[#CC0000] font-black mr-2 uppercase">{n.country}:</span>
                        {n.message.replace('BREAKING: ', '')}
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
          <div className="bg-[#111] border-l-4 border-[#CC0000] p-4 flex flex-col justify-between h-1/3 shadow-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
            <span className="text-xs font-bold text-gray-400 uppercase italic">Total Global Cases</span>
            <span className="text-5xl font-black italic text-white leading-none">{totalGlobalCases.toLocaleString()}</span>
            <span className="text-xs font-bold text-gray-500 italic uppercase">Aggregated YTD</span>
          </div>
          <div className="bg-[#111] border-l-4 border-gray-600 p-4 flex flex-col justify-between h-1/3 shadow-2xl">
            <span className="text-xs font-bold text-gray-400 uppercase italic">Active Surveillance</span>
            <span className="text-5xl font-black italic text-white leading-none">{totalActive.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-red-400 italic uppercase mt-1">▲ Hotspots Updating Live</span>
          </div>
          <div className="bg-[#111] border-l-4 border-[#CC0000] p-4 flex flex-col justify-between h-1/3 shadow-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
            <span className="text-xs font-bold text-gray-400 uppercase italic">Case Fatality Rate</span>
            <span className="text-5xl font-black italic text-[#CC0000] leading-none">{fatalityRate}</span>
            <span className="text-xs font-bold text-gray-500 italic uppercase">{totalDeaths.toLocaleString()} Total Fatalities</span>
          </div>
        </aside>

        {/* Center 1 - Auto-scrolling List */}
        <section className="flex-1 bg-black/40 border border-white/5 rounded flex flex-col overflow-hidden shadow-inner min-w-[250px]">
            <div className="p-3 bg-[#111] border-b border-white/10 flex justify-between items-center z-10 shrink-0">
                <h2 className="text-sm font-black italic uppercase text-white flex items-center gap-2">
                    <Globe size={14} className="text-[#CC0000]"/> Impacted Regions
                </h2>
            </div>
            <div className="flex-1 overflow-hidden relative">
                <table className="w-full text-left border-collapse sticky top-0 z-20 bg-[#111]">
                    <thead className="text-[9px] uppercase font-bold text-gray-400 italic border-b border-white/10">
                        <tr>
                            <th className="p-2 pl-4">Rank</th>
                            <th className="p-2">Country</th>
                            <th className="p-2 text-right text-[#CC0000]">Active</th>
                            <th className="p-2 text-right pr-4">Total</th>
                        </tr>
                    </thead>
                </table>
                <div className="absolute inset-0 top-[29px] overflow-hidden">
                    <table className="w-full text-left border-collapse" style={{ animation: 'autoScroll 30s linear infinite' }}>
                        <tbody className="text-xs italic font-bold uppercase">
                            {/* Duplicate array twice for seamless looping */}
                            {[...Array(2)].map((_, i) => (
                                <React.Fragment key={i}>
                                    {sortedCountries.map((c, idx) => (
                                        <tr key={c.code + i} className="border-b border-white/5 bg-[#0a0a0a]/50">
                                            <td className="p-3 pl-4 text-gray-500">{idx + 1}</td>
                                            <td className="p-3 text-gray-300">{c.country} <span className="text-[9px] text-gray-600 block">{c.code}</span></td>
                                            <td className="p-3 text-right text-white font-black text-sm">{c.activeCases.toLocaleString()}</td>
                                            <td className="p-3 text-right text-gray-500 pr-4">{c.totalCases.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        {/* Center 2 - Charts & Distributions */}
        <section className="flex-[1.5] flex flex-col gap-4 overflow-hidden min-w-[350px]">
            <div className="bg-black/40 border border-white/5 rounded flex flex-col shadow-inner flex-1 overflow-hidden">
                <div className="p-3 flex justify-between items-center bg-[#111] border-b border-white/10 shrink-0">
                    <h2 className="text-sm font-black italic uppercase">Global Trajectory (30 Days)</h2>
                </div>
                <div className="flex-1 w-full p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={globalTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#CC0000" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#CC0000" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                            <XAxis dataKey="date" tick={{fontSize: 10, fill: '#9CA3AF'}} tickMargin={10} minTickGap={30} />
                            <YAxis tick={{fontSize: 10, fill: '#9CA3AF', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#111', color: '#F9FAFB', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontStyle: 'italic', fontWeight: 'bold' }}
                                itemStyle={{ color: '#CC0000' }}
                            />
                            <Area type="monotone" dataKey="totalCases" stroke="#CC0000" strokeWidth={3} fillOpacity={1} fill="url(#colorCases)" isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="h-40 grid grid-cols-2 gap-4 shrink-0">
                <div className="bg-[#111] border-l-4 border-gray-600 rounded flex flex-col justify-between p-3 shadow-inner">
                    <span className="text-[10px] uppercase font-bold text-gray-500 italic">Data Sources</span>
                    <div className="flex flex-col gap-2">
                         <div className="bg-white/5 p-2 flex justify-between items-center border border-white/5">
                            <span className="text-xs font-black italic">WHO S-REP #244</span>
                            <span className="text-[#CC0000] font-black text-[10px]">SYNCED</span>
                        </div>
                        <div className="bg-white/5 p-2 flex justify-between items-center border border-white/5">
                            <span className="text-xs font-black italic">CDC MMWR</span>
                            <span className="text-[#CC0000] font-black text-[10px]">SYNCED</span>
                        </div>
                    </div>
                </div>
                <div className="bg-[#111] border-l-4 border-[#CC0000] rounded flex flex-col justify-between p-3 shadow-inner relative overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 italic z-10">System Status</span>
                    <div className="flex-1 flex items-center justify-center z-10">
                        <span className="text-2xl font-black italic text-green-500 uppercase tracking-widest text-center leading-tight">Operation<br/>Normal</span>
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
                </div>
                {/* For livestream, auto-scroll disabled here, just relying on new items pushing down or we can just let it be fully packed */}
                <div className="flex-grow overflow-hidden flex flex-col divide-y divide-white/5">
                    {news.slice(0, 10).map((item, idx) => (
                        <div key={item.id} className={`p-3 transition-opacity duration-500 ${idx === 0 && item.isBreaking ? 'bg-[#CC0000]/20 border-l-2 border-[#CC0000]' : 'bg-transparent'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-bold text-gray-500 italic uppercase">{format(item.timestamp, 'HH:mm:ss')}</span>
                                <span className="text-[9px] font-black uppercase italic tracking-wider bg-white/10 text-gray-300 px-1.5 py-0.5 rounded-sm">{item.country}</span>
                            </div>
                            <p className="text-[11px] italic font-bold text-gray-300 leading-snug">
                                {item.isBreaking && <span className="text-[#CC0000] font-black mr-1 uppercase">Alert:</span>}
                                {item.message}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-32 bg-[#CC0000] p-4 flex flex-col justify-center shadow-lg relative overflow-hidden shrink-0">
                <div className="absolute -right-4 -bottom-4 opacity-20 scale-150 rotate-12">
                    <div className="text-7xl font-black italic">!</div>
                </div>
                <span className="text-[10px] font-black uppercase text-white/80 z-10 relative">Clinical Notice</span>
                <span className="text-sm font-black italic leading-tight uppercase relative z-10 mt-1">
                    HPS is primarily transmitted through aerosolized rodent excrement, not person-to-person.
                </span>
            </div>
        </aside>

      </main>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes autoScroll {
            0% { transform: translateY(0); }
            100% { transform: translateY(-50%); }
        }
        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
        }
      `}} />
    </div>
  );
}
