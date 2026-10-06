import React from 'react';
import Link from 'next/link';

interface AgentSummaryProps {
  totalAgents: number;
  activeCount: number;
  pausedCount: number;
  terminatedCount: number;
  isLoading?: boolean;
}

export default function AgentSummary({
  totalAgents,
  activeCount,
  pausedCount,
  terminatedCount,
  isLoading = false,
}: AgentSummaryProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-700 rounded" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-slate-700/60 rounded" />
          <div className="h-3 w-full bg-slate-700/60 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Agents</h3>
          <span className="text-xs font-mono text-slate-400">
            {totalAgents} {totalAgents === 1 ? 'registered' : 'registered'}
          </span>
        </div>

        {totalAgents === 0 ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm font-medium text-slate-300">No agents yet</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Create your first AI agent to start controlling autonomous spending limits.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between py-1 px-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Active
              </span>
              <span className="font-bold text-white">{activeCount}</span>
            </div>
            <div className="flex items-center justify-between py-1 px-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Paused
              </span>
              <span className="font-bold text-white">{pausedCount}</span>
            </div>
            <div className="flex items-center justify-between py-1 px-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Terminated
              </span>
              <span className="font-bold text-white">{terminatedCount}</span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-700/60">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>View agents</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
