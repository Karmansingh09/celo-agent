import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import AuthControls from '@/components/auth/AuthControls';
import AmbientBackground from '@/components/common/AmbientBackground';

export const metadata: Metadata = {
  title: 'CeloAgent — Let agents spend. Keep the last word.',
  description:
    'Spending controls for autonomous AI agents on Celo Sepolia testnet. Set budgets, recipient lists, and approval thresholds. Policies enforced server-side.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <AuthProvider>
          <AmbientBackground />

          {/* Floating Pill Nav Bar matching reference */}
          <nav className="glass mx-auto mt-4 w-full max-w-[1112px] flex items-center justify-between py-2.5 px-4 sm:px-5 sticky top-2 z-40 transition-all">
            <Link href="/" className="logo flex items-center gap-2 group">
              <span>Celo<i>Agent</i></span>
            </Link>

            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--muted)]">
              <Link href="/#controls" className="hover:text-[var(--ink)] transition-colors">
                Controls
              </Link>
              <Link href="/#journey" className="hover:text-[var(--ink)] transition-colors">
                Journey
              </Link>
              <Link href="/dashboard" className="hover:text-[var(--ink)] transition-colors">
                Dashboard
              </Link>
              <Link href="/dashboard/agents" className="hover:text-[var(--ink)] transition-colors">
                Agents
              </Link>
              <Link href="/dashboard/approvals" className="hover:text-[var(--ink)] transition-colors">
                Approvals
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <AuthControls />
            </div>
          </nav>

          {/* Main Page Area */}
          <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>

          {/* Footer matching reference */}
          <footer className="py-9 text-xs text-[var(--muted)] border-t border-[var(--glass-b)] mt-auto">
            <div className="wrap flex flex-col sm:flex-row items-center justify-between gap-3">
              <span>CeloAgent · Testnet preview</span>
              <span>Policies are enforced by the backend, not on-chain.</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
