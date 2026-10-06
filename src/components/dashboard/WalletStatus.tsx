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
          className={`px-2.5 py-1 rounded-full font-mono font-medium flex items-center gap-1.5 ${
            isSupportedChain
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : 'bg-amber-950/80 text-amber-300 border border-amber-800'
          }`}
          title={`Chain ID: ${chainId}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSupportedChain ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          {networkLabel}
        </span>
      )}

      {/* Address Badge */}
      <div
        className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-mono flex items-center gap-1.5"
        title={displayAddress}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            authenticated ? 'bg-emerald-400' : 'bg-slate-400'
          }`}
        />
        <span>{shortened}</span>
      </div>
    </div>
  );
}
