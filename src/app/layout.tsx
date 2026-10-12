import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import AuthControls from '@/components/auth/AuthControls';

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
      <body className="flex flex-col min-h-screen bg-[#080C12] text-slate-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        <AuthProvider>
          <header className="border-b border-[rgba(180,205,220,0.1)] bg-[#0B1119]/75 backdrop-blur-md sticky top-0 z-50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 flex items-center justify-center font-bold text-xs tracking-wider shadow-[0_0_14px_-2px_rgba(134,227,176,0.25)]">
                  CA
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  Celo<span className="text-emerald-400">Agent</span>
                </span>
                <span className="ml-2 px-2.5 py-0.5 text-[11px] font-mono font-medium bg-[#141D2A]/80 text-emerald-300 border border-emerald-500/30 rounded-full">
                  Celo Sepolia
                </span>
              </div>
              <div className="flex items-center gap-6">
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
                  <a href="/#overview" className="hover:text-emerald-300 transition-colors">
                    Overview
                  </a>
                  <a href="/#flow" className="hover:text-emerald-300 transition-colors">
                    Flow
                  </a>
                  <a href="/#architecture" className="hover:text-emerald-300 transition-colors">
                    Architecture
                  </a>
                </nav>
                <AuthControls />
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="border-t border-[rgba(180,205,220,0.08)] bg-[#080C12]/80 backdrop-blur-sm py-6 text-center text-xs text-slate-500">
            <p>© {new Date().getFullYear()} CeloAgent. Built on Celo Sepolia (Chain ID: 11142220).</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
