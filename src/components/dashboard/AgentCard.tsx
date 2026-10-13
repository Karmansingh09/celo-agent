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

  const isCustomWallet = !!agent.walletAddress;
  const shortenedAddress = isCustomWallet
    ? `${agent.walletAddress!.slice(0, 6)}…${agent.walletAddress!.slice(-4)}`
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
      label: 'ACTIVE',
      chipClass: 'st ok',
    },
    PAUSED: {
      label: 'PAUSED',
      chipClass: 'st w',
    },
    TERMINATED: {
      label: 'TERMINATED',
      chipClass: 'st d',
    },
  }[agent.status];

  const maxPerTx = agent.spendingPolicy.maxPerTransaction;
  const maxPerDay = agent.spendingPolicy.maxPerDay;
  const autoApprove = agent.spendingPolicy.autoApproveThreshold;

  return (
    <div className="p-6 sm:p-7 rounded-3xl glass shadow-sm flex flex-col justify-between space-y-5 transition-transform hover:-translate-y-1">
      <div className="space-y-3">
        {/* Header row: Agent address & status chip */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="addr font-mono text-xs text-[var(--muted)]">
              agent · {shortenedAddress}
            </span>
            {isCustomWallet && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] font-mono"
                title="Copy address"
              >
                {copied ? '✓' : '⧉'}
              </button>
            )}
          </div>
          <span className={statusConfig.chipClass}>{statusConfig.label}</span>
        </div>

        {/* Agent Name */}
        <div>
          <Link
            href={`/dashboard/agents/${agent.id}`}
            className="name text-2xl sm:text-3xl font-normal text-[var(--ink)] hover:text-[var(--accent)] transition-colors block"
          >
            {agent.name}
          </Link>
          {agent.description && (
            <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2 leading-relaxed">
              {agent.description}
            </p>
          )}
        </div>

        {/* Policy Summary line */}
        <div className="addr text-xs font-mono text-[var(--muted)] pt-1">
          Policy: {maxPerTx} per tx · {maxPerDay} per day · approval above {autoApprove}
        </div>

        {/* Policy details box */}
        <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono">
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]">
            <span className="text-[10px] text-[var(--muted)] uppercase block">Daily Cap</span>
            <span className="text-sm font-bold text-[var(--ink)] tabular-nums">{agent.spendingPolicy.maxPerDay} cUSD</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]">
            <span className="text-[10px] text-[var(--muted)] uppercase block">Auto-Approve</span>
            <span className="text-sm font-bold text-[var(--ink)] tabular-nums">≤ {agent.spendingPolicy.autoApproveThreshold} cUSD</span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-[var(--glass-b)] flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/agents/${agent.id}`}
          className="text-xs font-mono font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          View Details →
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          {agent.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => onPause(agent)}
              disabled={isActionLoading}
              className="btn h-8 px-3 text-xs text-[var(--warn)]"
            >
              Pause
            </button>
          )}

          {agent.status === 'PAUSED' && (
            <button
              type="button"
              onClick={() => onResume(agent)}
              disabled={isActionLoading}
              className="btn h-8 px-3 text-xs text-[var(--ok)]"
            >
              Resume
            </button>
          )}

          {agent.status === 'TERMINATED' && (
            <span className="text-[11px] font-mono text-[var(--muted)] italic">
              Retired
            </span>
          )}

          {agent.status !== 'TERMINATED' && (
            <button
              type="button"
              onClick={() => onTerminate(agent)}
              disabled={isActionLoading}
              className="btn h-8 px-3 text-xs text-[var(--deny)]"
            >
              Terminate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
