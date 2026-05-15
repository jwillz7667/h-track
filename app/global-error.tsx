'use client';

import { useEffect } from 'react';

// Layout-level error boundary. Fires when the root layout itself or providers
// throw — `app/error.tsx` cannot catch those. Renders its own <html><body>.

const AUTO_RESET_MS = 8_000;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[render] global_error', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    const t = setTimeout(reset, AUTO_RESET_MS);
    return () => clearTimeout(t);
  }, [error, reset]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          height: '100vh',
          width: '100vw',
          background: '#0a0a0a',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: '4px solid #CC0000',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 12,
              height: 12,
              background: '#CC0000',
              borderRadius: 999,
              margin: '0 auto',
              animation: 'p 1s infinite',
            }}
          />
          <div
            style={{
              color: '#9CA3AF',
              fontWeight: 700,
              fontStyle: 'italic',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              fontSize: 12,
              marginTop: 12,
            }}
          >
            Reconnecting to feed
          </div>
          <style>{'@keyframes p{0%,100%{opacity:.4}50%{opacity:1}}'}</style>
        </div>
      </body>
    </html>
  );
}
