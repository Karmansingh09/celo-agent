import React from 'react';
import Link from 'next/link';

interface ApprovalSummaryProps {
  pendingApprovalsCount: number;
  isLoading?: boolean;
}

export default function ApprovalSummary({
  pendingApprovalsCount,
  isLoading = false,
}: ApprovalSummaryProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-3xl glass space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-6 w-16 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-3 w-40 bg-black/5 dark:bg-white/5 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl glass shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono">
            Approvals
          </h3>
          {pendingApprovalsCount > 0 ? (
            <span className="st w">
              Needs attention
            </span>
          ) : (
            <span className="st ok">
              Queue clear
            </span>
          )}
        </div>

        {pendingApprovalsCount === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--ink)]">You&apos;re all caught up</p>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
              Payments exceeding individual auto-approval thresholds will appear here for manual sign-off.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
              <span className="font-bold text-[var(--warn)] font-mono text-sm tabular-nums">
                {pendingApprovalsCount} {pendingApprovalsCount === 1 ? 'request' : 'requests'} waiting
              </span>
              <p className="text-[var(--ink)] leading-relaxed text-xs">
                Autonomous spending paused pending your authorization.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--glass-b)]">
        <Link
          href="/dashboard/approvals"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          <span>Review approvals</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
