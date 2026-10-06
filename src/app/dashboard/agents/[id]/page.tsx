'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Agent } from '@/lib/agent/types';
import AgentIdentity from '@/components/dashboard/AgentIdentity';
import AgentPolicyCard from '@/components/dashboard/AgentPolicyCard';
import LifecycleModal, { LifecycleActionType } from '@/components/dashboard/LifecycleModal';

export default function AgentDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const agentId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { authenticated } = useAuth();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Lifecycle modal state
  const [lifecycleModalConfig, setLifecycleModalConfig] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType | null;
  }>({
    isOpen: false,
    actionType: null,
  });

  const [isActionExecuting, setIsActionExecuting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch agent
  const fetchAgent = useCallback(async () => {
    if (!authenticated) return;
    if (!agentId || typeof agentId !== 'string') {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setNotFound(false);

      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (res.status === 404 || res.status === 400) {
        setNotFound(true);
        setAgent(null);
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to load this agent.');
      }

      const json = await res.json();
      if (json.success && json.data) {
        setAgent(json.data);
      } else {
        setNotFound(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load this agent.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Lifecycle action handler
  const handleOpenLifecycleModal = (actionType: LifecycleActionType) => {
    setActionError(null);
    setActionSuccess(null);
    setLifecycleModalConfig({
      isOpen: true,
      actionType,
    });
  };

  const handleCloseLifecycleModal = () => {
    setLifecycleModalConfig({
      isOpen: false,
      actionType: null,
    });
  };

  const handleExecuteLifecycleAction = async (
    targetAgentId: string,
    action: LifecycleActionType,
    reason?: string
  ) => {
    try {
      setIsActionExecuting(true);
      setActionError(null);
      const endpoint = `/api/agents/${targetAgentId}/${action}`;
      const payload: Record<string, unknown> = {};
      if (reason) {
        payload.reason = reason;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.error || `Unable to update agent status.`);
      }

      // Update local state directly if agent payload returned, or refresh
      if (data.data) {
        setAgent(data.data);
      } else {
        await fetchAgent();
      }

      const actionLabels = {
        pause: 'Agent paused successfully.',
        resume: 'Agent resumed successfully.',
        terminate: 'Agent permanently terminated.',
      };
      setActionSuccess(actionLabels[action]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to update agent status.';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionExecuting(false);
    }
  };

  // Status configuration
  const statusConfig = agent
    ? {
        ACTIVE: {
          label: '● ACTIVE',
          badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          description:
            'This agent is currently active and may submit controlled spending requests subject to its configured policy.',
        },
        PAUSED: {
          label: '● PAUSED',
          badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800',
          description:
            'This agent is paused. New spending requests are blocked until the agent is resumed.',
        },
        TERMINATED: {
          label: '● TERMINATED',
          badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800',
          description:
            'This agent has been permanently terminated and cannot be resumed.',
        },
      }[agent.status]
    : null;

  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Breadcrumb Skeleton */}
        <div className="h-4 w-24 bg-slate-700/60 rounded" />

        {/* Header Skeleton */}
        <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/40 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-6 w-48 bg-slate-700 rounded" />
            <div className="h-6 w-24 bg-slate-700 rounded" />
          </div>
          <div className="h-4 w-72 bg-slate-700/60 rounded" />
        </div>

        {/* 2-Column Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 rounded-xl bg-slate-800/40 border border-slate-700/40" />
            <div className="h-64 rounded-xl bg-slate-800/40 border border-slate-700/40" />
            <div className="h-32 rounded-xl bg-slate-800/40 border border-slate-700/40" />
          </div>
          <div className="space-y-6">
            <div className="h-48 rounded-xl bg-slate-800/40 border border-slate-700/40" />
            <div className="h-40 rounded-xl bg-slate-800/40 border border-slate-700/40" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Not Found State (Safe 404, Anti-Enumeration)
  if (notFound || !agent) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>←</span>
          <span>Back to Agents</span>
        </Link>

        <div className="p-12 text-center rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4 max-w-lg mx-auto my-12">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl">
            🔍
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Agent not found</h3>
            <p className="text-xs text-slate-400">
              This agent could not be located. It may not exist or may belong to another workspace.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/dashboard/agents"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors inline-block"
            >
              Back to Agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Error Banner State
  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>←</span>
          <span>Back to Agents</span>
        </Link>

        <div className="p-6 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex flex-col items-center justify-center space-y-3">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="font-semibold text-sm">Unable to load this agent</span>
          </div>
          <p className="text-slate-300">{error}</p>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fetchAgent()}
              className="px-4 py-2 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white font-medium text-xs transition-colors"
            >
              Retry
            </button>
            <Link
              href="/dashboard/agents"
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              Back to Agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div>
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>←</span>
          <span>Agents</span>
        </Link>
      </div>

      {/* Action Notification Banners */}
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

      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>🤖 {agent.name}</span>
            </h2>
            {statusConfig && (
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${statusConfig.badgeClass}`}
              >
                {statusConfig.label}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            {agent.description || 'Autonomous agent configured with spending boundaries and policy enforcement.'}
          </p>
        </div>

        {/* Quick Header Lifecycle Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {agent.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                disabled={isActionExecuting}
                onClick={() => handleOpenLifecycleModal('pause')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors disabled:opacity-50"
              >
                Pause Agent
              </button>
              <button
                type="button"
                disabled={isActionExecuting}
                onClick={() => handleOpenLifecycleModal('terminate')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-800 transition-colors disabled:opacity-50"
              >
                Terminate Agent
              </button>
            </>
          )}

          {agent.status === 'PAUSED' && (
            <>
              <button
                type="button"
                disabled={isActionExecuting}
                onClick={() => handleOpenLifecycleModal('resume')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors disabled:opacity-50"
              >
                Resume Agent
              </button>
              <button
                type="button"
                disabled={isActionExecuting}
                onClick={() => handleOpenLifecycleModal('terminate')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-800 transition-colors disabled:opacity-50"
              >
                Terminate Agent
              </button>
            </>
          )}

          {agent.status === 'TERMINATED' && (
            <span className="text-xs font-mono text-slate-500 italic px-3 py-1.5 rounded bg-slate-900 border border-slate-800">
              Retired from Service
            </span>
          )}
        </div>
      </div>

      {/* Main Content Grid: 2 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Identity, Spending Policy, Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identity & Configuration */}
          <AgentIdentity agent={agent} />

          {/* Spending Policy Card */}
          <AgentPolicyCard policy={agent.spendingPolicy} />

          {/* Activity Section Placeholder */}
          <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-4">
            <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Activity</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Audit log of payment requests, policy evaluations, and lifecycle updates.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
                Audit Trail
              </span>
            </div>

            <div className="p-8 text-center rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <div className="text-2xl">📜</div>
              <p className="text-xs font-semibold text-slate-300">No activity history yet.</p>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                Payment evaluations and lifecycle audit events will appear here when activity tracking is introduced.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (1 span): Lifecycle Controls & Danger Zone */}
        <div className="space-y-6">
          {/* Lifecycle Status & Controls */}
          <div className="p-6 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-4">
            <div className="border-b border-slate-700/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Lifecycle</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Current State:</span>
                {statusConfig && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${statusConfig.badgeClass}`}
                  >
                    {statusConfig.label}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                {statusConfig?.description}
              </p>

              {/* Lifecycle Actions */}
              <div className="pt-2 space-y-2">
                {agent.status === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={isActionExecuting}
                    onClick={() => handleOpenLifecycleModal('pause')}
                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors disabled:opacity-50 text-center"
                  >
                    Pause Agent
                  </button>
                )}

                {agent.status === 'PAUSED' && (
                  <button
                    type="button"
                    disabled={isActionExecuting}
                    onClick={() => handleOpenLifecycleModal('resume')}
                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors disabled:opacity-50 text-center"
                  >
                    Resume Agent
                  </button>
                )}

                {agent.status === 'TERMINATED' && (
                  <div className="text-center py-2 text-xs font-mono text-slate-500 italic bg-slate-900/60 rounded border border-slate-800">
                    Agent terminated permanently
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="p-6 rounded-xl bg-slate-800/70 border border-rose-900/60 shadow-sm space-y-4">
            <div className="border-b border-rose-900/50 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider">Danger Zone</h3>
              <span className="text-xs">⚠️</span>
            </div>

            {agent.status !== 'TERMINATED' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">Terminate Agent</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Permanently stop this agent. This action cannot be undone. Once terminated, an agent can never be resumed or execute spending requests.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isActionExecuting}
                  onClick={() => handleOpenLifecycleModal('terminate')}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors disabled:opacity-50 text-center"
                >
                  Terminate Agent
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300">Agent Terminated</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  This agent is permanently retired and can no longer be resumed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lifecycle Modal Reused */}
      <LifecycleModal
        isOpen={lifecycleModalConfig.isOpen}
        actionType={lifecycleModalConfig.actionType}
        agent={agent}
        onClose={handleCloseLifecycleModal}
        onConfirm={handleExecuteLifecycleAction}
      />
    </div>
  );
}
