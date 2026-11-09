import React from 'react';
import type { RevenueKpiChatAction, PerformanceKpiChatAction } from '@hr-blockbot/contracts';
import { RevenueKpiOpenCard } from './RevenueKpiOpenCard';
import { KpiActionCard } from './kpi-action-card';

export interface KpiActionDispatcherProps {
  action: RevenueKpiChatAction | PerformanceKpiChatAction;
  onExecuted?: () => void;
}

export const KpiActionDispatcher: React.FC<KpiActionDispatcherProps> = ({ action, onExecuted }) => {
  if (action.type === 'revenue_kpi.open_period') {
    return <RevenueKpiOpenCard key={action.actionId} initial={action} onExecuted={onExecuted} />;
  }
  return <KpiActionCard key={action.actionId} initial={action} onExecuted={onExecuted} />;
};
