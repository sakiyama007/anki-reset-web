import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';

export const metadata: Metadata = {
  title: 'Anki Reset',
  description: '暗記カード学習アプリ',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-serif antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
