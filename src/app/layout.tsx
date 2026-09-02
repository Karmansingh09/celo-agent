import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CeloAgent - Decentralized AI-Agent Marketplace',
  description: 'AI-Agent Marketplace powered by Celo Blockchain and ERC-8004 Agent Identity Standard.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen bg-slate-900 text-slate-100 antialiased">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900">
                CA
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                Celo<span className="text-emerald-400">Agent</span>
              </span>
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full">
                Celo Sepolia
              </span>
            </div>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
              <a href="#overview" className="hover:text-emerald-400 transition-colors">
                Overview
              </a>
              <a href="#flow" className="hover:text-emerald-400 transition-colors">
                Flow
              </a>
              <a href="#architecture" className="hover:text-emerald-400 transition-colors">
                Architecture
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-800 bg-slate-950 py-6 text-center text-sm text-slate-400">
          <p>© {new Date().getFullYear()} CeloAgent. Built on Celo Sepolia (Chain ID: 11142220).</p>
        </footer>
      </body>
    </html>
  );
}
