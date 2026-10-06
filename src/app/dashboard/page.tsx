import React from 'react';

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6">
      {/* Welcome / Posture Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-800/40 border border-slate-700/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Agent Spending Control Center</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              CeloAgent governs autonomous agent spending on Celo Sepolia and Mainnet with off-chain
              cUSD policy limits, atomic budget reservations, and owner sign-off workflows.
            </p>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
            Phase 9.1 Shell Active
          </span>
        </div>
      </div>

      {/* Control Plane Placeholder Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agents Directory</div>
          <h3 className="text-lg font-bold text-white">Agent Directory & Lifecycle</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Register, inspect, pause, resume, and terminate autonomous agent instances.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Scheduled for Phase 9.3
            </span>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approval Queue</div>
          <h3 className="text-lg font-bold text-white">Pending Approval Queue</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Review high-value agent spending requests exceeding individual auto-approval thresholds.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Scheduled for Phase 9.5
            </span>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Policy Engine</div>
          <h3 className="text-lg font-bold text-white">cUSD Budget Allocation</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure per-transaction caps, daily rolling limits, and allowed recipient whitelists.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Scheduled for Phase 9.4
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
