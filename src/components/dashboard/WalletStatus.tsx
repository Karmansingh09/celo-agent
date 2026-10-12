'use client';

import React from 'react';
import { useAuth, CELO_SEPOLIA_CHAIN_ID, CELO_MAINNET_CHAIN_ID } from '@/context/AuthContext';

export default function WalletStatus() {
  const { walletAddress, ownerAddress, chainId, authenticated } = useAuth();

  const displayAddress = ownerAddress || walletAddress;

  if (!displayAddress) {
    return null;
  }

  const shortened = `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`;

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
          className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-medium flex items-center gap-1.5 shrink-0 ${
            isSupportedChain
              ? 'bg-[rgba(20,29,42,0.7)] text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_-3px_rgba(134,227,176,0.2)]'
              : 'bg-[rgba(20,29,42,0.7)] text-amber-300 border border-amber-500/30'
          }`}
          title={`Chain ID: ${chainId}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSupportedChain ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="hidden sm:inline">{networkLabel}</span>
          <span className="sm:hidden">{isCeloSepolia ? 'Sepolia' : isCeloMainnet ? 'Mainnet' : 'Chain'}</span>
        </span>
      )}

      {/* Address Badge */}
      <div
        className="px-3 py-1 rounded-full bg-[rgba(20,29,42,0.7)] border border-[rgba(180,205,220,0.14)] text-slate-200 font-mono text-[11px] flex items-center gap-1.5 shrink-0 shadow-sm"
        title={displayAddress}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            authenticated ? 'bg-emerald-400' : 'bg-slate-400'
          }`}
        />
        <span>{shortened}</span>
      </div>
    </div>
  );
}
