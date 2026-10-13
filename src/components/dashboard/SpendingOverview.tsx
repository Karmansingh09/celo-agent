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
      <div className="p-6 rounded-3xl glass space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-6 w-24 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl glass shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono">
            Spending & Budget
          </h3>
          <span className="chip">
            cUSD Control Plane
          </span>
        </div>

        {!hasAgents ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--ink)]">No spending data yet</p>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
              Spending activity and daily allocations will appear once an agent is created with a spending policy.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-[var(--muted)] font-sans">Total Configured Daily Cap:</span>
              <span className="text-base font-bold text-[var(--ink)] tabular-nums">{totalDailyBudgetFormatted} cUSD</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--muted)]">Current Window Spent:</span>
                <span className="text-[var(--ink)] font-mono tabular-nums">0.00 cUSD</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                  style={{ width: '0%' }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--muted)]">
                <span>0.00 reserved</span>
                <span>{totalDailyBudgetFormatted} limit</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-[var(--muted)] font-mono border-t border-[var(--glass-b)] pt-3 flex items-center justify-between">
        <span>Window: UTC calendar day</span>
        <span>Zero-float BigInt</span>
      </div>
    </div>
  );
}
