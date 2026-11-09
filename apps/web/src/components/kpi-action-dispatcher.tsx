import React from 'react';
import type { RevenueKpiChatAction, PerformanceKpiChatAction, ScheduleChatAction } from '@hr-blockbot/contracts';
import { RevenueKpiOpenCard } from './RevenueKpiOpenCard';
import { KpiActionCard } from './kpi-action-card';
import { ScheduleActionCard } from './schedule-action-card';

export interface KpiActionDispatcherProps {
  action: RevenueKpiChatAction | PerformanceKpiChatAction | ScheduleChatAction;
  onExecuted?: () => void;
}

export const KpiActionDispatcher: React.FC<KpiActionDispatcherProps> = ({ action, onExecuted }) => {
  if (action.type.startsWith('schedule.')) {
    return <ScheduleActionCard key={action.actionId} initial={action as ScheduleChatAction} onExecuted={onExecuted} />;
  }
  if (action.type === 'revenue_kpi.open_period') {
    return <RevenueKpiOpenCard key={action.actionId} initial={action} onExecuted={onExecuted} />;
  }
  return <KpiActionCard key={action.actionId} initial={action as RevenueKpiChatAction | PerformanceKpiChatAction} onExecuted={onExecuted} />;
};
