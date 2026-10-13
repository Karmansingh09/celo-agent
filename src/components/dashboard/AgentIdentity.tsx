'use client';

import React, { useState } from 'react';
import { Agent } from '@/lib/agent/types';

interface AgentIdentityProps {
  agent: Agent;
}

export default function AgentIdentity({ agent }: AgentIdentityProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const formatAddress = (addr?: string) => {
    if (!addr) return 'Default Backend Wallet';
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };

  const formatDate = (timestampMs: number) => {
    try {
      return new Date(timestampMs).toLocaleString('en-US', {
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

  const metadataEntries = agent.metadata ? Object.entries(agent.metadata) : [];

  return (
    <div className="glass p-6 sm:p-7 rounded-3xl space-y-6">
      <div className="border-b border-[var(--glass-b)] pb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider font-mono flex items-center gap-2">
          <span>Identity & Configuration</span>
        </h3>
        <span className="text-xs font-mono text-[var(--muted)]">ID: {agent.id.slice(0, 16)}…</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
        {/* Agent ID */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] flex flex-col justify-between space-y-1">
          <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider">Agent ID</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ink)] font-bold truncate" title={agent.id}>
              {agent.id}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(agent.id, 'id')}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
              title="Copy Agent ID"
            >
              {copiedField === 'id' ? '✓' : '⧉'}
            </button>
          </div>
        </div>

        {/* Wallet Address */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] flex flex-col justify-between space-y-1">
          <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider">
            Operational Wallet
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ink)] font-bold truncate" title={agent.walletAddress || 'Server Wallet'}>
              {formatAddress(agent.walletAddress)}
            </span>
            {agent.walletAddress && (
              <button
                type="button"
                onClick={() => copyToClipboard(agent.walletAddress!, 'wallet')}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
                title="Copy Wallet Address"
              >
                {copiedField === 'wallet' ? '✓' : '⧉'}
              </button>
            )}
          </div>
        </div>

        {/* Owner Address */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] flex flex-col justify-between space-y-1">
          <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider">Owner (Admin)</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ink)] font-bold truncate" title={agent.ownerAddress}>
              {formatAddress(agent.ownerAddress)}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(agent.ownerAddress, 'owner')}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
              title="Copy Owner Address"
            >
              {copiedField === 'owner' ? '✓' : '⧉'}
            </button>
          </div>
        </div>

        {/* Creation Timestamp */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] flex flex-col justify-between space-y-1">
          <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider">Registered At</span>
          <span className="text-[var(--ink)] font-bold">{formatDate(agent.createdAt)}</span>
        </div>

        {/* Updated Timestamp */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] flex flex-col justify-between space-y-1">
          <span className="text-[var(--muted)] font-sans text-[11px] uppercase tracking-wider">Last Modified</span>
          <span className="text-[var(--ink)] font-bold">{formatDate(agent.updatedAt)}</span>
        </div>
      </div>

      {/* Metadata Section */}
      {metadataEntries.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--glass-b)]">
          <span className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider block">
            Metadata Attributes
          </span>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {metadataEntries.map(([key, value]) => (
              <span
                key={key}
                className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)]"
              >
                <span className="text-[var(--muted)]">{key}: </span>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
