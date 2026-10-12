'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Agent } from '@/lib/agent/types';

interface AgentCardProps {
  agent: Agent;
  onPause: (agent: Agent) => void;
  onResume: (agent: Agent) => void;
  onTerminate: (agent: Agent) => void;
  isActionLoading?: boolean;
}

export default function AgentCard({
  agent,
  onPause,
  onResume,
  onTerminate,
  isActionLoading = false,
}: AgentCardProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const walletAddr = agent.walletAddress || 'Server Wallet';
  const isCustomWallet = !!agent.walletAddress;

  const shortenedAddress = isCustomWallet
    ? `${agent.walletAddress!.slice(0, 6)}...${agent.walletAddress!.slice(-4)}`
    : 'Default Wallet';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.walletAddress && navigator.clipboard) {
      navigator.clipboard.writeText(agent.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusConfig = {
    ACTIVE: {
      label: '● ACTIVE',
      badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_-2px_rgba(134,227,176,0.2)]',
      dotClass: 'bg-emerald-400',
    },
    PAUSED: {
      label: '● PAUSED',
      badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      dotClass: 'bg-amber-400',
    },
    TERMINATED: {
      label: '● TERMINATED',
      badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      dotClass: 'bg-rose-400',
    },
  }[agent.status];

  return (
    <div className="p-6 rounded-2xl glass-panel glass-card-interactive shadow-sm flex flex-col justify-between space-y-5">
      <div className="space-y-3.5">
        {/* Header: Name and Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🤖 {agent.name}</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400 block truncate max-w-[200px]" title={agent.id}>
              {agent.id}
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${statusConfig.badgeClass} shrink-0`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 line-clamp-2 min-h-[32px] leading-relaxed">
          {agent.description || 'Autonomous agent configured with spending boundaries.'}
        </p>

        {/* Wallet Address Display */}
        <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-[rgba(11,17,25,0.65)] border border-[rgba(180,205,220,0.1)] font-mono">
          <span className="text-slate-400">Wallet:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-200" title={walletAddr}>
              {shortenedAddress}
            </span>
            {isCustomWallet && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors ml-1 p-0.5 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
                title="Copy address"
              >
                {copied ? '✓' : '📋'}
              </button>
            )}
          </div>
        </div>

        {/* Spending Policy Summary */}
        <div className="space-y-1.5 pt-1 text-xs font-mono">
          <div className="flex justify-between items-center text-slate-400">
            <span>Max / tx:</span>
            <span className="text-white font-semibold tabular-nums">
              ${agent.spendingPolicy.maxPerTransaction} cUSD
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span>Daily limit:</span>
            <span className="text-white font-semibold tabular-nums">
              ${agent.spendingPolicy.maxPerDay} cUSD
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span>Auto-approve:</span>
            <span className="text-emerald-400 font-semibold tabular-nums">
              ≤ ${agent.spendingPolicy.autoApproveThreshold} cUSD
            </span>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="pt-3 border-t border-[rgba(180,205,220,0.1)] flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/agents/${agent.id}`}
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          <span>View agent</span>
          <span>→</span>
        </Link>

        {/* Lifecycle Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {agent.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onPause(agent)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[rgba(20,29,42,0.7)] hover:bg-amber-950/40 text-amber-300 border border-[rgba(180,205,220,0.14)] hover:border-amber-700/60 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Pause
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onTerminate(agent)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[rgba(20,29,42,0.7)] hover:bg-rose-950/50 text-rose-300 border border-[rgba(180,205,220,0.14)] hover:border-rose-800/60 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                Terminate
              </button>
            </>
          )}

          {agent.status === 'PAUSED' && (
            <>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onResume(agent)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Resume
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onTerminate(agent)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[rgba(20,29,42,0.7)] hover:bg-rose-950/50 text-rose-300 border border-[rgba(180,205,220,0.14)] hover:border-rose-800/60 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                Terminate
              </button>
            </>
          )}

          {agent.status === 'TERMINATED' && (
            <span className="text-[11px] font-mono text-slate-500 italic">
              Retired
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
