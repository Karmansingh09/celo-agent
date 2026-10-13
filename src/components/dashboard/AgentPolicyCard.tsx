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
    <div className="glass p-6 sm:p-7 rounded-3xl space-y-6">
      <div className="border-b border-[var(--glass-b)] pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono flex items-center gap-2">
            <span>Spending Controls</span>
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Server-enforced spending boundaries evaluated by the CeloAgent Policy Engine.
          </p>
        </div>
        <span className="chip">
          Read-Only Policy
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Max Per Transaction */}
        <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
          <div className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
            Max Per Transaction
          </div>
          <div className="num">
            {policy.maxPerTransaction || '0.00'} <small>cUSD</small>
          </div>
          <p className="text-[10px] text-[var(--muted)]">Enforced per request</p>
        </div>

        {/* Max Per Day */}
        <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
          <div className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
            Daily Budget Ceiling
          </div>
          <div className="num">
            {policy.maxPerDay || '0.00'} <small>cUSD</small>
          </div>
          <p className="text-[10px] text-[var(--muted)]">Resets UTC 00:00</p>
        </div>

        {/* Auto-Approval Threshold */}
        <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-1">
          <div className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
            Auto-Approval Threshold
          </div>
          <div className="num">
            {policy.autoApproveThreshold || '0.00'} <small>cUSD</small>
          </div>
          <p className="text-[10px] text-[var(--muted)]">Requests above this queue for sign-off</p>
        </div>
      </div>

      {/* Allowed Recipients Section */}
      <div className="space-y-3 pt-2 border-t border-[var(--glass-b)]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--ink)] font-mono uppercase tracking-wider text-[11px]">
            Whitelisted Recipients ({allowedRecipients.length})
          </span>
          {allowedRecipients.length === 0 && (
            <span className="st w">
              Any recipient
            </span>
          )}
        </div>

        {allowedRecipients.length > 0 ? (
          <div className="space-y-1.5 font-mono text-xs">
            {displayedRecipients.map((recipient) => (
              <div
                key={recipient}
                className="flex items-center justify-between p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)]"
              >
                <span className="text-[var(--ink)] truncate max-w-[280px]" title={recipient}>
                  {recipient}
                </span>
                <button
                  type="button"
                  onClick={() => copyAddress(recipient)}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded"
                  title="Copy address"
                >
                  {copiedAddr === recipient ? '✓' : '⧉'}
                </button>
              </div>
            ))}
            {remainingRecipients > 0 && (
              <div className="text-center text-xs text-[var(--muted)] pt-1">
                + {remainingRecipients} more allowed {remainingRecipients === 1 ? 'recipient' : 'recipients'}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            No specific recipient whitelist configured. Agent may submit payment requests to any destination subject to amount limits.
          </p>
        )}
      </div>

      {/* Policy Expiry Footer */}
      <div className="pt-2 border-t border-[var(--glass-b)] flex items-center justify-between text-xs font-mono">
        <span className="text-[var(--muted)]">Policy Expiration:</span>
        <span className={isExpired ? 'text-[var(--deny)] font-bold' : 'text-[var(--ink)]'}>
          {policy.validUntil ? formatValidity(policy.validUntil) : 'No expiration date'}
          {isExpired && ' (EXPIRED)'}
        </span>
      </div>
    </div>
  );
}
