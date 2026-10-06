'use client';

import React, { useState } from 'react';
import { BoundAgentSpendingPolicy } from '@/lib/agent/types';

interface AgentPolicyCardProps {
  policy: BoundAgentSpendingPolicy;
}

export default function AgentPolicyCard({ policy }: AgentPolicyCardProps) {
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const copyAddress = (addr: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(addr);
      setCopiedAddr(addr);
      setTimeout(() => setCopiedAddr(null), 2000);
    }
  };

  const isExpired = typeof policy.validUntil === 'number' && policy.validUntil < Date.now();
  const formatValidity = (timestampMs: number) => {
    if (!timestampMs) return 'Indefinite';
    try {
      const d = new Date(timestampMs);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Invalid timestamp';
    }
  };

  const allowedRecipients = policy.allowedRecipients || [];
  const maxDisplayRecipients = 3;
  const displayedRecipients = allowedRecipients.slice(0, maxDisplayRecipients);
  const remainingRecipients = allowedRecipients.length - maxDisplayRecipients;

  return (
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-6">
      <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>Spending Controls</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically enforced spending boundaries evaluated by the CeloAgent Policy Engine.
          </p>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
          Read-Only
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Max Per Transaction */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Maximum Per Transaction
          </div>
          <div className="text-xl font-bold font-mono text-white">
            ${policy.maxPerTransaction} <span className="text-xs text-slate-400 font-normal">cUSD</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The largest controlled spending request this agent can make in a single request.
          </p>
        </div>

        {/* Daily Spending Limit */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Daily Spending Limit
          </div>
          <div className="text-xl font-bold font-mono text-white">
            ${policy.maxPerDay} <span className="text-xs text-slate-400 font-normal">cUSD</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The maximum controlled spending allowed within the rolling 24-hour daily budget window.
          </p>
        </div>

        {/* Auto-Approval Threshold */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">
            Auto-Approval Threshold
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300">
            ≤ ${policy.autoApproveThreshold} <span className="text-xs text-slate-400 font-normal">cUSD</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Requests at or below this amount may proceed without manual human approval.
          </p>
        </div>
      </div>

      {/* Allowed Recipients and Validity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Allowed Recipients */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Allowed Recipients
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {allowedRecipients.length === 0 ? 'Unrestricted' : `${allowedRecipients.length} configured`}
            </span>
          </div>

          {allowedRecipients.length === 0 ? (
            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-1">
              <span className="text-xs font-semibold text-emerald-400">Any recipient</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Requests to any valid EVM recipient address are eligible for evaluation under policy limits.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {displayedRecipients.map((addr) => (
                <div
                  key={addr}
                  className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/60 text-xs font-mono"
                >
                  <span className="text-slate-300" title={addr}>
                    {addr.slice(0, 10)}...{addr.slice(-6)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyAddress(addr)}
                    className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors p-0.5"
                    title="Copy Address"
                  >
                    {copiedAddr === addr ? '✓' : '📋'}
                  </button>
                </div>
              ))}
              {remainingRecipients > 0 && (
                <div className="text-[11px] font-mono text-slate-400 italic pt-0.5">
                  + {remainingRecipients} more address{remainingRecipients > 1 ? 'es' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Policy Validity */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Policy Validity
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                  isExpired
                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                }`}
              >
                {isExpired ? 'Expired' : 'Active'}
              </span>
            </div>
            <div className="text-sm font-bold text-white font-mono">
              {isExpired ? 'Expired' : `Valid until ${formatValidity(policy.validUntil)}`}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Automated authorization boundary set upon agent creation. Requests beyond expiry are denied.
            </p>
          </div>

          <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">
            Timestamp: {policy.validUntil}
          </div>
        </div>
      </div>
    </div>
  );
}
