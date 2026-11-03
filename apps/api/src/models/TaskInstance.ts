import { TaskInstanceSchema } from '@hr-blockbot/contracts';
import { performanceModel } from './performance-model.js';
export const TaskInstanceModel=performanceModel('TaskInstance','task_instances',TaskInstanceSchema,[[{storeId:1,kpiPeriod:1,status:1}],[{assigneeEmployeeId:1,kpiPeriod:1}],[{templateId:1,templateVersion:1}],[{projectId:1,status:1}]]);
