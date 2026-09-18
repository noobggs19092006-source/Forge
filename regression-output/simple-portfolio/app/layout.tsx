import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import './globals.css';
import LenisProvider from '../lib/lenis-provider';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'optional',
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'optional',
  variable: '--font-text',
});

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Minimal portfolio showcasing work, skills, and contact information.',
  colorScheme: 'dark',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.08 0 0)' },
    { media: '(prefers-color-scheme: light)', color: 'oklch(0.98 0 0)' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
