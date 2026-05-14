import type {Metadata} from 'next';
import { Inter, Oswald } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald' });

export const metadata: Metadata = {
  title: 'Hantavirus Tracker Dashboard',
  description: 'Live ESPN-style dashboard for tracking Hantavirus cases.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      <body className="font-sans bg-gray-100 text-gray-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
