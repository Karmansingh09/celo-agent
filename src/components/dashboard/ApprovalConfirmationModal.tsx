'use client';

import React, { useState, useEffect } from 'react';
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-confirmation-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
    >
      <div className="w-full max-w-md rounded-3xl glass p-7 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-3">
          <h2 id="approval-confirmation-title" className="name text-2xl font-normal text-[var(--ok)] flex items-center gap-2">
            <span>Approve Spending Request?</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="text-[var(--muted)] hover:text-[var(--ink)] text-sm p-1 rounded"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-xl border border-rose-500/30 bg-rose-500/10 text-[var(--deny)] font-mono">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <p className="text-[var(--muted)] leading-relaxed">
            You are authorizing this controlled spending request to proceed through the CeloAgent policy and budget execution pipeline.
          </p>

          <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] space-y-2 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)] font-sans">Agent:</span>
              <span className="text-[var(--ink)] font-bold">{agentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)] font-sans">Amount:</span>
              <span className="text-[var(--ok)] font-bold tabular-nums">${approval.amountCusd} cUSD</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)] font-sans">Recipient:</span>
              <span className="text-[var(--ink)]" title={approval.recipient}>
                {approval.recipient.slice(0, 8)}…{approval.recipient.slice(-6)}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[11px] text-[var(--muted)] leading-relaxed">
            ℹ️ <strong className="text-[var(--ink)] font-normal">Control-plane action:</strong> Approval records human decision in the backend governance layer. It does not trigger wallet signature popups or direct blockchain transfers.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--glass-b)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn h-10 px-4 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="btn solid h-10 px-5 text-xs font-semibold flex items-center gap-2"
          >
            {isSubmitting && (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            <span>Confirm Approval</span>
          </button>
        </div>
      </div>
    </div>
  );
}
