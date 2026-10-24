'use client';

import React, { useState, useEffect } from 'react';
import { parseCusdToBaseUnits } from '@/lib/policy/budget-types';
import {
  getDefaultPolicyExpirationInput,
  parsePolicyExpirationInput,
} from '@/lib/policy/expiration';

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
  const [validUntilInput, setValidUntilInput] = useState<string>(() => getDefaultPolicyExpirationInput());

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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

    const perTxWei = parseCusdToBaseUnits(maxPerTransaction.trim());
    if (perTxWei === null) {
      setFormError('Maximum per transaction must be a positive cUSD amount with at most 18 decimals.');
      return false;
    }

    const perDayWei = parseCusdToBaseUnits(maxPerDay.trim());
    if (perDayWei === null) {
      setFormError('Maximum per day must be a positive cUSD amount with at most 18 decimals.');
      return false;
    }

    const autoApproveWei = parseCusdToBaseUnits(autoApproveThreshold.trim());
    if (autoApproveWei === null) {
      setFormError('Auto-approval threshold must be a positive cUSD amount with at most 18 decimals.');
      return false;
    }

    if (perTxWei > perDayWei) {
      setFormError('Maximum per transaction cannot exceed the daily spending limit.');
      return false;
    }

    if (autoApproveWei > perTxWei) {
      setFormError('Auto-approval threshold cannot exceed the maximum per transaction limit.');
      return false;
    }

    if (parsePolicyExpirationInput(validUntilInput) === null) {
      setFormError('Policy expiration must be a future date and time.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateInputs()) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const validUntil = parsePolicyExpirationInput(validUntilInput);
      if (validUntil === null) {
        setFormError('Policy expiration must be a future date and time.');
        return;
      }

      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        walletAddress: walletAddress.trim() || undefined,
        spendingPolicy: {
          maxPerTransaction: maxPerTransaction.trim(),
          maxPerDay: maxPerDay.trim(),
          autoApproveThreshold: autoApproveThreshold.trim(),
          allowedRecipients: [],
          validUntil,
        },
      };

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create agent.');
      }

      setName('');
      setDescription('');
      setWalletAddress('');
      setMaxPerTransaction('5.00');
      setMaxPerDay('25.00');
      setAutoApproveThreshold('2.00');
      setValidUntilInput(getDefaultPolicyExpirationInput());

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-agent-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
    >
      <div className="w-full max-w-lg rounded-3xl glass p-7 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-4">
          <h2 id="create-agent-modal-title" className="name text-2xl font-normal text-[var(--ink)] flex items-center gap-2">
            <span>🤖 Create Autonomous Agent</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-[var(--muted)] hover:text-[var(--ink)] text-sm p-1 rounded"
          >
            ✕
          </button>
        </div>

        {formError && (
          <div className="p-3 text-xs rounded-xl border border-rose-500/30 bg-rose-500/10 text-[var(--deny)] font-mono">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
              Agent Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Research Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Operational responsibilities and scope"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
              Wallet Address (optional, defaults to backend server wallet)
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>

          {/* Spending Policy Configuration */}
          <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-3">
            <span className="text-[11px] font-mono font-bold text-[var(--ink)] uppercase tracking-wider block">
              Spending Policy Bounds (cUSD)
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                  Max Per Tx *
                </label>
                <input
                  type="text"
                  required
                  placeholder="5.00"
                  value={maxPerTransaction}
                  onChange={(e) => setMaxPerTransaction(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                  Max Per Day *
                </label>
                <input
                  type="text"
                  required
                  placeholder="25.00"
                  value={maxPerDay}
                  onChange={(e) => setMaxPerDay(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Auto-Approval Threshold *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="2.00"
                  value={autoApproveThreshold}
                  onChange={(e) => setAutoApproveThreshold(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
                <span className="absolute right-3 top-2 text-[10px] font-mono text-[var(--muted)]">cUSD</span>
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1">Requests above this queue for owner sign-off</p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Policy Expiration *
              </label>
              <input
                type="datetime-local"
                required
                value={validUntilInput}
                onChange={(e) => setValidUntilInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              <p className="text-[10px] text-[var(--muted)] mt-1">
                Requests are denied after this date and time.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn solid flex-1 h-11 text-xs font-semibold"
            >
              {isSubmitting ? 'Creating...' : 'Create Agent'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn h-11 px-5 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
