import React from 'react';
import Link from 'next/link';
import { celoSepoliaChain, celoMainnetChain } from '@/lib/celo/config';
import BlockchainStatusCard from '@/components/BlockchainStatusCard';
import AgentSmartCard from '@/components/landing/AgentSmartCard';
import LiveSettlementFeed from '@/components/landing/LiveSettlementFeed';
import SpendingSimulator from '@/components/landing/SpendingSimulator';

export default function Home() {
  return (
    <div className="space-y-24 py-4 sm:py-8">
      {/* 1. Cinematic Hero Section */}
      <section className="relative pt-6 sm:pt-10 pb-8 text-center max-w-4xl mx-auto space-y-7">
        {/* Ambient Top Glow Mesh */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(252,255,82,0.08)_0%,rgba(16,185,129,0.04)_40%,transparent_70%)] pointer-events-none -z-10 blur-2xl" />

        {/* Protocol Kicker Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 text-xs font-mono font-medium bg-[#141B24]/90 text-[#FCFF52] border border-[#FCFF52]/30 rounded-full shadow-[0_0_24px_-4px_rgba(252,255,82,0.2)]">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span>AUTONOMOUS AGENT LIQUIDITY PROTOCOL · CELO L2</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08]">
          The programmable{' '}
          <span className="text-gradient-celo">
            corporate card
          </span>{' '}
          for autonomous AI agents.
        </h1>

        {/* Narrative Subtitle */}
        <p className="text-base sm:text-xl text-slate-300 leading-relaxed font-normal max-w-2xl mx-auto">
          AI agents are executing real-world work—give them safe, institutional purchasing power.
          Enforce deterministic daily spending ceilings, zero-float cUSD accounting, and
          cryptographic SIWE human-in-the-loop escalation on Celo L2.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          <Link
            href="/dashboard"
            className="px-7 py-4 rounded-xl bg-[#FCFF52] hover:bg-[#F5E68C] text-[#070A0F] font-bold text-sm sm:text-base transition-all shadow-[0_0_30px_-4px_rgba(252,255,82,0.4)] hover:shadow-[0_0_40px_-2px_rgba(252,255,82,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
          >
            Launch Control Plane →
          </Link>
          <a
            href="#simulator"
            className="px-6 py-4 rounded-xl bg-[#141B24]/90 hover:bg-[#1A2330] text-slate-200 border border-[rgba(255,255,255,0.15)] hover:border-[#FCFF52]/40 font-semibold text-sm sm:text-base transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
          >
            Test Spending Sandbox
          </a>
          <Link
            href="/dashboard/agents"
            className="px-5 py-4 rounded-xl bg-transparent hover:bg-white/5 text-slate-400 hover:text-white font-medium text-sm transition-all"
          >
            Registered Agents
          </Link>
        </div>

        {/* Metric Badges Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-white/[0.08] max-w-3xl mx-auto">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] font-mono text-slate-400">Avg Gas per Tx</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">&lt; $0.001</div>
            <div className="text-[10px] text-slate-500">Celo L2 gas fees</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] font-mono text-slate-400">Settlement Asset</div>
            <div className="text-base font-bold text-[#FCFF52] font-mono mt-0.5">cUSD Stablecoin</div>
            <div className="text-[10px] text-slate-500">Zero-float integer cents</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] font-mono text-slate-400">Discretion Latency</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">&lt; 250ms</div>
            <div className="text-[10px] text-slate-500">Deterministic clearance</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] font-mono text-slate-400">Security Model</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">SIWE EIP-4361</div>
            <div className="text-[10px] text-slate-500">Human cryptographic guard</div>
          </div>
        </div>
      </section>

      {/* 2. Interactive 3D Agent Smart Card Showcase */}
      <section className="space-y-6">
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#FCFF52] font-semibold">
            Institutional Hardware & Cryptographic Identity
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Autonomous Agent Smart Card
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Interactive 3D card with hardware security chip, daily budget progress meter, and on-chain contract credentials.
          </p>
        </div>

        <AgentSmartCard />
      </section>

      {/* 3. Live Settlement Stream */}
      <section className="space-y-4">
        <LiveSettlementFeed />
      </section>

      {/* 4. Interactive Policy Simulator */}
      <section id="simulator" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#FCFF52] font-semibold">
              Deterministic Rule Engine
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
              Live Policy Evaluation Simulator
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md">
            Test how autonomous agent purchases are evaluated against hard daily ceilings and multi-tier cryptographic sign-offs.
          </p>
        </div>

        <SpendingSimulator />
      </section>

      {/* 5. Governance Architecture */}
      <section id="flow" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              01 · Autonomous Governance Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
              Deterministic Spending Lifecycle
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md">
            Every transaction is policy-evaluated in real time before on-chain dispatch.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 space-y-3 relative overflow-hidden group hover:border-[#FCFF52]/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#FCFF52]">01. DISCRETION</span>
              <span className="text-[10px] text-slate-500 font-mono">Micro-Allowances</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight">Daily Spending Ceilings</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Enforces hard daily spending caps and single-transaction thresholds with exact zero-float integer math.
            </p>
            <div className="pt-2 text-[10px] font-mono text-emerald-400">Automated Instant Release &lt; $20.00</div>
          </div>

          <div className="glass-panel p-5 space-y-3 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-emerald-400">02. VERIFICATION</span>
              <span className="text-[10px] text-slate-500 font-mono">ERC-8004</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight">Identity & Reputation</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Validates on-chain agent metadata, verified smart contract addresses, and reputation scores before approval.
            </p>
            <div className="pt-2 text-[10px] font-mono text-slate-400">Autonomous Trust Score &gt; 80</div>
          </div>

          <div className="glass-panel p-5 space-y-3 relative overflow-hidden group hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-amber-400">03. ESCALATION</span>
              <span className="text-[10px] text-slate-500 font-mono">SIWE Guard</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight">Cryptographic Queue</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Discretion-exceeding requests queue for authorized human approval. Authenticated via SIWE with zero private key leak risk.
            </p>
            <div className="pt-2 text-[10px] font-mono text-amber-300">Requires EIP-4361 Signature</div>
          </div>

          <div className="glass-panel p-5 space-y-3 relative overflow-hidden group hover:border-emerald-400/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-emerald-400">04. SETTLEMENT</span>
              <span className="text-[10px] text-slate-500 font-mono">Celo L2</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight">Instant cUSD Finality</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Transactions settle deterministically on Celo Sepolia with sub-cent gas fees and immutable block explorer auditability.
            </p>
            <div className="pt-2 text-[10px] font-mono text-emerald-300">Fast Finality · Sub-cent Gas</div>
          </div>
        </div>
      </section>

      {/* 6. Real-time Node Telemetry */}
      <section id="status" aria-label="On-Chain Settlement Telemetry" className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Telemetry & Node Health
          </span>
          <span className="text-xs text-slate-500 font-mono">Celo Sepolia / Mainnet RPC</span>
        </div>
        <BlockchainStatusCard />
      </section>

      {/* 7. Network Architecture Specifications */}
      <section id="architecture" className="space-y-6">
        <div id="overview" className="border-b border-white/[0.08] pb-4">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#FCFF52] font-semibold">
            02 · Multi-Network Target Topology
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Network Environments & Endpoints
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-emerald-400 tracking-tight">Celo Sepolia Testnet</h3>
                <span className="text-xs text-slate-400">Active Development & Testing Environment</span>
              </div>
              <span className="px-2.5 py-0.5 text-xs font-mono font-medium bg-emerald-500/10 text-emerald-300 rounded-full border border-emerald-500/30">
                Active Node
              </span>
            </div>

            <div className="space-y-2 text-xs text-slate-300 font-mono bg-[#070A0F]/90 p-4 rounded-xl border border-white/[0.08]">
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Chain ID:</span>
                <span className="text-white font-bold">{celoSepoliaChain.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Gas Asset:</span>
                <span className="text-emerald-300">CELO (18 Decimals)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Settlement Asset:</span>
                <span className="text-emerald-300">cUSD Stablecoin</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Explorer:</span>
                <a
                  href={celoSepoliaChain.blockExplorers.default.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Blockscout ↗
                </a>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#FCFF52] tracking-tight">Celo Mainnet</h3>
                <span className="text-xs text-slate-400">Production Layer 2 Target</span>
              </div>
              <span className="px-2.5 py-0.5 text-xs font-mono font-medium bg-[#FCFF52]/10 text-[#FCFF52] rounded-full border border-[#FCFF52]/30">
                Ready for Deploy
              </span>
            </div>

            <div className="space-y-2 text-xs text-slate-300 font-mono bg-[#070A0F]/90 p-4 rounded-xl border border-white/[0.08]">
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Chain ID:</span>
                <span className="text-white font-bold">{celoMainnetChain.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Gas Asset:</span>
                <span className="text-[#FCFF52]">CELO</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-slate-400">Finality:</span>
                <span className="text-slate-200">Sub-second L2</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Architecture:</span>
                <span className="text-slate-200">OP Stack Rollup</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
