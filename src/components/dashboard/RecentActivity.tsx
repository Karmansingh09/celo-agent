import React from 'react';
import Link from 'next/link';

interface RecentActivityProps {
  isLoading?: boolean;
}

export default function RecentActivity({ isLoading = false }: RecentActivityProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-700 rounded" />
        <div className="h-16 w-full bg-slate-700/60 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Activity</h3>
          <span className="text-[11px] font-mono text-slate-400">Audit Trail</span>
        </div>

        {/* Polished Empty State (Step 7) */}
        <div className="py-5 text-center space-y-2">
          <p className="text-sm font-medium text-slate-300">Recent activity will appear here</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Agent lifecycle events, policy evaluations, and payment requests will be tracked as you operate CeloAgent.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-700/60 flex justify-between items-center text-xs">
        <Link
          href="/dashboard/activity"
          className="inline-flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>View activity</span>
          <span>→</span>
        </Link>
        <span className="text-[11px] font-mono text-slate-500">Scheduled for Phase 9.6</span>
      </div>
    </div>
  );
}
