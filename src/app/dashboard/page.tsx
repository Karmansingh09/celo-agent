'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Agent } from '@/lib/agent/types';
import { parseUnits, formatUnits } from 'viem';
import OverviewHeader from '@/components/dashboard/OverviewHeader';
import OverviewStatCard from '@/components/dashboard/OverviewStatCard';
import AgentSummary from '@/components/dashboard/AgentSummary';
import SpendingOverview from '@/components/dashboard/SpendingOverview';
import ApprovalSummary from '@/components/dashboard/ApprovalSummary';
import RecentActivity from '@/components/dashboard/RecentActivity';
import QuickActions from '@/components/dashboard/QuickActions';

export default function DashboardOverviewPage() {
  const { authenticated, ownerAddress, chainId } = useAuth();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!authenticated) return;

    try {
      setIsLoadingData(true);
      setFetchError(null);

      // 1. Fetch owned agents list
      const agentsRes = await fetch('/api/agents', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!agentsRes.ok) {
        throw new Error('Failed to load agent overview.');
      }

      const agentsJson = await agentsRes.json();
      const loadedAgents: Agent[] = agentsJson.success && Array.isArray(agentsJson.data) ? agentsJson.data : [];
      setAgents(loadedAgents);

      // 2. Fetch pending approvals across all owned agents
      let totalPending = 0;
      await Promise.all(
        loadedAgents.map(async (agent) => {
          try {
            const apprRes = await fetch(`/api/agents/${agent.id}/approvals?status=PENDING`, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (apprRes.ok) {
              const apprJson = await apprRes.json();
              if (apprJson.success && typeof apprJson.count === 'number') {
                totalPending += apprJson.count;
              }
            }
          } catch {
            // Ignore per-agent approval fetch errors to avoid breaking the overview
          }
        })
      );

      setPendingApprovalsCount(totalPending);
    } catch {
      setFetchError('Unable to load agent summary.');
    } finally {
      setIsLoadingData(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Exact BigInt-based addition for cUSD budgets (Zero float arithmetic)
  let totalDailyBudgetBase = 0n;
  let activeCount = 0;
  let pausedCount = 0;
  let terminatedCount = 0;

  for (const agent of agents) {
    if (agent.status === 'ACTIVE') activeCount++;
    if (agent.status === 'PAUSED') pausedCount++;
    if (agent.status === 'TERMINATED') terminatedCount++;

    if (agent.spendingPolicy?.maxPerDay) {
      try {
        const raw = agent.spendingPolicy.maxPerDay.trim();
        if (/^\d+(\.\d+)?$/.test(raw)) {
          totalDailyBudgetBase += parseUnits(raw, 18);
        }
      } catch {
        // Skip malformed amounts gracefully
      }
    }
  }

  const formattedTotalDailyBudget = agents.length > 0
    ? formatUnits(totalDailyBudgetBase, 18)
    : '0.00';

  return (
    <div className="space-y-8">
      {/* Overview Page Heading & Network Context */}
      <OverviewHeader ownerAddress={ownerAddress} chainId={chainId} />

      {/* Local Error State Banner (Section 14) */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {fetchError}</span>
          <button
            onClick={fetchDashboardData}
            className="px-3 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-200 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Row 1: Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewStatCard
          title="Total Agents"
          value={agents.length}
          subtitle={agents.length === 1 ? '1 registered agent' : `${agents.length} registered agents`}
          badge={{ text: 'Control Plane', variant: 'slate' }}
          isLoading={isLoadingData}
        />

        <OverviewStatCard
          title="Active Agents"
          value={activeCount}
          subtitle={pausedCount > 0 ? `${pausedCount} paused` : 'All operational'}
          badge={{ text: 'Operational', variant: 'emerald' }}
          isLoading={isLoadingData}
        />

        <OverviewStatCard
          title="Pending Approvals"
          value={pendingApprovalsCount}
          subtitle={pendingApprovalsCount > 0 ? 'Needs attention' : 'Queue clear'}
          badge={
            pendingApprovalsCount > 0
              ? { text: 'Action Needed', variant: 'amber' }
              : { text: 'Clear', variant: 'emerald' }
          }
          isLoading={isLoadingData}
        />

        <OverviewStatCard
          title="Daily Budget Cap"
          value={`$${formattedTotalDailyBudget}`}
          subtitle="cUSD allocated"
          badge={{ text: 'Stablecoin', variant: 'sky' }}
          isLoading={isLoadingData}
        />
      </div>

      {/* Row 2: Agent Summary, Spending Overview & Approvals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <AgentSummary
          totalAgents={agents.length}
          activeCount={activeCount}
          pausedCount={pausedCount}
          terminatedCount={terminatedCount}
          isLoading={isLoadingData}
        />

        <SpendingOverview
          totalDailyBudgetFormatted={formattedTotalDailyBudget}
          hasAgents={agents.length > 0}
          isLoading={isLoadingData}
        />

        <ApprovalSummary
          pendingApprovalsCount={pendingApprovalsCount}
          isLoading={isLoadingData}
        />
      </div>

      {/* Row 3: Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <RecentActivity isLoading={isLoadingData} />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
