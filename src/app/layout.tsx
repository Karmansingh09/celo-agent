import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import AuthControls from '@/components/auth/AuthControls';

export const metadata: Metadata = {
  title: 'CeloAgent — Autonomous AI Agent Spending Engine',
  description:
    'Institutional fintech control plane for autonomous AI agent liquidity, policy guardrails, and cryptographic approvals on Celo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen bg-[#070A0F] text-slate-100 antialiased selection:bg-[#FCFF52]/20 selection:text-[#FCFF52]">
        <AuthProvider>
          <header className="border-b border-white/[0.08] bg-[#090E16]/85 backdrop-blur-xl sticky top-0 z-50 shadow-[0_4px_30px_-4px_rgba(0,0,0,0.7)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
              {/* Left Brand Area */}
              <Link href="/" className="flex items-center gap-3 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52] rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-[rgba(252,255,82,0.12)] border border-[#FCFF52]/30 text-[#FCFF52] flex items-center justify-center font-bold text-xs tracking-wider shadow-[0_0_16px_-2px_rgba(252,255,82,0.25)] group-hover:border-[#FCFF52] transition-all">
                  CA
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white group-hover:text-slate-100">
                    Celo<span className="text-[#FCFF52]">Agent</span>
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hidden sm:inline">
                    L2 Control Plane
                  </span>
                </div>
              </Link>

              {/* Center Floating Pill Navigation */}
              <nav className="hidden md:flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md text-xs font-medium text-slate-300 shadow-inner">
                <Link
                  href="/"
                  className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Engine
                </Link>
                <Link
                  href="/dashboard"
                  className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Control Plane
                </Link>
                <Link
                  href="/dashboard/agents"
                  className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Agents
                </Link>
                <Link
                  href="/dashboard/approvals"
                  className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Approvals
                </Link>
                <a
                  href="/#architecture"
                  className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/[0.06] transition-all text-slate-400"
                >
                  Architecture
                </a>
              </nav>

              {/* Right Action Controls */}
              <div className="flex items-center gap-3">
                <AuthControls />
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="border-t border-[rgba(180,205,220,0.08)] bg-[#080C12]/90 backdrop-blur-sm py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
                <span>Celo Sepolia Testnet (Chain ID: 11142220) · cUSD Settled</span>
              </div>
              <p>© {new Date().getFullYear()} CeloAgent Control Plane. Autonomous Agent Liquidity Governance.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
