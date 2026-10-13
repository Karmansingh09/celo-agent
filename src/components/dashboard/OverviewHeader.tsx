import React from 'react';

interface OverviewHeaderProps {
  ownerAddress: string | null;
  chainId: number | null;
}

export default function OverviewHeader({ chainId }: OverviewHeaderProps) {
  const isCeloSepolia = chainId === 11142220;
  const isCeloMainnet = chainId === 42220;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div>
        <h2 className="text-2xl sm:text-3xl font-normal text-[var(--ink)] tracking-tight">Overview</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
          Monitor your agents, spending limits, and approval requests from one place.
        </p>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono">
        <span className="text-[var(--muted)]">Network:</span>
        <span className="chip flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-pulse" />
          {isCeloSepolia ? 'Celo Sepolia' : isCeloMainnet ? 'Celo Mainnet' : 'Connected'}
        </span>
      </div>
    </div>
  );
}
