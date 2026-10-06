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
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
    <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-6">
      <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span>Identity & Configuration</span>
        </h3>
        <span className="text-xs font-mono text-slate-400">ID: {agent.id.slice(0, 16)}...</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
        {/* Agent ID */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
          <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Agent ID</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white truncate" title={agent.id}>
              {agent.id}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(agent.id, 'id')}
              className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors p-1"
              title="Copy Agent ID"
            >
              {copiedField === 'id' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Owner Address */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
          <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Owner Address</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white" title={agent.ownerAddress}>
              {formatAddress(agent.ownerAddress)}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(agent.ownerAddress, 'owner')}
              className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors p-1"
              title="Copy Owner Address"
            >
              {copiedField === 'owner' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Agent Wallet Address */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
          <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Agent Wallet</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white" title={agent.walletAddress || 'Default Backend Wallet'}>
              {formatAddress(agent.walletAddress)}
            </span>
            {agent.walletAddress && (
              <button
                type="button"
                onClick={() => copyToClipboard(agent.walletAddress!, 'wallet')}
                className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors p-1"
                title="Copy Wallet Address"
              >
                {copiedField === 'wallet' ? '✓' : '📋'}
              </button>
            )}
          </div>
        </div>

        {/* Status Reason if present */}
        {agent.statusReason ? (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
            <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Status Note</span>
            <span className="text-amber-300 font-sans truncate" title={agent.statusReason}>
              {agent.statusReason}
            </span>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
            <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Operational Mode</span>
            <span className="text-slate-300 font-sans">Self-governed autonomous agent</span>
          </div>
        )}

        {/* Created Timestamp */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
          <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Created</span>
          <span className="text-slate-200">{formatDate(agent.createdAt)}</span>
        </div>

        {/* Updated Timestamp */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-1">
          <span className="text-slate-400 font-sans text-[11px] uppercase tracking-wider">Last Modified</span>
          <span className="text-slate-200">{formatDate(agent.updatedAt)}</span>
        </div>
      </div>

      {/* Optional Metadata Section */}
      {metadataEntries.length > 0 && (
        <div className="pt-2 border-t border-slate-700/60 space-y-2">
          <span className="text-[11px] font-sans text-slate-400 uppercase tracking-wider block">
            Custom Metadata ({metadataEntries.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {metadataEntries.map(([key, val]) => (
              <span
                key={key}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300"
              >
                <span className="text-emerald-400">{key}</span>: {val}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
