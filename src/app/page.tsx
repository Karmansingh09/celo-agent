import React from 'react';
import Link from 'next/link';
import ReferenceHeroStage from '@/components/landing/ReferenceHeroStage';
import ReferenceSpendingJourney from '@/components/landing/ReferenceSpendingJourney';
import BlockchainStatusCard from '@/components/BlockchainStatusCard';

export default function Home() {
  return (
    <div className="space-y-16 sm:space-y-24">
      {/* 1. Hero Section matching reference */}
      <section className="hero grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center pt-8 sm:pt-16 pb-12">
        <div className="lg:col-span-6 space-y-6">
          <div className="tagline glass">
            <span className="pulse" />
            <span>Spending controls · Celo Sepolia testnet</span>
          </div>

          <h1 id="h1" className="tracking-tight">
            <span className="word">Let</span> <span className="word">agents</span>{' '}
            <span className="word">
              <em>spend.</em>
            </span>
            <br />
            <span className="word">Keep</span> <span className="word">the</span>{' '}
            <span className="word">last</span>{' '}
            <span className="word">
              <em>word.</em>
            </span>
          </h1>

          <p className="lede text-base sm:text-lg text-[var(--muted)] leading-relaxed max-w-lg">
            Set a budget, a recipient list and an approval threshold for each AI agent. Anything
            outside the rules waits for you.
          </p>

          <div className="cta flex items-center gap-3 pt-2">
            <Link href="/dashboard" className="btn solid">
              Launch control plane
            </Link>
            <a href="#journey" className="btn">
              Watch a request
            </a>
          </div>
        </div>

        {/* 3D Card Deck Stage */}
        <div className="lg:col-span-6 w-full max-w-xl mx-auto lg:mr-0">
          <ReferenceHeroStage />
        </div>
      </section>

      {/* 2. Marquee Ticker Ribbon matching reference */}
      <div className="tick -mx-4 sm:-mx-6" aria-hidden="true">
        <div className="tk">
          <span>maxPerTransaction</span>
          <span>maxPerDay · UTC window</span>
          <span>allowedRecipients</span>
          <span>autoApproveThreshold</span>
          <span>idempotency keys</span>
          <span>pause · resume · terminate</span>
          <span>approve → re-evaluate</span>
          <span>uncertain → hold for reconciliation</span>
          {/* Duplicate for continuous seamless marquee */}
          <span>maxPerTransaction</span>
          <span>maxPerDay · UTC window</span>
          <span>allowedRecipients</span>
          <span>autoApproveThreshold</span>
          <span>idempotency keys</span>
          <span>pause · resume · terminate</span>
          <span>approve → re-evaluate</span>
          <span>uncertain → hold for reconciliation</span>
        </div>
      </div>

      {/* 3. Three Levers Section (#controls) */}
      <section id="controls" className="py-12 sm:py-16">
        <div className="wrap space-y-8">
          <div>
            <h2>Three levers. All yours.</h2>
            <p className="sub text-[var(--muted)] max-w-xl text-base mt-2">
              Every request is checked against the agent&apos;s policy on the server before any budget is reserved.
            </p>
          </div>

          <div className="three">
            <article className="glass feat">
              <span className="n">01</span>
              <h3>Spending policy</h3>
              <p>
                Per-transaction and daily limits, an allowed-recipient list, an expiry date, and a
                threshold for auto-approval.
              </p>
            </article>

            <article className="glass feat">
              <span className="n">02</span>
              <h3>Approval queue</h3>
              <p>
                Larger requests wait for you. Approving triggers a fresh policy and budget check
                before anything is executed.
              </p>
            </article>

            <article className="glass feat">
              <span className="n">03</span>
              <h3>Lifecycle</h3>
              <p>
                Pause an agent to block new spending at once, resume it later, or terminate it for
                good.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 4. Six Steps Spending Journey (#journey) */}
      <ReferenceSpendingJourney />

      {/* 5. Real-Time Blockchain Telemetry */}
      <section className="wrap space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted)] font-semibold">
            On-Chain Node Telemetry
          </span>
          <span className="text-xs text-[var(--muted)] font-mono">Celo Sepolia / Mainnet RPC</span>
        </div>
        <BlockchainStatusCard />
      </section>

      {/* 6. Final Call to Action */}
      <div className="wrap">
        <div className="glass final text-center p-8 sm:p-14 space-y-4 rounded-3xl">
          <h2 className="mx-auto">Set the limits before the agent spends.</h2>
          <p className="sub mx-auto text-[var(--muted)] max-w-md">
            Connect a wallet, register an agent, define its policy.
          </p>
          <div className="cta flex justify-center pt-2">
            <Link href="/dashboard" className="btn solid">
              Launch control plane
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
