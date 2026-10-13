import React from 'react';
import Link from 'next/link';

interface RecentActivityProps {
  isLoading?: boolean;
}

export default function RecentActivity({ isLoading = false }: RecentActivityProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-3xl glass space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-16 w-full bg-black/5 dark:bg-white/5 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl glass shadow-sm flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono">
            Recent Activity
          </h3>
          <span className="text-[11px] font-mono text-[var(--muted)]">Audit Trail</span>
        </div>

        {/* Polished Empty State */}
        <div className="py-6 text-center space-y-2">
          <p className="text-sm font-medium text-[var(--ink)]">Recent activity will appear here</p>
          <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
            Agent lifecycle events, policy evaluations, and payment requests will be tracked as you operate CeloAgent.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-[var(--glass-b)] flex justify-between items-center text-xs">
        <Link
          href="/dashboard/activity"
          className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          <span>View activity</span>
          <span>→</span>
        </Link>
        <span className="text-[11px] font-mono text-[var(--muted)]">Phase 9.6</span>
      </div>
    </div>
  );
}
