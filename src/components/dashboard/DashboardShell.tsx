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
  const { authenticated, isLoadingSession, logout, connectWallet, signIn, isConnecting, isSigning, error } = useAuth();

  // Authentication Gate (Step 7)
  if (isLoadingSession) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-slate-400">Verifying session credentials...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl glass-panel-elevated text-center space-y-6">
        <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-300 text-xl font-bold shadow-[0_0_16px_-4px_rgba(134,227,176,0.3)]">
          🔒
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Authentication Required</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Sign in with your Celo wallet using SIWE (Sign-In with Ethereum) to access the agent control plane.
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-lg bg-rose-950/70 border border-rose-800/80 text-rose-300 text-left">
            ⚠️ {error}
          </div>
        )}

        <div className="pt-2 space-y-3">
          <button
            onClick={signIn}
            disabled={isConnecting || isSigning}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-[0_4px_16px_-4px_rgba(134,227,176,0.3)] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {(isConnecting || isSigning) && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
            className="inline-block text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← Return to public home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Dashboard Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[rgba(180,205,220,0.12)]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Control Plane</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_10px_-2px_rgba(134,227,176,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Authenticated
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Mission control for autonomous agent spending limits, approvals, and budget governance
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <WalletStatus />
          <button
            onClick={logout}
            className="py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 bg-[rgba(20,29,42,0.6)] hover:bg-[rgba(30,43,59,0.8)] border border-[rgba(180,205,220,0.14)] hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Primary Sub-Navigation Bar */}
      <nav
        aria-label="Dashboard navigation"
        className="flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-xl bg-[rgba(15,22,33,0.65)] border border-[rgba(180,205,220,0.1)] backdrop-blur-md text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isUpcoming = item.status === 'upcoming';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive
                  ? 'bg-[rgba(30,43,59,0.85)] text-emerald-300 border border-emerald-500/35 font-semibold shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[rgba(20,29,42,0.5)] border border-transparent'
              }`}
            >
              <span>{item.label}</span>
              {isUpcoming && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  Phase 9.{NAV_ITEMS.indexOf(item) + 1}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Main Page Area */}
      <main className="min-h-[400px]">{children}</main>
    </div>
  );
}
