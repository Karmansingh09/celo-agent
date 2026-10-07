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
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
    <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-sm flex flex-col justify-between space-y-5 hover:border-slate-600/80 transition-colors">
      <div className="space-y-4">
        {/* Top Header: Agent Link & Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <div>
              <Link
                href={`/dashboard/agents/${approval.agentId}`}
                className="text-sm font-bold text-white hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5"
              >
                <span>{agentName}</span>
                <span className="text-xs text-slate-400 font-normal">→</span>
              </Link>
              <span className="text-[11px] font-mono text-slate-400 block truncate max-w-[200px]" title={approval.agentId}>
                {approval.agentId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isExpired ? (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-950/80 text-rose-300 border border-rose-800 shrink-0">
                ● EXPIRED
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0">
                ● APPROVAL REQUIRED
              </span>
            )}
          </div>
        </div>

        {/* Amount Display Card */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Requested Amount
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {formatCusdString(approval.amountCusd)}
          </div>
        </div>

        {/* Details Grid: Recipient, Reason, Timestamps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          {/* Recipient */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider block">
              Recipient
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-200" title={approval.recipient}>
                {formatAddress(approval.recipient)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors p-0.5"
                title="Copy address"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          {/* Requested Timestamp */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider block">
              Requested At
            </span>
            <span className="text-slate-200 block truncate">
              {formatDate(approval.createdAt)}
            </span>
          </div>

          {/* Reason Context */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 space-y-1 md:col-span-2">
            <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider block">
              Approval Context
            </span>
            <span className="text-amber-300/90 font-sans text-xs leading-relaxed block">
              {getReasonContext()}
            </span>
          </div>

          {/* Validity Note */}
          {approval.validUntil && (
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 space-y-1 md:col-span-2">
              <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider block">
                Validity
              </span>
              <span className={`text-xs ${isExpired ? 'text-rose-400' : 'text-slate-300'}`}>
                {isExpired ? 'This approval request has expired.' : `Valid until ${formatDate(approval.validUntil)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Actions Bar */}
      <div className="pt-4 border-t border-slate-700/60 flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={isActionLoading}
          onClick={() => onReject(approval, agent)}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-800 transition-colors disabled:opacity-50"
        >
          Reject
        </button>

        <button
          type="button"
          disabled={isActionLoading || isExpired}
          onClick={() => onApprove(approval, agent)}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <span>Approve request</span>
        </button>
      </div>
    </div>
  );
}
