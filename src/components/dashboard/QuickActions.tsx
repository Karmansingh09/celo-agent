import React from 'react';
import Link from 'next/link';

export default function QuickActions() {
  return (
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-4">
      <div className="border-b border-slate-700/60 pb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/agents"
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow flex items-center gap-1.5"
        >
          <span>+ Create Agent</span>
        </Link>

        <Link
          href="/dashboard/approvals"
          className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          <span>Review Approvals</span>
        </Link>
      </div>
    </div>
  );
}
