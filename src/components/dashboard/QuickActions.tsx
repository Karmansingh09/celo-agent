import React from 'react';
import Link from 'next/link';

export default function QuickActions() {
  return (
    <div className="p-6 rounded-2xl glass-panel shadow-sm space-y-4">
      <div className="border-b border-[rgba(180,205,220,0.1)] pb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/agents"
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-[0_4px_16px_-4px_rgba(134,227,176,0.3)] flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <span>+ Create Agent</span>
        </Link>

        <Link
          href="/dashboard/approvals"
          className="px-4 py-2 text-xs font-medium rounded-xl bg-[rgba(20,29,42,0.7)] hover:bg-[rgba(30,43,59,0.85)] text-slate-200 border border-[rgba(180,205,220,0.14)] transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <span>Review Approvals</span>
        </Link>
      </div>
    </div>
  );
}
