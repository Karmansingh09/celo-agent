'use client';

import React, { useState, useRef } from 'react';

export interface AgentCardTier {
  id: string;
  name: string;
  role: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  spent: string;
  limit: string;
  percent: number;
  contract: string;
  skinClass: string;
  accentColor: string;
  tag: string;
}

export const CARD_TIERS: AgentCardTier[] = [
  {
    id: 'claude',
    name: 'CLAUDE-ORCHESTRATOR-01',
    role: 'Core AI Workflow Orchestration',
    cardNumber: '4804  8821  0092  3184',
    expiry: '10/28',
    cvv: '804',
    spent: '18.40',
    limit: '50.00',
    percent: 36.8,
    contract: '0x89C4...bA12',
    skinClass: 'card-visa-metallic',
    accentColor: '#FCFF52',
    tag: 'Obsidian Executive',
  },
  {
    id: 'auditor',
    name: 'CODE-AUDITOR-WORKER',
    role: 'Automated Smart Contract Audit',
    cardNumber: '4804  3319  7740  9152',
    expiry: '12/27',
    cvv: '915',
    spent: '6.20',
    limit: '40.00',
    percent: 15.5,
    contract: '0x32F1...e99C',
    skinClass: 'card-skin-emerald',
    accentColor: '#10B981',
    tag: 'Emerald Operator',
  },
  {
    id: 'sentinel',
    name: 'ARBITRAGE-SENTINEL-PRO',
    role: 'Cross-DEX Liquidity Balancing',
    cardNumber: '4804  9902  1158  6630',
    expiry: '08/29',
    cvv: '630',
    spent: '64.50',
    limit: '100.00',
    percent: 64.5,
    contract: '0x71C9...89E4',
    skinClass: 'card-skin-gold',
    accentColor: '#FCFF52',
    tag: 'Champagne Treasury',
  },
];

export default function AgentSmartCard() {
  const [activeTier, setActiveTier] = useState<AgentCardTier>(CARD_TIERS[0]);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = -((y - centerY) / centerY) * 12;
    const rotY = ((x - centerX) / centerX) * 14;

    setRotate({ x: rotX, y: rotY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.25,
    });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
    setGlare({ x: 50, y: 50, opacity: 0 });
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center space-y-6">
      {/* Tier Switcher & Flip Control */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
          {CARD_TIERS.map((tier) => (
            <button
              key={tier.id}
              onClick={() => setActiveTier(tier)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                activeTier.id === tier.id
                  ? 'bg-white/15 text-white shadow-md border border-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tier.tag}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono font-semibold text-slate-200 border border-white/15 transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCFF52]"
          title="Click to flip between front and back"
        >
          <svg className="w-3.5 h-3.5 text-[#FCFF52]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>{isFlipped ? 'Show Front' : 'Flip to Back'}</span>
        </button>
      </div>

      {/* 3D Perspective Card Stage */}
      <div className="perspective-card w-full flex justify-center py-2">
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => setIsFlipped(!isFlipped)}
          style={{
            transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y + (isFlipped ? 180 : 0)}deg)`,
            transition: 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="preserve-3d relative w-full aspect-[1.586/1] max-w-[480px] sm:max-w-[500px] rounded-3xl cursor-pointer select-none group shadow-[0_25px_70px_-15px_rgba(0,0,0,0.9)]"
        >
          {/* ================= FRONT OF CARD ================= */}
          <div
            className={`backface-hidden absolute inset-0 rounded-3xl p-6 sm:p-8 flex flex-col justify-between overflow-hidden ${activeTier.skinClass}`}
          >
            {/* Dynamic Cursor Glare */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, ${glare.opacity}) 0%, transparent 60%)`,
              }}
            />

            {/* Top Bar: Holographic Chip, Contactless Icon, & Celo Branding */}
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-3.5">
                {/* Gold Contact Chip */}
                <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-[#FFE79A] via-[#FCFF52] to-[#B89225] p-0.5 shadow-lg border border-[#FFF5B8]/50 animate-chip-shimmer relative overflow-hidden">
                  <div className="w-full h-full rounded-[6px] border border-black/25 flex flex-col justify-between py-1 px-1.5">
                    <div className="h-[1px] bg-black/25 w-full" />
                    <div className="flex justify-between items-center h-2">
                      <div className="w-1.5 h-full border border-black/25 rounded-sm" />
                      <div className="w-1.5 h-full border border-black/25 rounded-sm" />
                    </div>
                    <div className="h-[1px] bg-black/25 w-full" />
                  </div>
                </div>

                {/* Contactless Signal Waves */}
                <svg
                  className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                  <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                  <path d="M15.5 21.5a12 12 0 0 0 0-19" />
                </svg>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold tracking-wider text-white">
                    CELO L2
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mt-0.5">
                  Autonomous Corporate
                </span>
              </div>
            </div>

            {/* Middle: 16-Digit Card Number with Tactile Letter-Spacing */}
            <div className="relative z-10 my-1">
              <div className="font-mono text-xl sm:text-2xl font-extrabold tracking-[0.22em] text-white/95 drop-shadow-md">
                {activeTier.cardNumber}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-slate-400">
                <span>SMART TREASURY ACCOUNT</span>
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 font-semibold">ERC-8004 VERIFIED</span>
              </div>
            </div>

            {/* Daily Allowance Meter */}
            <div className="relative z-10 bg-black/40 rounded-xl p-2.5 sm:p-3 border border-white/10 backdrop-blur-md">
              <div className="flex justify-between items-center text-[10px] sm:text-xs font-mono mb-1.5">
                <span className="text-slate-400">Daily Policy Ceiling</span>
                <span className="text-white font-bold">
                  <span className="text-emerald-400 font-mono">{activeTier.spent}</span> / {activeTier.limit} cUSD
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(252,255,82,0.6)]"
                  style={{
                    width: `${activeTier.percent}%`,
                    backgroundColor: activeTier.accentColor,
                  }}
                />
              </div>
            </div>

            {/* Bottom Row: Agent Name, Expiry, and Brand Hologram */}
            <div className="flex items-end justify-between relative z-10 pt-1">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">
                  Cardholder Agent
                </div>
                <div className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide mt-0.5">
                  {activeTier.name}
                </div>
              </div>

              <div className="text-center px-2">
                <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">
                  Valid Thru
                </div>
                <div className="font-mono text-xs font-semibold text-slate-200 mt-0.5">
                  {activeTier.expiry}
                </div>
              </div>

              <div className="text-right">
                <div className="text-base sm:text-lg font-extrabold italic tracking-wider bg-gradient-to-r from-white via-slate-200 to-[#FCFF52] bg-clip-text text-transparent font-sans">
                  AGENT VISA
                </div>
              </div>
            </div>
          </div>

          {/* ================= BACK OF CARD ================= */}
          <div
            className={`backface-hidden rotate-y-180 absolute inset-0 rounded-3xl pt-6 pb-6 px-6 sm:px-8 flex flex-col justify-between overflow-hidden ${activeTier.skinClass}`}
          >
            {/* Magnetic Stripe */}
            <div className="-mx-8 h-12 bg-black/95 border-y border-white/15 relative z-10 shadow-inner flex items-center px-8">
              <div className="w-full h-2 bg-white/5 rounded-full" />
            </div>

            {/* Signature Strip & CVV */}
            <div className="relative z-10 my-2 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-9 rounded-lg bg-white/90 text-black font-mono text-xs italic flex items-center px-3 tracking-widest font-semibold border border-white/20 select-all">
                  SHA256: 9F8A...21D0
                </div>
                <div className="w-16 h-9 rounded-lg bg-black/60 border border-white/20 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-mono text-slate-400">CVV</span>
                  <span className="font-mono text-xs font-bold text-[#FCFF52]">{activeTier.cvv}</span>
                </div>
              </div>

              {/* On-Chain Smart Contract Details */}
              <div className="p-2.5 rounded-xl bg-black/45 border border-white/10 font-mono text-[10px] space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Contract Address:</span>
                  <span className="text-emerald-400 font-bold">{activeTier.contract}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Network:</span>
                  <span className="text-white">Celo Sepolia (Chain 11142220)</span>
                </div>
              </div>
            </div>

            {/* Back Disclaimer */}
            <div className="relative z-10 text-[9px] font-mono text-slate-400/90 leading-tight">
              Authorized for autonomous programmatic transactions under deterministic policy rules.
              Single transactions above ceiling require cryptographic human-in-the-loop SIWE signoff.
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#FCFF52]" />
        <span>Click card to inspect front / back security parameters</span>
      </div>
    </div>
  );
}
