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
    <div className="flex items-center gap-3">
      {error && (
        <div
          role="alert"
          onClick={clearError}
          className="cursor-pointer px-2.5 py-1 text-xs rounded bg-rose-950/80 border border-rose-800 text-rose-300 flex items-center gap-1.5"
          title="Click to dismiss"
        >
          <span>⚠️ {error}</span>
        </div>
      )}

      {authenticated ? (
        <div className="flex items-center gap-3">
          <WalletStatus />
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Dashboard
          </Link>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {!hasProvider && (
            <span className="text-xs text-amber-400 font-mono hidden sm:inline">
              No Wallet Detected
            </span>
          )}

          {!walletAddress ? (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <WalletStatus />
              <button
                onClick={signIn}
                disabled={isSigning}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSigning && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
