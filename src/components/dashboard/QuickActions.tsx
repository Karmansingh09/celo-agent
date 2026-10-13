import React from 'react';
import Link from 'next/link';

export default function QuickActions() {
  return (
    <div className="p-6 rounded-3xl glass shadow-sm space-y-4">
      <div className="border-b border-[var(--glass-b)] pb-3">
        <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono">
          Quick Actions
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/agents"
          className="btn solid h-10 px-5 text-xs font-semibold"
        >
          <span>+ Create Agent</span>
        </Link>

        <Link
          href="/dashboard/approvals"
          className="btn h-10 px-5 text-xs font-medium"
        >
          <span>Review Approvals</span>
        </Link>
      </div>
    </div>
  );
}
