'use client';

import React, { useState, useEffect } from 'react';
import { Agent } from '@/lib/agent/types';

export type LifecycleActionType = 'pause' | 'resume' | 'terminate';

interface LifecycleModalProps {
  isOpen: boolean;
  actionType: LifecycleActionType | null;
  agent: Agent | null;
  onClose: () => void;
  onConfirm: (agentId: string, action: LifecycleActionType, reason?: string) => Promise<void>;
}

export default function LifecycleModal({
  isOpen,
  actionType,
  agent,
  onClose,
  onConfirm,
}: LifecycleModalProps) {
  const [reason, setReason] = useState<string>('');
  const [confirmName, setConfirmName] = useState<string>('');
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

  if (!isOpen || !actionType || !agent) return null;

  const isTerminate = actionType === 'terminate';
  const isPause = actionType === 'pause';
  const isResume = actionType === 'resume';

  const title = {
    pause: `Pause Agent: ${agent.name}`,
    resume: `Resume Agent: ${agent.name}`,
    terminate: `Terminate Agent: ${agent.name}`,
  }[actionType];

  const description = {
    pause: 'New spending requests and budget reservations will be blocked while this agent is paused.',
    resume: 'Restores the agent to ACTIVE status, allowing spending evaluations and budget reservations.',
    terminate: 'This permanently and irrevocably terminates the agent. It cannot be resumed.',
  }[actionType];

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isTerminate) {
      if (confirmName.trim().toLowerCase() !== agent.name.trim().toLowerCase()) {
        setError(`Please type "${agent.name}" exactly to confirm termination.`);
        return;
      }
    }

    if (reason.length > 500) {
      setError('Reason cannot exceed 500 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(agent.id, actionType, reason.trim() || undefined);
      setReason('');
      setConfirmName('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lifecycle-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
    >
      <div className="w-full max-w-md rounded-3xl glass p-7 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--glass-b)] pb-4">
          <h2 id="lifecycle-modal-title" className="name text-2xl font-normal text-[var(--ink)] flex items-center gap-2">
            <span>{isTerminate ? '⚠️' : isPause ? '⏸' : '▶'}</span>
            <span>{title}</span>
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

        {error && (
          <div className="p-3 text-xs rounded-xl border border-rose-500/30 bg-rose-500/10 text-[var(--deny)] font-mono">
            ⚠️ {error}
          </div>
        )}

        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          {description}
        </p>

        <form onSubmit={handleExecute} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
              Reason (optional, max 500 characters)
            </label>
            <input
              type="text"
              placeholder="e.g. Scheduled maintenance"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--glass-b)] text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-sans"
            />
          </div>

          {isTerminate && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <label className="block text-xs font-semibold text-[var(--deny)]">
                Type agent name <span className="font-mono underline text-[var(--ink)]">{agent.name}</span> to confirm:
              </label>
              <input
                type="text"
                required
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={agent.name}
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-black/10 border border-rose-500/40 text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--deny)]"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`btn solid flex-1 h-10 text-xs font-semibold ${
                isTerminate ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''
              }`}
            >
              {isSubmitting
                ? 'Processing...'
                : isTerminate
                ? 'Terminate Agent'
                : isPause
                ? 'Pause Agent'
                : 'Resume Agent'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn h-10 px-5 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
