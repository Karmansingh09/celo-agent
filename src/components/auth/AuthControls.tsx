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
        <span className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[var(--muted)] font-mono">Checking session...</span>
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
          className="absolute top-12 right-0 z-50 cursor-pointer max-w-xs px-3.5 py-2 text-xs font-mono rounded-2xl bg-rose-500/10 border border-rose-500/30 text-[var(--deny)] flex items-center gap-2 shadow-lg backdrop-blur-md transition-all hover:bg-rose-500/20"
          title={`Click to dismiss: ${error}`}
        >
          <span className="shrink-0">⚠️</span>
          <span className="truncate flex-1">{error}</span>
          <span className="shrink-0 opacity-70 hover:opacity-100 text-xs font-bold ml-1">✕</span>
        </div>
      )}

      {authenticated ? (
        <div className="flex items-center gap-2">
          <WalletStatus />
          <Link
            href="/dashboard"
            className="btn solid h-9 px-3.5 text-xs font-semibold"
          >
            Dashboard →
          </Link>
          <button
            onClick={logout}
            className="btn h-9 px-3 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {!hasProvider && (
            <span className="text-[11px] text-[var(--warn)] font-mono hidden xl:inline px-2.5 py-1 rounded-full bg-[var(--glass)] border border-[var(--glass-b)]">
              No Wallet Detected
            </span>
          )}

          {!walletAddress ? (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="btn h-9 px-4 text-xs font-semibold"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <WalletStatus />
              <button
                onClick={signIn}
                disabled={isSigning}
                className="btn solid h-9 px-4 text-xs font-semibold flex items-center gap-1.5"
              >
                {isSigning && (
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
