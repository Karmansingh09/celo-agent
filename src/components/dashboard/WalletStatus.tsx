'use client';

import React from 'react';
import { useAuth, CELO_SEPOLIA_CHAIN_ID, CELO_MAINNET_CHAIN_ID } from '@/context/AuthContext';

export default function WalletStatus() {
  const { walletAddress, ownerAddress, chainId, authenticated } = useAuth();

  const displayAddress = ownerAddress || walletAddress;

  if (!displayAddress) {
    return null;
  }

  const shortened = `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}`;

  const isCeloSepolia = chainId === CELO_SEPOLIA_CHAIN_ID;
  const isCeloMainnet = chainId === CELO_MAINNET_CHAIN_ID;
  const isSupportedChain = isCeloSepolia || isCeloMainnet;

  let networkLabel = 'Unknown Chain';
  if (isCeloSepolia) networkLabel = 'Celo Sepolia';
  if (isCeloMainnet) networkLabel = 'Celo Mainnet';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* Network Badge */}
      {chainId !== null && (
        <span
          className={`px-3 py-1 rounded-full font-mono text-[11px] font-medium flex items-center gap-1.5 shrink-0 border ${
            isSupportedChain
              ? 'bg-[var(--glass)] text-[var(--ok)] border-[var(--glass-b)]'
              : 'bg-[var(--glass)] text-[var(--warn)] border-[var(--glass-b)]'
          }`}
          title={`Chain ID: ${chainId}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSupportedChain ? 'bg-[var(--ok)] animate-pulse' : 'bg-[var(--warn)]'
            }`}
          />
          <span className="hidden sm:inline">{networkLabel}</span>
          <span className="sm:hidden">{isCeloSepolia ? 'Sepolia' : isCeloMainnet ? 'Mainnet' : 'Chain'}</span>
        </span>
      )}

      {/* Address Badge */}
      <div
        className="px-3 py-1 rounded-full bg-[var(--glass)] border border-[var(--glass-b)] text-[var(--ink)] font-mono text-[11px] flex items-center gap-1.5 shrink-0 shadow-sm"
        title={displayAddress}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            authenticated ? 'bg-[var(--ok)]' : 'bg-[var(--muted)]'
          }`}
        />
        <span>{shortened}</span>
      </div>
    </div>
  );
}
