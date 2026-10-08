'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { isAddress } from 'viem';
import { Agent } from '@/lib/agent/types';
import { PaymentOrchestrationResult } from '@/lib/payment/types';

interface SpendingRequestDrawerProps {
  isOpen: boolean;
  agent: Agent;
  onClose: () => void;
  onRequestSubmitted?: () => void;
}

type StepState = 'FORM' | 'REVIEW' | 'SUBMITTING' | 'RESULT' | 'ERROR';

export default function SpendingRequestDrawer({
  isOpen,
  agent,
  onClose,
  onRequestSubmitted,
}: SpendingRequestDrawerProps) {
  const [step, setStep] = useState<StepState>('FORM');
  const [amount, setAmount] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentOrchestrationResult | null>(null);

  // Initialize/reset form when opened
  useEffect(() => {
    if (isOpen) {
      setStep('FORM');
      setAmount('');
      setRecipient('');
      setPurpose('');
      setFormError(null);
      setSubmissionError(null);
      setResult(null);
      // Generate a stable idempotency key for this drawer session
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      setIdempotencyKey(`sim_${Date.now()}_${randomSuffix}`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const policy = agent.spendingPolicy;

  const formatCusdString = (val: string): string => {
    if (!val) return '$0.00 cUSD';
    const trimmed = val.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return `$${trimmed} cUSD`;
    const [whole, dec = ''] = trimmed.split('.');
    const paddedDec = dec.length === 0 ? '00' : dec.length === 1 ? `${dec}0` : dec;
    return `$${whole}.${paddedDec} cUSD`;
  };

  const validateForm = (): boolean => {
    setFormError(null);

    const trimmedAmount = amount.trim();
    if (!trimmedAmount) {
      setFormError('Amount is required.');
      return false;
    }

    if (!/^\d+(\.\d+)?$/.test(trimmedAmount)) {
      setFormError('Amount must be a valid positive decimal number (e.g. "8.50").');
      return false;
    }

    // Check non-zero
    const [whole, dec = ''] = trimmedAmount.split('.');
    if (whole === '0' && (dec === '' || /^0+$/.test(dec))) {
      setFormError('Amount must be greater than zero.');
      return false;
    }

    const trimmedRecipient = recipient.trim();
    if (!trimmedRecipient) {
      setFormError('Recipient address is required.');
      return false;
    }

    if (!isAddress(trimmedRecipient)) {
      setFormError('Recipient must be a valid 40-character hex EVM address (0x...).');
      return false;
    }

    if (purpose.length > 500) {
      setFormError('Purpose cannot exceed 500 characters.');
      return false;
    }

    return true;
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setStep('REVIEW');
  };

  const handleBackToForm = () => {
    setStep('FORM');
    setSubmissionError(null);
  };

  const handleSubmitRequest = async () => {
    try {
      setStep('SUBMITTING');
      setSubmissionError(null);

      const payload = {
        amountCusd: amount.trim(),
        recipient: recipient.trim(),
        idempotencyKey: idempotencyKey,
        purpose: purpose.trim() ? purpose.trim() : undefined,
      };

      const res = await fetch(`/api/agents/${agent.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.data && typeof json.data === 'object') {
        // Backend returned structured PaymentOrchestrationResult
        setResult(json.data as PaymentOrchestrationResult);
        setStep('RESULT');
        onRequestSubmitted?.();
        return;
      }

      // Handle raw HTTP status errors
      if (res.status === 401) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (res.status === 403) {
        throw new Error('Your session cannot perform this action.');
      }
      if (res.status === 404) {
        throw new Error('Agent not found or unauthorized.');
      }
      if (res.status === 409) {
        throw new Error(json.error || 'Request conflict or agent lifecycle changed.');
      }
      if (res.status === 422) {
        throw new Error(json.error || 'Request denied by spending policy or available budget.');
      }

      throw new Error(json.error || 'Something went wrong processing spending request.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to submit request.';
      setSubmissionError(msg);
      setStep('ERROR');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Controlled Spending Request</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate spending evaluation for <strong className="text-emerald-400 font-semibold">{agent.name}</strong>
            </p>
          </div>
          <button
            type="button"
            disabled={step === 'SUBMITTING'}
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-sm p-1 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* STEP 1: FORM INPUTS */}
        {step === 'FORM' && (
          <form onSubmit={handleProceedToReview} className="space-y-4">
            {formError && (
              <div className="p-3 text-xs rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300">
                ⚠️ {formError}
              </div>
            )}

            {/* Amount Field */}
            <div className="space-y-1.5">
              <label htmlFor="amount-input" className="block text-xs font-semibold text-slate-200">
                Requested Amount (cUSD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-400">$</span>
                <input
                  id="amount-input"
                  type="text"
                  placeholder="8.50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-16 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-2.5 text-xs font-mono text-slate-400">cUSD</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Positive decimal amount evaluated against agent policy limits.
              </p>
            </div>

            {/* Recipient Field */}
            <div className="space-y-1.5">
              <label htmlFor="recipient-input" className="block text-xs font-semibold text-slate-200">
                Recipient
              </label>
              <input
                id="recipient-input"
                type="text"
                placeholder="0x71A4...C92F"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400">
                The address that this controlled spending request targets.
              </p>
            </div>

            {/* Optional Purpose Field */}
            <div className="space-y-1.5">
              <label htmlFor="purpose-input" className="block text-xs font-medium text-slate-300">
                Purpose / Description (Optional)
              </label>
              <input
                id="purpose-input"
                type="text"
                placeholder="e.g. Market research data subscription"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Policy Context Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Policy Boundary Context
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">Max / tx</span>
                  <span className="text-white font-bold">${policy.maxPerTransaction}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Auto-approve</span>
                  <span className="text-emerald-400 font-bold">≤ ${policy.autoApproveThreshold}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Daily limit</span>
                  <span className="text-white font-bold">${policy.maxPerDay}</span>
                </div>
              </div>
            </div>

            {/* Form Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow"
              >
                Review request →
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: REVIEW DETAILS */}
        {step === 'REVIEW' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Agent:</span>
                <span className="text-white font-bold">{agent.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {formatCusdString(amount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Recipient:</span>
                <span className="text-slate-300" title={recipient}>
                  {recipient.slice(0, 10)}...{recipient.slice(-6)}
                </span>
              </div>
              {purpose.trim() && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 font-sans">Purpose:</span>
                  <span className="text-slate-300 truncate max-w-[240px]">{purpose}</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
              ℹ️ This spending request will be evaluated against the agent&apos;s current spending policy and daily budget in the CeloAgent control plane.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={handleBackToForm}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSubmitRequest}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow flex items-center gap-1.5"
              >
                <span>Submit request</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUBMITTING INDICATOR */}
        {step === 'SUBMITTING' && (
          <div className="py-10 text-center space-y-4">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Evaluating spending request...</h3>
              <p className="text-xs text-slate-400">
                Running policy evaluator, checking auto-approval limits, and verifying daily budget.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: STRUCTURED RESULT */}
        {step === 'RESULT' && result && (
          <div className="space-y-4">
            {/* RESERVED Result */}
            {result.outcome === 'RESERVED' && (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 space-y-2 text-center">
                <div className="text-2xl">✓</div>
                <h3 className="text-sm font-bold text-emerald-300">Spending request reserved</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The request passed policy and budget checks and has entered the controlled payment workflow.
                </p>
                {result.reservation && (
                  <div className="pt-2 text-[10px] font-mono text-emerald-400">
                    Reservation ID: {result.reservation.id}
                  </div>
                )}
              </div>
            )}

            {/* REQUIRE_USER_APPROVAL Result */}
            {result.outcome === 'REQUIRE_USER_APPROVAL' && (
              <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800/80 space-y-3 text-center">
                <div className="text-2xl">⏳</div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-amber-300">Approval required</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This request exceeds automatic limits and requires human approval before controlled execution can proceed.
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono text-left space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount:</span>
                    <span className="text-white font-bold">{formatCusdString(amount)}</span>
                  </div>
                  {result.pendingApproval?.requestId && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Pending ID:</span>
                      <span className="text-amber-400 truncate max-w-[200px]" title={result.pendingApproval.requestId}>
                        {result.pendingApproval.requestId}
                      </span>
                    </div>
                  )}
                </div>
                <div className="pt-2 flex justify-center">
                  <Link
                    href="/dashboard/approvals"
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition-colors shadow"
                  >
                    Review in Approvals queue →
                  </Link>
                </div>
              </div>
            )}

            {/* POLICY_DENIED Result */}
            {result.outcome === 'POLICY_DENIED' && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2 text-center">
                <div className="text-2xl">✕</div>
                <h3 className="text-sm font-bold text-rose-300">Request denied</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {result.reason || "Your agent's spending policy does not allow this request."}
                </p>
              </div>
            )}

            {/* BUDGET_DENIED Result */}
            {result.outcome === 'BUDGET_DENIED' && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2 text-center">
                <div className="text-2xl">⚠️</div>
                <h3 className="text-sm font-bold text-rose-300">Budget unavailable</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {result.reason || 'This request cannot proceed because the agent does not have enough available spending budget.'}
                </p>
              </div>
            )}

            {/* DUPLICATE_IN_PROGRESS Result */}
            {result.outcome === 'DUPLICATE_IN_PROGRESS' && (
              <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800/80 space-y-2 text-center">
                <div className="text-2xl">⏳</div>
                <h3 className="text-sm font-bold text-amber-300">Request already in progress</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The same spending request is currently being processed.
                </p>
              </div>
            )}

            {/* DUPLICATE_COMMITTED Result */}
            {result.outcome === 'DUPLICATE_COMMITTED' && (
              <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-800/80 space-y-2 text-center">
                <div className="text-2xl">ℹ️</div>
                <h3 className="text-sm font-bold text-blue-300">Request already processed</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  An identical spending request has already reached a committed state.
                </p>
              </div>
            )}

            {/* IDEMPOTENCY_CONFLICT Result */}
            {result.outcome === 'IDEMPOTENCY_CONFLICT' && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2 text-center">
                <div className="text-2xl">⚠️</div>
                <h3 className="text-sm font-bold text-rose-300">Request conflict</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This request key is already associated with different spending details. Please create a new request.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: ERROR STATE */}
        {step === 'ERROR' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Submission Error</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{submissionError}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={handleBackToForm}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                ← Back to Form
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
