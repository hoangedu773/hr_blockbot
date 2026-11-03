import { PerformancePolicySchema } from '@hr-blockbot/contracts';
import { performanceModel } from './performance-model.js';
export const PerformanceKpiPolicyModel=performanceModel('PerformanceKpiPolicy','performance_kpi_policies',PerformancePolicySchema,[[{period:1,role:1},{unique:true}]]);
