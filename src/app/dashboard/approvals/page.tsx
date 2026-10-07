'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Agent } from '@/lib/agent/types';
import ApprovalCard, { PendingApprovalItem } from '@/components/dashboard/ApprovalCard';
import ApprovalConfirmationModal from '@/components/dashboard/ApprovalConfirmationModal';
import ApprovalRejectModal from '@/components/dashboard/ApprovalRejectModal';

interface ApprovalQueueItem {
  approval: PendingApprovalItem;
  agent: Agent;
}

export default function ApprovalsPage() {
  const { authenticated } = useAuth();

  const [queueItems, setQueueItems] = useState<ApprovalQueueItem[]>([]);
  const [agentsCount, setAgentsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    approval: PendingApprovalItem | null;
    agent?: Agent;
  }>({
    isOpen: false,
    approval: null,
  });

  const [rejectModalConfig, setRejectModalConfig] = useState<{
    isOpen: boolean;
    approval: PendingApprovalItem | null;
    agent?: Agent;
  }>({
    isOpen: false,
    approval: null,
  });

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // Fetch pending approvals across all owned agents
  const fetchApprovals = useCallback(async () => {
    if (!authenticated) return;

    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch owned agents list
      const agentsRes = await fetch('/api/agents', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!agentsRes.ok) {
        throw new Error('Failed to load owned agents.');
      }

      const agentsJson = await agentsRes.json();
      const agents: Agent[] =
        agentsJson.success && Array.isArray(agentsJson.data) ? agentsJson.data : [];
      setAgentsCount(agents.length);

      // 2. Fetch pending approvals for each owned agent
      const aggregatedItems: ApprovalQueueItem[] = [];

      await Promise.all(
        agents.map(async (agent) => {
          try {
            const apprRes = await fetch(
              `/api/agents/${agent.id}/approvals?status=PENDING`,
              {
                method: 'GET',
                headers: { Accept: 'application/json' },
              }
            );

            if (apprRes.ok) {
              const apprJson = await apprRes.json();
              if (apprJson.success && Array.isArray(apprJson.data)) {
                for (const item of apprJson.data) {
                  aggregatedItems.push({
                    approval: item,
                    agent,
                  });
                }
              }
            }
          } catch {
            // Graceful handling of individual agent query failure
          }
        })
      );

      // Sort pending items: newest requested first
      aggregatedItems.sort((a, b) => {
        const timeA = a.approval.createdAt || 0;
        const timeB = b.approval.createdAt || 0;
        return timeB - timeA;
      });

      setQueueItems(aggregatedItems);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load approval requests.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Open modal triggers
  const handleOpenApproveModal = (approval: PendingApprovalItem, agent?: Agent) => {
    setActionError(null);
    setActionSuccess(null);
    setConfirmModalConfig({
      isOpen: true,
      approval,
      agent,
    });
  };

  const handleOpenRejectModal = (approval: PendingApprovalItem, agent?: Agent) => {
    setActionError(null);
    setActionSuccess(null);
    setRejectModalConfig({
      isOpen: true,
      approval,
      agent,
    });
  };

  // Execution triggers
  const handleConfirmApprove = async (agentId: string, requestId: string) => {
    try {
      setIsSubmittingAction(true);
      setActionError(null);

      const res = await fetch(`/api/agents/${agentId}/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.status === 409 || res.status === 404 || res.status === 422) {
        // Stale or conflicting approval
        const reasonMsg = data.error || 'This request can no longer be approved under current policy.';
        setActionError(reasonMsg);
        await fetchApprovals();
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve request.');
      }

      setActionSuccess('Approval granted. Spending request authorized.');
      // Update queue
      setQueueItems((prev) =>
        prev.filter((item) => item.approval.requestId !== requestId)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to approve request.';
      setActionError(msg);
      throw err;
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleConfirmReject = async (
    agentId: string,
    requestId: string,
    reason?: string
  ) => {
    try {
      setIsSubmittingAction(true);
      setActionError(null);

      const payload: Record<string, unknown> = {};
      if (reason) {
        payload.reason = reason;
      }

      const res = await fetch(`/api/agents/${agentId}/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 409 || res.status === 404) {
        const reasonMsg = data.error || 'This request is no longer available.';
        setActionError(reasonMsg);
        await fetchApprovals();
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject request.');
      }

      setActionSuccess('Spending request rejected.');
      // Update queue
      setQueueItems((prev) =>
        prev.filter((item) => item.approval.requestId !== requestId)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reject request.';
      setActionError(msg);
      throw err;
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Spending Approvals</span>
            <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {queueItems.length} pending
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Human-in-the-loop decision queue for autonomous agent payment requests exceeding auto-approval limits.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchApprovals()}
          disabled={isLoading || isSubmittingAction}
          className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 self-start sm:self-auto flex items-center gap-1.5"
          title="Refresh approval queue"
        >
          <span className={isLoading ? 'animate-spin' : ''}>↻</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Banners */}
      {actionSuccess && (
        <div className="p-3 text-xs rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 text-xs rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending Requests */}
        <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
          <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">
            Pending Decisions
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {queueItems.length}
          </div>
          <p className="text-[11px] text-slate-400">
            Awaiting human approval before execution
          </p>
        </div>

        {/* Monitored Agents */}
        <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Configured Agents
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {agentsCount}
          </div>
          <p className="text-[11px] text-slate-400">
            Active autonomous spending entities
          </p>
        </div>

        {/* Settlement Notice */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Governance Boundary
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
            Approval grants authorization through the backend policy engine, distinct from blockchain settlement. It does not trigger direct wallet signing or on-chain transfer.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchApprovals()}
            className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-white font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Queue Cards / Loading / Empty States */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/40 animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 bg-slate-700 rounded w-1/3" />
                <div className="h-5 bg-slate-700 rounded w-24" />
              </div>
              <div className="h-10 bg-slate-900/60 rounded" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 bg-slate-700/60 rounded" />
                <div className="h-8 bg-slate-700/60 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : queueItems.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl">
            ✓
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No approvals waiting</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You&apos;re all caught up. Controlled spending requests exceeding auto-approval thresholds will appear here for your review.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              href="/dashboard/agents"
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              View Agents
            </Link>
          </div>
        </div>
      ) : (
        /* Queue of Pending Approvals */
        <div className="space-y-4">
          {queueItems.map(({ approval, agent }) => (
            <ApprovalCard
              key={approval.requestId}
              approval={approval}
              agent={agent}
              isActionLoading={isSubmittingAction}
              onApprove={() => handleOpenApproveModal(approval, agent)}
              onReject={() => handleOpenRejectModal(approval, agent)}
            />
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      <ApprovalConfirmationModal
        isOpen={confirmModalConfig.isOpen}
        approval={confirmModalConfig.approval}
        agent={confirmModalConfig.agent}
        onClose={() => setConfirmModalConfig({ isOpen: false, approval: null })}
        onConfirm={handleConfirmApprove}
      />

      {/* Rejection Modal */}
      <ApprovalRejectModal
        isOpen={rejectModalConfig.isOpen}
        approval={rejectModalConfig.approval}
        agent={rejectModalConfig.agent}
        onClose={() => setRejectModalConfig({ isOpen: false, approval: null })}
        onConfirm={handleConfirmReject}
      />
    </div>
  );
}
