'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import WalletStatus from './WalletStatus';

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', status: 'active' },
  { label: 'Agents', href: '/dashboard/agents', status: 'active' },
  { label: 'Approvals', href: '/dashboard/approvals', status: 'active' },
  { label: 'Activity', href: '/dashboard/activity', status: 'upcoming' },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { authenticated, isLoadingSession, logout, signIn, isConnecting, isSigning, error } = useAuth();

  // Authentication Gate
  if (isLoadingSession) {
    return (
      <div className="py-28 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-[var(--muted)]">Verifying session credentials...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-3xl glass text-center space-y-6">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl shadow-sm">
          🔒
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-normal tracking-tight text-[var(--ink)]">
            Authentication Required
          </h2>
          <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
            Sign in with your Celo wallet using SIWE (Sign-In with Ethereum) to access the autonomous agent control plane.
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-[var(--deny)] text-left font-mono">
            ⚠️ {error}
          </div>
        )}

        <div className="pt-2 space-y-3">
          <button
            onClick={signIn}
            disabled={isConnecting || isSigning}
            className="btn solid w-full h-11 text-xs font-semibold"
          >
            {(isConnecting || isSigning) && (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
            )}
            <span>
              {isConnecting
                ? 'Connecting Wallet...'
                : isSigning
                ? 'Signing in...'
                : 'Connect & Sign In'}
            </span>
          </button>
          <Link
            href="/"
            className="inline-block text-xs text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          >
            ← Return to public home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Dashboard Top Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--glass-b)]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-normal text-[var(--ink)] tracking-tight">
              Control Plane
            </h1>
            <span className="chip flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-pulse" />
              Authenticated
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--muted)]">
            Autonomous agent spending policy enforcement, approvals queue, and budget governance
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <WalletStatus />
          <button
            onClick={logout}
            className="btn h-9 px-3.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Primary Sub-Navigation Bar */}
      <nav
        aria-label="Dashboard navigation"
        className="glass flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-full text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isUpcoming = item.status === 'upcoming';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-white/10'
              }`}
            >
              <span>{item.label}</span>
              {isUpcoming && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/10 opacity-70">
                  Phase 9.{NAV_ITEMS.indexOf(item) + 1}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Main Page Content Area */}
      <main className="min-h-[400px]">{children}</main>
    </div>
  );
}
