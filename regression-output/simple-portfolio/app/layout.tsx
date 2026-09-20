import './globals.css';
import LenisProvider from '../lib/lenis-provider';

export const metadata = {
  title: 'Portfolio',
  description: 'Portfolio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=optional" rel="stylesheet" />
      </head>
      <body>
        <LenisProvider>
          {children}


        </LenisProvider>
      </body>
    </html>
  );
}
