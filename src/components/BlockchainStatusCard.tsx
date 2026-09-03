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
    <div className="p-6 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white">Celo Blockchain Status</h3>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              Phase 2 Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time Celo Sepolia connectivity & agent account status
          </p>
        </div>

        <div>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE TESTNET DATA
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              DISCONNECTED
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm font-mono">
        {/* Network */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Network</div>
          <div className="text-white font-bold text-base">Celo Sepolia</div>
        </div>

        {/* Chain ID */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Chain ID</div>
          <div className="text-emerald-400 font-bold text-base">{celoSepoliaChain.id}</div>
        </div>

        {/* RPC Status */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">RPC Status</div>
          <div className={`font-bold text-base ${isLive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isLive ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Latest Block */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Latest Block</div>
          <div className="text-white font-bold text-base">
            {health.latestBlock !== null ? health.latestBlock.toString() : '—'}
          </div>
        </div>

        {/* Agent Wallet */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Agent Wallet</div>
          {agentConfigured && agentAddress ? (
            <div className="text-emerald-400 font-bold text-xs truncate" title={agentAddress}>
              {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)}
            </div>
          ) : (
            <div className="text-amber-400/90 font-bold text-xs">
              Agent wallet not configured
            </div>
          )}
        </div>

        {/* Agent Balance */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Agent Balance</div>
          <div className="text-white font-bold text-base">
            {balanceResult.formattedBalance !== null
              ? `${Number(balanceResult.formattedBalance).toFixed(4)} CELO`
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
