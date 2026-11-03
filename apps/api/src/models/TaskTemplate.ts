import { TaskTemplateSchema } from '@hr-blockbot/contracts';
import { performanceModel } from './performance-model.js';
export const TaskTemplateModel=performanceModel('TaskTemplate','task_templates',TaskTemplateSchema,[[{'content.code':1,templateVersion:1},{unique:true}]]);
