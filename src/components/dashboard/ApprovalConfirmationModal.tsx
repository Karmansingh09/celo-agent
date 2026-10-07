'use client';

import React, { useState } from 'react';
import { Agent } from '@/lib/agent/types';
import { PendingApprovalItem } from './ApprovalCard';

interface ApprovalConfirmationModalProps {
  isOpen: boolean;
  approval: PendingApprovalItem | null;
  agent?: Agent;
  onClose: () => void;
  onConfirm: (agentId: string, requestId: string) => Promise<void>;
}

export default function ApprovalConfirmationModal({
  isOpen,
  approval,
  agent,
  onClose,
  onConfirm,
}: ApprovalConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !approval) return null;

  const agentName = agent ? agent.name : `Agent ${approval.agentId.slice(0, 14)}`;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(approval.agentId, approval.requestId);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve request.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <h2 className="text-base font-bold text-emerald-400 flex items-center gap-2">
            <span>Approve Spending Request?</span>
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

        <div className="space-y-3 text-xs">
          <p className="text-slate-300 leading-relaxed">
            You are authorizing this controlled spending request to proceed through the CeloAgent policy and budget execution pipeline.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Agent:</span>
              <span className="text-white font-bold">{agentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Amount:</span>
              <span className="text-emerald-400 font-bold">${approval.amountCusd} cUSD</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Recipient:</span>
              <span className="text-slate-300" title={approval.recipient}>
                {approval.recipient.slice(0, 8)}...{approval.recipient.slice(-6)}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            ℹ️ <strong className="text-slate-300 font-normal">Control-plane action:</strong> Approval records human decision in the backend governance layer. It does not trigger wallet signature popups or direct blockchain transfers.
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
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow flex items-center gap-2"
          >
            {isSubmitting && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span>Confirm Approval</span>
          </button>
        </div>
      </div>
    </div>
  );
}
