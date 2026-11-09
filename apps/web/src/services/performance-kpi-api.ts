import type { F4Suggestions, PerformanceDashboardSchema,PerformanceFramework,PerformancePolicy,PerformanceEvaluation,TaskInstance,TaskTemplate,PerformanceExplainSchema,TaskStructureSuggestionSchema,PerformanceAiSummarySchema } from '@hr-blockbot/contracts';
import { requestJson } from './api';
export type PerformanceCatalog={employees:{id:string;name:string;role:'STAFF'|'PTCH'|'SM';storeId:string;storeName:string}[];stores:{id:string;name:string}[]};
export const performanceConfig=()=>requestJson<{enabled:boolean}>('/performance-kpi/config');
export const performanceDashboard=(period:string)=>requestJson<ReturnType<typeof PerformanceDashboardSchema.parse>>('/performance-kpi/dashboard?period='+encodeURIComponent(period));
export const performanceCatalog=()=>requestJson<PerformanceCatalog>('/performance-kpi/catalog');
export const performanceFrameworks=()=>requestJson<{items:PerformanceFramework[]}>('/performance-kpi/frameworks');
export const performancePolicies=(period:string)=>requestJson<{items:PerformancePolicy[]}>('/performance-kpi/policies/'+period);
export const performanceTemplates=()=>requestJson<{items:TaskTemplate[]}>('/tasks/templates');
export const performanceTasks=(period:string)=>requestJson<{items:TaskInstance[]}>('/tasks?period='+encodeURIComponent(period));
export const performanceTask=(id:string)=>requestJson<TaskInstance>('/tasks/'+id);
export const performanceEvaluation = (id: string) => requestJson<PerformanceEvaluation>('/performance-kpi/evaluations/' + encodeURIComponent(id));
export const performanceExplain=(id:string)=>requestJson<ReturnType<typeof PerformanceExplainSchema.parse>>('/performance-kpi/evaluations/'+id+'/explain');
export const performancePost=<T=unknown>(path:string,body:unknown)=>requestJson<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const performanceEvaluationAction=(id:string,action:string,body:unknown)=>performancePost<PerformanceEvaluation>('/performance-kpi/evaluations/'+id+'/'+action,body);
export const performanceTaskAction=(id:string,action:string,body:unknown)=>performancePost<TaskInstance>('/tasks/'+id+'/'+action,body);
export const performanceSuggest=(body:unknown)=>performancePost<ReturnType<typeof TaskStructureSuggestionSchema.parse>>('/tasks/suggest-structure',body);
export const performanceSummary=(id:string,body:unknown)=>performancePost<ReturnType<typeof PerformanceAiSummarySchema.parse>>('/performance-kpi/evaluations/'+id+'/ai-summary',body);

export const suggestDraftTaskCandidates = (body: { storeId: string; description: string; dueAt: string; requiredSkills: string[] }) =>
  performancePost<F4Suggestions>('/tasks/suggest-candidates', body);
export const suggestTaskCandidates = (id: string, requiredSkills?: string[]) =>
  performancePost<F4Suggestions>('/tasks/' + encodeURIComponent(id) + '/suggest-candidates', { requiredSkills });
