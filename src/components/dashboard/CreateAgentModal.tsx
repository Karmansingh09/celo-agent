'use client';

import React, { useState } from 'react';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateAgentModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateAgentModalProps) {
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [maxPerTransaction, setMaxPerTransaction] = useState<string>('5.00');
  const [maxPerDay, setMaxPerDay] = useState<string>('25.00');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<string>('2.00');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateInputs = (): boolean => {
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Agent name is required.');
      return false;
    }
    if (trimmedName.length > 100) {
      setFormError('Agent name cannot exceed 100 characters.');
      return false;
    }

    if (description.length > 1000) {
      setFormError('Description cannot exceed 1000 characters.');
      return false;
    }

    if (walletAddress.trim()) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
        setFormError('Wallet address must be a valid 40-character hex EVM address (0x...).');
        return false;
      }
    }

    const isDecimalStr = (val: string) => /^\d+(\.\d+)?$/.test(val.trim());

    if (!isDecimalStr(maxPerTransaction)) {
      setFormError('Maximum per transaction must be a positive decimal number (e.g. "5.00").');
      return false;
    }

    if (!isDecimalStr(maxPerDay)) {
      setFormError('Daily spending limit must be a positive decimal number (e.g. "25.00").');
      return false;
    }

    if (!isDecimalStr(autoApproveThreshold)) {
      setFormError('Auto-approval threshold must be a positive decimal number (e.g. "2.00").');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        walletAddress: walletAddress.trim() || undefined,
        spendingPolicy: {
          maxPerTransaction: maxPerTransaction.trim(),
          maxPerDay: maxPerDay.trim(),
          autoApproveThreshold: autoApproveThreshold.trim(),
          allowedRecipients: [],
          validUntil: Date.now() + 365 * 86400 * 1000, // 1 year default
        },
      };

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401) {
          throw new Error('Your session has expired. Please sign in again.');
        }
        if (res.status === 403) {
          throw new Error('Your session cannot perform this action.');
        }
        if (res.status === 409) {
          throw new Error(data.error || 'An agent with this identity already exists.');
        }
        throw new Error(data.error || 'Failed to create agent.');
      }

      // Success
      setName('');
      setDescription('');
      setWalletAddress('');
      setMaxPerTransaction('5.00');
      setMaxPerDay('25.00');
      setAutoApproveThreshold('2.00');

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🤖 Create Autonomous Agent</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-sm p-1"
          >
            ✕
          </button>
        </div>

        {formError && (
          <div className="p-3 text-xs rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Agent Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Research Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Operational responsibilities and scope"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Wallet Address (optional, defaults to backend server wallet)
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Spending Policy Configuration */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                cUSD Spending Policy
              </span>
              <span className="text-[10px] font-mono text-emerald-400">cUSD Base Units</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-0.5">
                  Max per transaction
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="5.00"
                    value={maxPerTransaction}
                    onChange={(e) => setMaxPerTransaction(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] font-mono text-slate-400">cUSD</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Single-payment cap</p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-0.5">
                  Daily spending limit
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="25.00"
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] font-mono text-slate-400">cUSD</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Rolling daily budget</p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-0.5">
                Auto-approval threshold
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="2.00"
                  value={autoApproveThreshold}
                  onChange={(e) => setAutoApproveThreshold(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-2.5 top-1.5 text-[10px] font-mono text-slate-400">cUSD</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Requests above this require owner approval</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Agent'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
