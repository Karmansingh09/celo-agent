import React from 'react';

interface OverviewHeaderProps {
  ownerAddress: string | null;
  chainId: number | null;
}

export default function OverviewHeader({ ownerAddress, chainId }: OverviewHeaderProps) {
  const isCeloSepolia = chainId === 11142220;
  const isCeloMainnet = chainId === 42220;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Overview</h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Monitor your agents, spending limits, and approval requests from one place.
        </p>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono">
        <span className="text-slate-400">Network:</span>
        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
          {isCeloSepolia ? 'Celo Sepolia (11142220)' : isCeloMainnet ? 'Celo Mainnet (42220)' : 'Connected'}
        </span>
      </div>
    </div>
  );
}
