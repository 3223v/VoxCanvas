import type { Metadata } from 'next';
import './globals.css';
import Sidebar from './components/Sidebar';

export const metadata: Metadata = {
  title: 'VoxCanvas',
  description: 'A drawing system powered by rough.js',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full bg-white">
        <Sidebar />
        <main className="h-full flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
