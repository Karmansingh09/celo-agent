'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import WalletStatus from '../dashboard/WalletStatus';

export default function AuthControls() {
  const {
    authenticated,
    walletAddress,
    isConnecting,
    isSigning,
    isLoadingSession,
    error,
    hasProvider,
    connectWallet,
    signIn,
    logout,
    clearError,
  } = useAuth();

  if (isLoadingSession) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Checking session...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 relative">
      {/* Non-intrusive floating error toast */}
      {error && (
        <div
          role="alert"
          onClick={clearError}
          className="absolute top-12 right-0 z-50 cursor-pointer max-w-xs px-3 py-2 text-xs font-mono rounded-xl bg-[#1A0E12] border border-rose-500/40 text-rose-300 flex items-center gap-2 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all hover:bg-[#25131A] animate-in fade-in slide-in-from-top-2"
          title={`Click to dismiss: ${error}`}
        >
          <span className="shrink-0 text-rose-400">⚠️</span>
          <span className="truncate flex-1">{error}</span>
          <span className="shrink-0 text-rose-400/70 hover:text-rose-200 text-xs font-bold ml-1">✕</span>
        </div>
      )}

      {authenticated ? (
        <div className="flex items-center gap-2">
          <WalletStatus />
          <Link
            href="/dashboard"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[rgba(252,255,82,0.12)] text-[#FCFF52] border border-[#FCFF52]/30 hover:bg-[rgba(252,255,82,0.2)] transition-all shadow-[0_0_14px_-2px_rgba(252,255,82,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
          >
            Control Plane →
          </Link>
          <button
            onClick={logout}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:text-slate-200 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {!hasProvider && (
            <span className="text-[11px] text-amber-400/90 font-mono hidden xl:inline px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              No Wallet Detected
            </span>
          )}

          {!walletAddress ? (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-100 border border-white/15 transition-all shadow-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <WalletStatus />
              <button
                onClick={signIn}
                disabled={isSigning}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[rgba(252,255,82,0.15)] text-[#FCFF52] border border-[#FCFF52]/40 hover:bg-[rgba(252,255,82,0.25)] transition-all shadow-[0_0_16px_-2px_rgba(252,255,82,0.25)] disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
              >
                {isSigning && (
                  <span className="w-3 h-3 border-2 border-[#FCFF52] border-t-transparent rounded-full animate-spin" />
                )}
                <span>{isSigning ? 'Signing...' : 'Sign In with Celo'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
