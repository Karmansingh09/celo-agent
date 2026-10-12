import React from 'react';

interface SpendingOverviewProps {
  totalDailyBudgetFormatted: string; // Decimal string e.g. "100.00" or "0.00"
  hasAgents: boolean;
  isLoading?: boolean;
}

export default function SpendingOverview({
  totalDailyBudgetFormatted,
  hasAgents,
  isLoading = false,
}: SpendingOverviewProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl glass-panel space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-800/80 rounded" />
        <div className="h-6 w-24 bg-slate-800/80 rounded" />
        <div className="h-2 w-full bg-slate-800/60 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl glass-panel shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[rgba(180,205,220,0.1)] pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Spending & Budget</h3>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            cUSD Control Plane
          </span>
        </div>

        {!hasAgents ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-slate-300">No spending data yet</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Spending activity and daily allocations will appear once an agent is created with a spending policy.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-slate-400 font-sans">Total Configured Daily Cap:</span>
              <span className="text-base font-bold text-white tabular-nums">{totalDailyBudgetFormatted} cUSD</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[rgba(11,17,25,0.7)] border border-[rgba(180,205,220,0.1)] space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Current Window Spent:</span>
                <span className="text-slate-300 font-mono tabular-nums">0.00 cUSD</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-900 border border-[rgba(180,205,220,0.08)] overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(134,227,176,0.3)]"
                  style={{ width: '0%' }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                <span>0.0% used</span>
                <span>{totalDailyBudgetFormatted} cUSD available</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
              Spending limits are enforced off-chain in cUSD by the CeloAgent policy engine.
            </p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[rgba(180,205,220,0.1)]">
        <span className="text-xs text-slate-400 font-mono">
          Currency: cUSD (18 Decimals)
        </span>
      </div>
    </div>
  );
}
