'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import WalletStatus from './WalletStatus';

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', status: 'active' },
  { label: 'Agents', href: '/dashboard/agents', status: 'active' },
  { label: 'Approvals', href: '/dashboard/approvals', status: 'upcoming' },
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
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-2xl text-center space-y-6">
        <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl font-bold">
          🔒
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white">Authentication Required</h2>
          <p className="text-sm text-slate-300">
            Sign in with your Celo wallet using SIWE (Sign-In with Ethereum) to access the agent control plane.
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-left">
            ⚠️ {error}
          </div>
        )}

        <div className="pt-2 space-y-3">
          <button
            onClick={signIn}
            disabled={isConnecting || isSigning}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow flex items-center justify-center gap-2"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Control Plane</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              Authenticated
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Mission control for autonomous agent spending limits, approvals, and budget governance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <WalletStatus />
          <button
            onClick={logout}
            className="py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Primary Sub-Navigation Bar */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/60 text-xs font-medium">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isUpcoming = item.status === 'upcoming';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
