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
      <div className="p-6 rounded-3xl glass space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-black/5 dark:bg-white/5 rounded" />
          <div className="h-3 w-full bg-black/5 dark:bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl glass shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono">
            Agents
          </h3>
          <span className="text-xs font-mono text-[var(--muted)]">
            {totalAgents} registered
          </span>
        </div>

        {totalAgents === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--ink)]">No agents yet</p>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
              Create your first AI agent to start controlling autonomous spending limits.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between py-2 px-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]">
              <span className="text-[var(--ink)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
                Active
              </span>
              <span className="font-bold text-[var(--ink)] tabular-nums">{activeCount}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]">
              <span className="text-[var(--ink)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)]" />
                Paused
              </span>
              <span className="font-bold text-[var(--ink)] tabular-nums">{pausedCount}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]">
              <span className="text-[var(--ink)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--deny)]" />
                Terminated
              </span>
              <span className="font-bold text-[var(--ink)] tabular-nums">{terminatedCount}</span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--glass-b)] flex justify-between items-center text-xs">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          <span>Manage agents</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
