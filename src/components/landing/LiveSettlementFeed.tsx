'use client';

import React, { useState, useEffect } from 'react';

interface SettlementTx {
  id: string;
  agentName: string;
  service: string;
  category: string;
  amount: string;
  token: string;
  status: 'Instant Discretionary' | 'SIWE Escalated';
  gasFee: string;
  timeAgo: string;
  blockNumber: number;
}

const INITIAL_TRANSACTIONS: SettlementTx[] = [
  {
    id: 'tx-1',
    agentName: 'Claude-Orchestrator-01',
    service: 'Anthropic Claude 3.5 Sonnet API',
    category: 'LLM Inference',
    amount: '1.20',
    token: 'cUSD',
    status: 'Instant Discretionary',
    gasFee: '< $0.0003',
    timeAgo: '4s ago',
    blockNumber: 24891024,
  },
  {
    id: 'tx-2',
    agentName: 'Code-Auditor-Worker',
    service: 'Pinecone Vector DB Index Search',
    category: 'Memory Embeddings',
    amount: '0.45',
    token: 'cUSD',
    status: 'Instant Discretionary',
    gasFee: '< $0.0002',
    timeAgo: '18s ago',
    blockNumber: 24891019,
  },
  {
    id: 'tx-3',
    agentName: 'Model-FineTuner-Pro',
    service: 'RunPod H100 80GB GPU Training Slice',
    category: 'Cloud Compute',
    amount: '85.00',
    token: 'cUSD',
    status: 'SIWE Escalated',
    gasFee: '< $0.0005',
    timeAgo: '1m ago',
    blockNumber: 24890998,
  },
  {
    id: 'tx-4',
    agentName: 'Arbitrage-Sentinel',
    service: 'Dune Analytics Subgraph Realtime Feed',
    category: 'Data Oracle',
    amount: '0.80',
    token: 'cUSD',
    status: 'Instant Discretionary',
    gasFee: '< $0.0002',
    timeAgo: '2m ago',
    blockNumber: 24890985,
  },
  {
    id: 'tx-5',
    agentName: 'Claude-Orchestrator-01',
    service: 'Tavily Search API Web Verification',
    category: 'Web Retrieval',
    amount: '0.15',
    token: 'cUSD',
    status: 'Instant Discretionary',
    gasFee: '< $0.0002',
    timeAgo: '3m ago',
    blockNumber: 24890970,
  },
];

export default function LiveSettlementFeed() {
  const [filter, setFilter] = useState<'all' | 'discretionary' | 'escalated'>('all');

  const filteredTxs = INITIAL_TRANSACTIONS.filter((tx) => {
    if (filter === 'discretionary') return tx.status === 'Instant Discretionary';
    if (filter === 'escalated') return tx.status === 'SIWE Escalated';
    return true;
  });

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-5 border border-white/10 shadow-2xl relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-[radial-gradient(circle,rgba(252,255,82,0.04)_0%,transparent_70%)] pointer-events-none" />

      {/* Feed Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08] relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Real-Time Autonomous Settlement Ledger
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Live Celo Sepolia block stream with zero-float cUSD accounting
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 self-start sm:self-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              filter === 'all'
                ? 'bg-white/15 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Stream
          </button>
          <button
            onClick={() => setFilter('discretionary')}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              filter === 'discretionary'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Discretionary
          </button>
          <button
            onClick={() => setFilter('escalated')}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              filter === 'escalated'
                ? 'bg-[#FCFF52]/20 text-[#FCFF52] font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SIWE Escalated
          </button>
        </div>
      </div>

      {/* Transaction List with generous breathing room */}
      <div className="space-y-3 relative z-10">
        {filteredTxs.map((tx) => {
          const isAuto = tx.status === 'Instant Discretionary';
          return (
            <div
              key={tx.id}
              className="p-4 rounded-xl bg-[#070A0F]/60 hover:bg-[#0E1520]/80 border border-white/[0.07] hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
            >
              {/* Left Details */}
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isAuto
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-[#FCFF52]/10 border-[#FCFF52]/30 text-[#FCFF52]'
                  }`}
                >
                  {isAuto ? '⚡' : '🛡️'}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white group-hover:text-[#FCFF52] transition-colors truncate">
                      {tx.service}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-slate-300 border border-white/10">
                      {tx.category}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 mt-1">
                    <span className="text-slate-300 font-medium">{tx.agentName}</span>
                    <span>·</span>
                    <span className="text-slate-500">Block #{tx.blockNumber}</span>
                    <span>·</span>
                    <span className="text-slate-500">{tx.timeAgo}</span>
                  </div>
                </div>
              </div>

              {/* Right Financial & Settlement Details */}
              <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-white/[0.05]">
                <div className="text-left md:text-right">
                  <div className="text-base font-mono font-bold text-white tracking-tight">
                    {tx.amount}{' '}
                    <span className="text-xs text-slate-400 font-normal">{tx.token}</span>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400">
                    Gas: {tx.gasFee}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
                      isAuto
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)]'
                        : 'bg-[#FCFF52]/10 text-[#FCFF52] border-[#FCFF52]/40 shadow-[0_0_12px_-2px_rgba(252,255,82,0.3)]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isAuto ? 'bg-emerald-400' : 'bg-[#FCFF52] animate-ping'
                      }`}
                    />
                    <span>{tx.status}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
