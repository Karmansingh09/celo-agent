'use client';

import { useState, useEffect } from 'react';

export type PaymentUIState = 'idle' | 'review' | 'submitting' | 'confirmed' | 'failed';

export interface HealthInfo {
  agentConfigured: boolean;
  agentAddress: string | null;
  network: string;
  chainId: number;
}

export default function PaymentDemoCard() {
  const [uiState, setUiState] = useState<PaymentUIState>('idle');
  const [recipient, setRecipient] = useState<string>('');
  const [amountCelo, setAmountCelo] = useState<string>('0.01');
  const [purpose, setPurpose] = useState<string>('Testnet service payment');
  
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  const maxLimit = '0.01'; // Safe testnet spending cap

  // Fetch server health on client mount
  useEffect(() => {
    fetch('/api/health/celo')
      .then((res) => res.json())
      .then((data) => {
        setHealth({
          agentConfigured: !!data.agentConfigured,
          agentAddress: data.agentAddress || null,
          network: data.network || 'sepolia',
          chainId: data.chainId || 11142220,
        });
      })
      .catch(() => {
        setHealth({
          agentConfigured: false,
          agentAddress: null,
          network: 'sepolia',
          chainId: 11142220,
        });
      });
  }, []);

  const validateClientInput = (): boolean => {
    setClientError(null);
    const trimmedTo = recipient.trim();
    if (!trimmedTo) {
      setClientError('Recipient address is required');
      return false;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedTo)) {
      setClientError('Invalid EVM address format (Must be 0x followed by 40 hex characters)');
      return false;
    }

    const trimmedAmt = amountCelo.trim();
    if (!trimmedAmt || !/^\d+(\.\d+)?$/.test(trimmedAmt)) {
      setClientError('Amount must be a positive decimal number');
      return false;
    }

    const numAmt = Number(trimmedAmt);
    if (isNaN(numAmt) || numAmt <= 0) {
      setClientError('Amount must be greater than 0');
      return false;
    }

    if (numAmt > Number(maxLimit)) {
      setClientError(`Amount exceeds maximum spending limit of ${maxLimit} CELO`);
      return false;
    }

    return true;
  };

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateClientInput()) {
      setUiState('review');
    }
  };

  const handleConfirmPayment = async () => {
    if (uiState === 'submitting') return; // Double-submission guard

    setUiState('submitting');
    setServerError(null);

    try {
      const res = await fetch('/api/payments/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient.trim(),
          amountCelo: amountCelo.trim(),
          purpose: purpose.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTxHash(data.txHash || null);
        setExplorerUrl(data.explorerUrl || null);
        setUiState('confirmed');
      } else {
        setServerError(data.error || 'Payment execution failed on server');
        setUiState('failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network request failed';
      setServerError(msg);
      setUiState('failed');
    }
  };

  const handleReset = () => {
    setUiState('idle');
    setClientError(null);
    setServerError(null);
    setTxHash(null);
    setExplorerUrl(null);
  };

  const isConfigured = health?.agentConfigured;
  const agentAddr = health?.agentAddress;

  return (
    <div className="p-6 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-6 shadow-xl max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-700 pb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Celo Sepolia Payment Demo</span>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              Phase 3 Active
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Server-controlled native CELO transfer with spending cap enforcement
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-slate-900 text-slate-300 border border-slate-700">
          Max: {maxLimit} CELO
        </span>
      </div>

      {/* Agent Account Summary */}
      <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div>
          <span className="text-slate-400">Agent Wallet: </span>
          {isConfigured && agentAddr ? (
            <span className="text-emerald-400 font-bold">{agentAddr}</span>
          ) : (
            <span className="text-amber-400 font-bold">Not configured</span>
          )}
        </div>
        <div>
          <span className="text-slate-400">Network: </span>
          <span className="text-slate-200 font-bold">Celo Sepolia (11142220)</span>
        </div>
      </div>

      {/* Client Error Alert */}
      {clientError && (
        <div className="p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-sans">
          ⚠️ {clientError}
        </div>
      )}

      {/* IDLE STATE FORM */}
      {uiState === 'idle' && (
        <form onSubmit={handleReview} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Recipient Address (0x...)
            </label>
            <input
              type="text"
              placeholder="0x1234567890abcdef1234567890abcdef12345678"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Amount (CELO)
              </label>
              <input
                type="text"
                placeholder="0.01"
                value={amountCelo}
                onChange={(e) => setAmountCelo(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Purpose / Memo
              </label>
              <input
                type="text"
                placeholder="Service fee"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!isConfigured}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 font-semibold text-white text-sm transition-colors shadow"
          >
            {isConfigured ? 'Review Payment' : 'Agent Wallet Not Configured'}
          </button>
        </form>
      )}

      {/* CONFIRMATION REVIEW STEP */}
      {uiState === 'review' && (
        <div className="space-y-4 p-4 rounded-lg bg-slate-900/90 border border-emerald-500/40">
          <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wide">
            Confirm Payment Review
          </h4>
          <div className="space-y-2 text-xs font-mono text-slate-300">
            <div className="flex justify-between border-b border-slate-800 pb-1">
              <span className="text-slate-400">Amount:</span>
              <span className="text-white font-bold">{amountCelo} CELO</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1">
              <span className="text-slate-400">To Recipient:</span>
              <span className="text-emerald-400 font-bold truncate max-w-[240px]">{recipient}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1">
              <span className="text-slate-400">Network:</span>
              <span className="text-white font-bold">Celo Sepolia (Chain ID 11142220)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1">
              <span className="text-slate-400">Purpose:</span>
              <span className="text-slate-200">{purpose || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Agent Wallet:</span>
              <span className="text-slate-300 truncate max-w-[240px]">{agentAddr}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirmPayment}
              className="flex-1 py-2 px-4 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
            >
              Confirm & Execute Payment
            </button>
            <button
              onClick={() => setUiState('idle')}
              className="py-2 px-4 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SUBMITTING / PENDING STATE */}
      {uiState === 'submitting' && (
        <div className="py-8 text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold text-white">
            Processing Celo Sepolia Payment...
          </div>
          <p className="text-xs text-slate-400">
            Sending transaction and waiting for block confirmation
          </p>
        </div>
      )}

      {/* CONFIRMED SUCCESS STATE */}
      {uiState === 'confirmed' && (
        <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/50 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <span>✅ Transaction Confirmed on Celo Sepolia!</span>
          </div>
          <div className="space-y-1 text-xs font-mono text-slate-300">
            <div><span className="text-slate-400">Transaction Hash:</span></div>
            <div className="p-2 rounded bg-slate-900 text-emerald-300 break-all border border-slate-800">
              {txHash}
            </div>
          </div>

          {explorerUrl && (
            <div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline font-semibold"
              >
                <span>View on Celo Blockscout Explorer</span> ↗
              </a>
            </div>
          )}

          <button
            onClick={handleReset}
            className="w-full py-2 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Send Another Payment
          </button>
        </div>
      )}

      {/* FAILED STATE */}
      {uiState === 'failed' && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 space-y-4">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <span>❌ Payment Execution Failed</span>
          </div>
          <div className="p-3 rounded bg-slate-900 text-rose-300 text-xs font-mono border border-slate-800">
            {serverError || 'An unexpected error occurred during transaction execution.'}
          </div>
          <button
            onClick={handleReset}
            className="w-full py-2 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
