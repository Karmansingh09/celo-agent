'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Agent } from '@/lib/agent/types';

export interface PendingApprovalItem {
  requestId: string;
  agentId: string;
  amountCusd: string;
  recipient: string;
  idempotencyKey?: string;
  policyId?: string;
  createdAt?: number;
  validUntil?: number;
  status: string;
  statusReason?: string;
  resolvedAt?: number;
}

interface ApprovalCardProps {
  approval: PendingApprovalItem;
  agent?: Agent;
  onApprove: (approval: PendingApprovalItem, agent?: Agent) => void;
  onReject: (approval: PendingApprovalItem, agent?: Agent) => void;
  isActionLoading?: boolean;
}

export default function ApprovalCard({
  approval,
  agent,
  onApprove,
  onReject,
  isActionLoading = false,
}: ApprovalCardProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const formatCusdString = (val: string): string => {
    if (!val) return '$0.00 cUSD';
    const trimmed = val.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return `$${trimmed} cUSD`;
    const [whole, dec = ''] = trimmed.split('.');
    const paddedDec = dec.length === 0 ? '00' : dec.length === 1 ? `${dec}0` : dec;
    return `$${whole}.${paddedDec} cUSD`;
  };

  const formatAddress = (addr: string): string => {
    if (!addr || addr.length <= 12) return addr || '';
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (approval.recipient && navigator.clipboard) {
      navigator.clipboard.writeText(approval.recipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (ts?: number): string => {
    if (!ts) return 'Unknown date';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown date';
    }
  };

  const isExpired = typeof approval.validUntil === 'number' && approval.validUntil < Date.now();

  const getReasonContext = (): string => {
    if (approval.statusReason) {
      return approval.statusReason;
    }
    if (agent?.spendingPolicy?.autoApproveThreshold) {
      return `Exceeds automatic approval threshold of $${agent.spendingPolicy.autoApproveThreshold} cUSD`;
    }
    return 'Requires manual approval under configured spending policy.';
  };

  const agentName = agent ? agent.name : `Agent ${approval.agentId.slice(0, 14)}`;

  return (
    <div className="p-6 sm:p-7 rounded-3xl glass flex flex-col justify-between space-y-5 transition-transform hover:-translate-y-1">
      <div className="space-y-4">
        {/* Top Header: Agent Link & Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <div>
              <Link
                href={`/dashboard/agents/${approval.agentId}`}
                className="name text-xl font-normal text-[var(--ink)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1.5"
              >
                <span>{agentName}</span>
                <span className="text-xs text-[var(--muted)] font-normal">→</span>
              </Link>
              <span className="text-[11px] font-mono text-[var(--muted)] block truncate max-w-[200px]" title={approval.agentId}>
                {approval.agentId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isExpired ? (
              <span className="st d">
                EXPIRED
              </span>
            ) : (
              <span className="st w">
                APPROVAL REQUIRED
              </span>
            )}
          </div>
        </div>

        {/* Amount Display Card */}
        <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
          <div className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
            Requested Amount
          </div>
          <div className="num">
            {formatCusdString(approval.amountCusd)}
          </div>
        </div>

        {/* Details Grid: Recipient, Reason, Timestamps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
          {/* Recipient */}
          <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
            <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider block">
              Recipient
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--ink)] font-bold" title={approval.recipient}>
                {formatAddress(approval.recipient)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] p-0.5"
                title="Copy address"
              >
                {copied ? '✓' : '⧉'}
              </button>
            </div>
          </div>

          {/* Requested Timestamp */}
          <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
            <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider block">
              Requested At
            </span>
            <span className="text-[var(--ink)] block truncate">
              {formatDate(approval.createdAt)}
            </span>
          </div>

          {/* Reason Context */}
          <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1 md:col-span-2">
            <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider block">
              Approval Context
            </span>
            <span className="text-[var(--warn)] font-sans text-xs leading-relaxed block">
              {getReasonContext()}
            </span>
          </div>

          {/* Validity Note */}
          {approval.validUntil && (
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1 md:col-span-2">
              <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider block">
                Validity
              </span>
              <span className={`text-xs ${isExpired ? 'text-[var(--deny)]' : 'text-[var(--muted)]'}`}>
                {isExpired ? 'This approval request has expired.' : `Valid until ${formatDate(approval.validUntil)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Actions Bar */}
      <div className="pt-4 border-t border-[var(--glass-b)] flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={isActionLoading}
          onClick={() => onReject(approval, agent)}
          className="btn h-9 px-4 text-xs font-semibold text-[var(--deny)]"
        >
          Reject
        </button>

        <button
          type="button"
          disabled={isActionLoading || isExpired}
          onClick={() => onApprove(approval, agent)}
          className="btn solid h-9 px-5 text-xs font-semibold flex items-center gap-1.5"
        >
          <span>Approve request</span>
        </button>
      </div>
    </div>
  );
}
