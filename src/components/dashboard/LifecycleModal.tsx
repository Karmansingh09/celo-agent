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
      const msg = err instanceof Error ? err.message : 'Operation failed.';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <h2
            id="lifecycle-modal-title"
            className={`text-base font-bold ${
              isTerminate ? 'text-rose-400' : isPause ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-white transition-colors text-sm p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300">
            ⚠️ {error}
          </div>
        )}

        <p className="text-xs text-slate-300 leading-relaxed">
          {description}
        </p>

        <form onSubmit={handleExecute} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Reason (optional, max 500 characters)
            </label>
            <input
              type="text"
              placeholder="e.g. Scheduled maintenance"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          {isTerminate && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 space-y-2">
              <label className="block text-xs font-semibold text-rose-300">
                Type agent name <span className="font-mono text-white underline">{agent.name}</span> to confirm:
              </label>
              <input
                type="text"
                required
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={agent.name}
                className="w-full px-3 py-1.5 text-xs rounded bg-slate-900 border border-rose-800 text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-xs text-white transition-colors shadow disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 ${
                isTerminate
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : isPause
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
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
              className="py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
