'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface AgentProfile {
  id: string;
  name: string;
  role: string;
  perTxLimit: number;
  dailyLimit: number;
  spentToday: number;
}

const AGENTS: AgentProfile[] = [
  {
    id: 'agent-1',
    name: 'Claude-Orchestrator-01',
    role: 'Core AI Workflow Orchestration',
    perTxLimit: 25.0,
    dailyLimit: 100.0,
    spentToday: 32.5,
  },
  {
    id: 'agent-2',
    name: 'Code-Auditor-Worker',
    role: 'Automated Smart Contract Analysis',
    perTxLimit: 12.0,
    dailyLimit: 40.0,
    spentToday: 18.4,
  },
  {
    id: 'agent-3',
    name: 'Data-Scraper-Sentinel',
    role: 'Market Depth & Oracle Feed Ingestion',
    perTxLimit: 6.0,
    dailyLimit: 20.0,
    spentToday: 4.8,
  },
];

export default function SpendingSimulator() {
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile>(AGENTS[0]);
  const [amount, setAmount] = useState<number>(14.5);
  const [purpose, setPurpose] = useState<string>('Anthropic Claude 3.5 API inference batch');
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    status: 'auto-approved' | 'escalated';
    reason: string;
    details: string;
  } | null>({
    status: 'auto-approved',
    reason: 'Under Single-Tx Limit (14.50 cUSD ≤ 25.00 cUSD)',
    details: 'Zero human friction. Evaluated deterministically with zero-float integer arithmetic and instant settlement on Celo Sepolia.',
  });

  const handleSimulate = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      if (amount <= selectedAgent.perTxLimit && selectedAgent.spentToday + amount <= selectedAgent.dailyLimit) {
        setEvaluationResult({
          status: 'auto-approved',
          reason: `Under Single-Tx Limit (${amount.toFixed(2)} cUSD ≤ ${selectedAgent.perTxLimit.toFixed(2)} cUSD)`,
          details: 'Zero human friction. Evaluated deterministically with zero-float integer arithmetic and instant settlement on Celo Sepolia.',
        });
      } else {
        const breachReason =
          amount > selectedAgent.perTxLimit
            ? `Single-Tx Cap Exceeded (${amount.toFixed(2)} cUSD > ${selectedAgent.perTxLimit.toFixed(2)} cUSD)`
            : `Daily Budget Exceeded (${(selectedAgent.spentToday + amount).toFixed(2)} cUSD > ${selectedAgent.dailyLimit.toFixed(2)} cUSD)`;

        setEvaluationResult({
          status: 'escalated',
          reason: breachReason,
          details:
            'Cryptographic guardrail triggered. Transaction is queued for owner SIWE multi-signoff with zero client-side wallet key exposure.',
        });
      }
      setIsEvaluating(false);
    }, 350);
  };

  return (
    <div className="glass-panel-elevated rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden border border-white/10">
      {/* Background ambient flare */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[radial-gradient(ellipse_at_top_right,rgba(252,255,82,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.08] relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#131C28] text-[#FCFF52] border border-[#FCFF52]/30">
              Interactive Policy Sandbox
            </span>
            <span className="text-xs text-slate-400 font-mono">Zero-Float Engine</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight mt-1">
            Simulate Autonomous Spending Request
          </h3>
        </div>

        <Link
          href="/dashboard"
          className="text-xs font-mono font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 group self-start sm:self-auto"
        >
          <span>Open Live Control Plane</span>
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Controls Column (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Agent Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-300 font-semibold uppercase tracking-wider block">
              1. Select Autonomous Agent
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {AGENTS.map((agent) => {
                const isSelected = selectedAgent.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setEvaluationResult(null);
                    }}
                    className={`p-3 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-[rgba(252,255,82,0.08)] border-[#FCFF52]/50 shadow-[0_0_16px_-4px_rgba(252,255,82,0.25)]'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white truncate">{agent.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      Cap: <span className="text-[#FCFF52] font-semibold">{agent.perTxLimit} cUSD</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Slider & Presets */}
          <div className="space-y-3 p-4 rounded-xl bg-black/30 border border-white/[0.08]">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-mono text-slate-300 font-semibold uppercase tracking-wider">
                2. Spending Request Amount
              </label>
              <div className="text-right">
                <span className="text-xl font-mono font-extrabold text-[#FCFF52] tabular-nums">
                  {amount.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1.5 font-semibold">cUSD</span>
              </div>
            </div>

            <input
              type="range"
              min="1"
              max="100"
              step="0.5"
              value={amount}
              onChange={(e) => {
                setAmount(parseFloat(e.target.value));
                setEvaluationResult(null);
              }}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FCFF52]"
            />

            {/* Quick Presets */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[10px] font-mono text-slate-500">Presets:</span>
              {[4.5, 12.0, 25.0, 65.0, 95.0].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setAmount(val);
                    setEvaluationResult(null);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                    amount === val
                      ? 'bg-[#FCFF52]/20 text-[#FCFF52] border border-[#FCFF52]/40 font-bold'
                      : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  {val.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={handleSimulate}
            disabled={isEvaluating}
            className="w-full py-3 px-5 rounded-xl bg-[rgba(252,255,82,0.15)] hover:bg-[rgba(252,255,82,0.25)] text-[#FCFF52] border border-[#FCFF52]/40 font-semibold text-xs tracking-wider transition-all shadow-[0_0_20px_-4px_rgba(252,255,82,0.3)] hover:shadow-[0_0_24px_-2px_rgba(252,255,82,0.45)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isEvaluating ? (
              <>
                <span className="w-4 h-4 border-2 border-[#FCFF52] border-t-transparent rounded-full animate-spin" />
                <span>Evaluating Policy Rules...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Evaluate Deterministic Policy Rules</span>
              </>
            )}
          </button>
        </div>

        {/* Live Policy Evaluation Result (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md space-y-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Policy Engine Decision
            </div>

            {evaluationResult ? (
              <div
                className={`p-4 rounded-xl border transition-all ${
                  evaluationResult.status === 'auto-approved'
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 shadow-[0_0_20px_-4px_rgba(16,185,129,0.2)]'
                    : 'bg-[#FCFF52]/10 border-[#FCFF52]/35 text-[#FCFF52] shadow-[0_0_20px_-4px_rgba(252,255,82,0.2)]'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span>{evaluationResult.status === 'auto-approved' ? '✓' : '🛡️'}</span>
                  <span>
                    {evaluationResult.status === 'auto-approved'
                      ? 'DISCRETIONARY AUTO-APPROVED'
                      : 'ESCALATED TO SIWE QUEUE'}
                  </span>
                </div>
                <div className="text-xs font-mono font-semibold mt-1.5 opacity-90">
                  {evaluationResult.reason}
                </div>
                <p className="text-[11px] text-slate-300 mt-2 leading-relaxed opacity-80">
                  {evaluationResult.details}
                </p>
              </div>
            ) : (
              <div className="p-8 text-center text-xs font-mono text-slate-500 border border-dashed border-white/10 rounded-xl">
                Select an amount & click &quot;Evaluate Deterministic Policy Rules&quot; to test the engine.
              </div>
            )}
          </div>

          {/* Micro Telemetry Metrics */}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-white/[0.08] pt-3 text-slate-400">
            <div>
              <span className="text-slate-500 block">EST. SETTLEMENT GAS</span>
              <span className="text-white font-bold">&lt; 0.0005 CELO</span>
            </div>
            <div>
              <span className="text-slate-500 block">FINALITY TARGET</span>
              <span className="text-emerald-400 font-bold">&lt; 1 Second L2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
