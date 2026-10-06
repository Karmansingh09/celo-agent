import { celoSepoliaChain, celoMainnetChain } from '@/lib/celo/config';
import BlockchainStatusCard from '@/components/BlockchainStatusCard';

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto py-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
          <span>Phase 3 Payment Infrastructure Active</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          Decentralized <span className="text-emerald-400">AI-Agent Marketplace</span> on Celo
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed">
          CeloAgent enables autonomous AI Orchestrators to discover specialized sub-agents, evaluate their on-chain identity & reputation using ERC-8004 standards, and execute verified service transactions on Celo Sepolia.
        </p>
      </section>

      {/* Phase 2 Blockchain Status Card */}
      <section id="status">
        <BlockchainStatusCard />
      </section>

      {/* Network Configuration Badge Cards */}
      <section id="overview" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-emerald-400">Celo Sepolia Testnet</h3>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-emerald-950 text-emerald-300 rounded border border-emerald-700">
              Active Network
            </span>
          </div>
          <div className="space-y-2 text-sm text-slate-300 font-mono bg-slate-900/80 p-4 rounded-lg border border-slate-800">
            <div><span className="text-slate-400">Chain ID:</span> {celoSepoliaChain.id}</div>
            <div><span className="text-slate-400">RPC Endpoint:</span> {celoSepoliaChain.rpcUrls.default.http[0]}</div>
            <div><span className="text-slate-400">Block Explorer:</span> {celoSepoliaChain.blockExplorers.default.url}</div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-amber-400">Celo Mainnet</h3>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-amber-950 text-amber-300 rounded border border-amber-800">
              Modular Ready
            </span>
          </div>
          <div className="space-y-2 text-sm text-slate-300 font-mono bg-slate-900/80 p-4 rounded-lg border border-slate-800">
            <div><span className="text-slate-400">Chain ID:</span> {celoMainnetChain.id}</div>
            <div><span className="text-slate-400">RPC Endpoint:</span> {celoMainnetChain.rpcUrls.default.http[0]}</div>
            <div><span className="text-slate-400">Native Symbol:</span> {celoMainnetChain.nativeCurrency.symbol}</div>
          </div>
        </div>
      </section>

      {/* Core Flow Overview */}
      <section id="flow" className="p-8 rounded-2xl bg-slate-800/40 border border-slate-700/50 space-y-6">
        <h2 className="text-2xl font-bold text-white">MVP Core Execution Flow</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="text-emerald-400 text-sm font-bold">01. Discovery</div>
            <h4 className="font-semibold text-white">Agent Search</h4>
            <p className="text-xs text-slate-400">Main AI Agent queries ERC-8004 identity registry for matching sub-agents.</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="text-emerald-400 text-sm font-bold">02. Inspection</div>
            <h4 className="font-semibold text-white">Trust Verification</h4>
            <p className="text-xs text-slate-400">Inspects ERC-8004 tokenURI metadata card and on-chain reputation rating.</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="text-emerald-400 text-sm font-bold">03. Approval</div>
            <h4 className="font-semibold text-white">User Sign-off</h4>
            <p className="text-xs text-slate-400">Interactive UI modal presents fee details and gas estimate for user authorization.</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="text-emerald-400 text-sm font-bold">04. Execution</div>
            <h4 className="font-semibold text-white">On-chain Settlement</h4>
            <p className="text-xs text-slate-400">Backend agent wallet executes transaction on Celo Sepolia and records feedback.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
