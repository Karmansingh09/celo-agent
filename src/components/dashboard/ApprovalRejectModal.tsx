'use client';

import React, { useState } from 'react';
import { Agent } from '@/lib/agent/types';
import { PendingApprovalItem } from './ApprovalCard';

interface ApprovalRejectModalProps {
  isOpen: boolean;
  approval: PendingApprovalItem | null;
  agent?: Agent;
  onClose: () => void;
  onConfirm: (agentId: string, requestId: string, reason?: string) => Promise<void>;
}

export default function ApprovalRejectModal({
  isOpen,
  approval,
  agent,
  onClose,
  onConfirm,
}: ApprovalRejectModalProps) {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !approval) return null;

  const agentName = agent ? agent.name : `Agent ${approval.agentId.slice(0, 14)}`;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.length > 500) {
      setError('Rejection reason cannot exceed 500 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(
        approval.agentId,
        approval.requestId,
        reason.trim() ? reason.trim() : undefined
      );
      setReason('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject request.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <h2 className="text-base font-bold text-rose-400 flex items-center gap-2">
            <span>Reject Spending Request?</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors text-sm p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Agent:</span>
              <span className="text-white font-bold">{agentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Amount:</span>
              <span className="text-rose-300 font-bold">${approval.amountCusd} cUSD</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Recipient:</span>
              <span className="text-slate-300" title={approval.recipient}>
                {approval.recipient.slice(0, 8)}...{approval.recipient.slice(-6)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rejection-reason" className="block text-xs font-medium text-slate-300">
              Optional Rejection Reason
            </label>
            <textarea
              id="rejection-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide context for why this request is denied (e.g. Unplanned recipient or limit exhausted)..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Recorded in agent audit trail</span>
              <span>{reason.length}/500</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors shadow flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="w-3.5 h-3.5 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
              )}
              <span>Confirm Rejection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
