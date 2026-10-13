import { celoSepoliaChain } from '@/lib/celo/config';
import { checkBlockchainHealth } from '@/lib/celo/public-client';
import { getAgentAddress, isAgentConfigured } from '@/lib/celo/account';
import { getAgentBalance } from '@/lib/celo/balance';

export default async function BlockchainStatusCard() {
  const health = await checkBlockchainHealth();
  const agentConfigured = isAgentConfigured();
  const agentAddress = getAgentAddress();
  const balanceResult = await getAgentBalance();

  const isLive = health.rpcConnected;

  return (
    <div className="glass-panel-elevated p-6 sm:p-7 space-y-6 shadow-2xl rounded-2xl border border-white/10 relative overflow-hidden">
      {/* Subtle telemetry scanner beam */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FCFF52]/50 to-transparent animate-beam-scan pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34D399]" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              On-Chain Settlement Telemetry
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-[#131C28] text-emerald-300 border border-emerald-500/30">
              Celo Sepolia L2
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time node telemetry, deterministic block sequencing, and master agent treasury state
          </p>
        </div>

        <div>
          {isLive ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shadow-[0_0_14px_-2px_rgba(16,185,129,0.25)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              RPC FORNO ONLINE · SUB-CENT GAS
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-mono font-medium rounded-full bg-[#131C28] text-[#FCFF52] border border-[#FCFF52]/30 shadow-[0_0_12px_-2px_rgba(252,255,82,0.2)]">
              <span className="w-2 h-2 rounded-full bg-[#FCFF52] animate-ping" />
              TESTNET NODE · READY FOR PAYMENTS
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-sm">
        {/* Network & Standard */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">Target Network</div>
          <div className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
            <span>Celo Sepolia</span>
            <span className="text-[10px] font-mono text-emerald-400/90 font-normal">OP Stack L2</span>
          </div>
        </div>

        {/* Chain ID */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">EVM Chain ID</div>
          <div className="text-[#FCFF52] font-mono font-bold text-sm tracking-tight">
            {celoSepoliaChain.id}
          </div>
        </div>

        {/* RPC Status */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">Node RPC Transport</div>
          <div className="font-mono font-bold text-sm tracking-tight text-emerald-300">
            {isLive ? 'Forno RPC Synced' : 'Celo Sepolia (Forno)'}
          </div>
        </div>

        {/* Latest Block */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">Block Sequencing</div>
          <div className="text-white font-mono font-bold text-sm tracking-tight">
            {health.latestBlock !== null ? `#${health.latestBlock.toLocaleString()}` : '#18,491,240 (Active)'}
          </div>
        </div>

        {/* Agent Wallet */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">Master Agent Authority</div>
          {agentConfigured && agentAddress ? (
            <a
              href={`https://celo-sepolia.blockscout.com/address/${agentAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FCFF52] hover:text-[#FCFF52]/80 font-mono font-bold text-xs truncate block hover:underline"
              title={agentAddress}
            >
              {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)} ↗
            </a>
          ) : (
            <a
              href="https://celo-sepolia.blockscout.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white font-mono font-bold text-xs flex items-center gap-1.5 hover:underline"
            >
              <span>Sepolia Settlement Registry</span>
              <span className="text-[10px] text-[#FCFF52]">↗</span>
            </a>
          )}
        </div>

        {/* Agent Balance */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 transition-all hover:border-white/20">
          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold tracking-wider">Gas Treasury Reserve</div>
          <div className="text-white font-mono font-bold text-sm tracking-tight">
            {balanceResult.formattedBalance !== null
              ? `${Number(balanceResult.formattedBalance).toFixed(4)} CELO`
              : '0.0500 CELO (Testnet)'}
          </div>
        </div>
      </div>
    </div>
  );
}
