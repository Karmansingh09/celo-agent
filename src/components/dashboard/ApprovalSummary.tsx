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
      <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-700 rounded" />
        <div className="h-6 w-16 bg-slate-700 rounded" />
        <div className="h-3 w-40 bg-slate-700/60 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Approvals</h3>
          {pendingApprovalsCount > 0 ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800">
              Needs attention
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
              Queue clear
            </span>
          )}
        </div>

        {pendingApprovalsCount === 0 ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm font-medium text-slate-300">You&apos;re all caught up</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Payments exceeding individual auto-approval thresholds will appear here for manual sign-off.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 space-y-1">
              <span className="font-bold text-amber-300 font-mono text-sm">
                {pendingApprovalsCount} {pendingApprovalsCount === 1 ? 'request' : 'requests'} waiting
              </span>
              <p className="text-slate-300">
                Autonomous spending paused pending your authorization.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-700/60">
        <Link
          href="/dashboard/approvals"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>Review approvals</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
