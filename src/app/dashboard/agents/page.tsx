'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Agent } from '@/lib/agent/types';
import AgentCard from '@/components/dashboard/AgentCard';
import CreateAgentModal from '@/components/dashboard/CreateAgentModal';
import LifecycleModal, { LifecycleActionType } from '@/components/dashboard/LifecycleModal';

type FilterTab = 'ALL' | 'ACTIVE' | 'PAUSED' | 'TERMINATED';

export default function AgentsPage() {
  const { authenticated } = useAuth();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [lifecycleModalConfig, setLifecycleModalConfig] = useState<{
    isOpen: boolean;
    actionType: LifecycleActionType | null;
    agent: Agent | null;
  }>({
    isOpen: false,
    actionType: null,
    agent: null,
  });

  const [isActionExecuting, setIsActionExecuting] = useState<boolean>(false);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    if (!authenticated) return;

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch('/api/agents', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error('Failed to load agents list.');
      }

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAgents(json.data);
      } else {
        setAgents([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load agents.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Lifecycle handlers
  const handleOpenLifecycleModal = (agent: Agent, actionType: LifecycleActionType) => {
    setLifecycleModalConfig({
      isOpen: true,
      actionType,
      agent,
    });
  };

  const handleCloseLifecycleModal = () => {
    setLifecycleModalConfig({
      isOpen: false,
      actionType: null,
      agent: null,
    });
  };

  const handleExecuteLifecycleAction = async (
    agentId: string,
    action: LifecycleActionType,
    reason?: string
  ) => {
    try {
      setIsActionExecuting(true);
      const endpoint = `/api/agents/${agentId}/${action}`;
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
        throw new Error(data.error?.message || data.error || `Failed to ${action} agent.`);
      }

      // Refresh list
      await fetchAgents();
    } finally {
      setIsActionExecuting(false);
    }
  };

  // Metrics
  const activeCount = agents.filter((a) => a.status === 'ACTIVE').length;
  const pausedCount = agents.filter((a) => a.status === 'PAUSED').length;
  const terminatedCount = agents.filter((a) => a.status === 'TERMINATED').length;
  const totalCount = agents.length;

  // Filtered agents
  const filteredAgents = agents.filter((a) => {
    if (activeFilter === 'ALL') return true;
    return a.status === activeFilter;
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>AI Agents</span>
            <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {totalCount} total
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Provision autonomous spending agents, configure cUSD limits, and control operational lifecycles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-[0_4px_16px_-4px_rgba(134,227,176,0.3)] inline-flex items-center gap-2 shrink-0 self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <span>＋</span>
          <span>Create Agent</span>
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveFilter('ALL')}
          className={`p-4 rounded-2xl glass-panel glass-card-interactive cursor-pointer transition-all ${
            activeFilter === 'ALL'
              ? 'border-emerald-500/40 shadow-[0_0_16px_-4px_rgba(134,227,176,0.25)] ring-1 ring-emerald-500/30'
              : 'hover:border-[rgba(180,205,220,0.2)]'
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Total Agents</div>
          <div className="text-2xl font-bold text-white mt-1 tabular-nums">{totalCount}</div>
        </div>

        <div
          onClick={() => setActiveFilter('ACTIVE')}
          className={`p-4 rounded-2xl glass-panel glass-card-interactive cursor-pointer transition-all ${
            activeFilter === 'ACTIVE'
              ? 'border-emerald-500/40 shadow-[0_0_16px_-4px_rgba(134,227,176,0.25)] ring-1 ring-emerald-500/30'
              : 'hover:border-[rgba(180,205,220,0.2)]'
          }`}
        >
          <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">Active</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1 tabular-nums">{activeCount}</div>
        </div>

        <div
          onClick={() => setActiveFilter('PAUSED')}
          className={`p-4 rounded-2xl glass-panel glass-card-interactive cursor-pointer transition-all ${
            activeFilter === 'PAUSED'
              ? 'border-amber-500/40 shadow-[0_0_16px_-4px_rgba(241,194,125,0.25)] ring-1 ring-amber-500/30'
              : 'hover:border-[rgba(180,205,220,0.2)]'
          }`}
        >
          <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">Paused</div>
          <div className="text-2xl font-bold text-amber-300 mt-1 tabular-nums">{pausedCount}</div>
        </div>

        <div
          onClick={() => setActiveFilter('TERMINATED')}
          className={`p-4 rounded-2xl glass-panel glass-card-interactive cursor-pointer transition-all ${
            activeFilter === 'TERMINATED'
              ? 'border-rose-500/40 shadow-[0_0_16px_-4px_rgba(242,139,130,0.25)] ring-1 ring-rose-500/30'
              : 'hover:border-[rgba(180,205,220,0.2)]'
          }`}
        >
          <div className="text-[11px] font-mono text-rose-400 uppercase tracking-wider">Terminated</div>
          <div className="text-2xl font-bold text-rose-300 mt-1 tabular-nums">{terminatedCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search / Refresh Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[rgba(15,22,33,0.65)] border border-[rgba(180,205,220,0.1)] backdrop-blur-md self-start">
          {(
            [
              { key: 'ALL', label: 'All', count: totalCount },
              { key: 'ACTIVE', label: 'Active', count: activeCount },
              { key: 'PAUSED', label: 'Paused', count: pausedCount },
              { key: 'TERMINATED', label: 'Terminated', count: terminatedCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeFilter === tab.key
                  ? 'bg-[rgba(30,43,59,0.85)] text-emerald-300 border border-emerald-500/35 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[rgba(20,29,42,0.5)] border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full tabular-nums ${
                  activeFilter === tab.key
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => fetchAgents()}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-xl border border-[rgba(180,205,220,0.14)] bg-[rgba(20,29,42,0.6)] hover:bg-[rgba(30,43,59,0.8)] text-slate-300 text-xs font-medium transition-all disabled:opacity-50 self-end sm:self-auto flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-sm"
          title="Refresh list"
        >
          <span className={isLoading ? 'animate-spin' : ''}>↻</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-4 glass-panel">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchAgents()}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-white font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Retry
          </button>
        </div>
      )}

      {/* Agent Cards Grid / Loading / Empty States */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="p-6 rounded-2xl glass-panel animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="h-4 bg-slate-800/80 rounded w-1/2" />
                <div className="h-4 bg-slate-800/80 rounded w-16" />
              </div>
              <div className="h-3 bg-slate-800/60 rounded w-3/4" />
              <div className="h-8 bg-slate-900/60 rounded" />
              <div className="space-y-2 pt-2">
                <div className="h-3 bg-slate-800/60 rounded" />
                <div className="h-3 bg-slate-800/60 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        /* Zero Agents Empty State */
        <div className="p-12 text-center rounded-2xl glass-panel space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-3xl shadow-[0_0_20px_-4px_rgba(134,227,176,0.25)]">
            🤖
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">No agents provisioned yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Create your first autonomous spending agent to establish policy limits, auto-approval thresholds, and daily budgets.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-[0_4px_16px_-4px_rgba(134,227,176,0.3)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              ＋ Provision First Agent
            </button>
          </div>
        </div>
      ) : filteredAgents.length === 0 ? (
        /* Filter Empty State */
        <div className="p-10 text-center rounded-2xl glass-panel space-y-3">
          <p className="text-xs text-slate-400">
            No agents found with status <span className="font-semibold text-white">{activeFilter}</span>.
          </p>
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
          >
            Clear filter
          </button>
        </div>
      ) : (
        /* Grid of Agents */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isActionLoading={isActionExecuting}
              onPause={(target) => handleOpenLifecycleModal(target, 'pause')}
              onResume={(target) => handleOpenLifecycleModal(target, 'resume')}
              onTerminate={(target) => handleOpenLifecycleModal(target, 'terminate')}
            />
          ))}
        </div>
      )}

      {/* Create Agent Modal */}
      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          fetchAgents();
        }}
      />

      {/* Lifecycle Modal */}
      <LifecycleModal
        isOpen={lifecycleModalConfig.isOpen}
        actionType={lifecycleModalConfig.actionType}
        agent={lifecycleModalConfig.agent}
        onClose={handleCloseLifecycleModal}
        onConfirm={handleExecuteLifecycleAction}
      />
    </div>
  );
}
