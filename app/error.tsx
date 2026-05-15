'use client';

import { useEffect } from 'react';

// Per-route error boundary. One unhandled exception from recharts / react-simple-maps /
// motion must not black out the broadcast — show a calm reconnecting state and
// auto-reset after a few seconds so the dashboard recovers on its own.

const AUTO_RESET_MS = 8_000;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log so it shows up in Railway/server logs.
    console.error('[render] dashboard_error', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    const t = setTimeout(reset, AUTO_RESET_MS);
    return () => clearTimeout(t);
  }, [error, reset]);

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex items-center justify-center font-sans border-t-4 border-[#CC0000]">
      <div className="text-center max-w-md px-6">
        <div className="w-3 h-3 bg-[#CC0000] rounded-full animate-pulse mx-auto" />
        <div className="text-gray-400 font-bold italic uppercase tracking-widest text-xs mt-3">
          Reconnecting to feed
        </div>
        <div className="text-gray-700 italic text-[10px] mt-6">
          auto-resume in {Math.round(AUTO_RESET_MS / 1000)}s
        </div>
      </div>
    </div>
  );
}
