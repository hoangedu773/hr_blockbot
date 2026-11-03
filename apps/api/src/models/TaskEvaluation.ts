import { TaskEvaluationSchema } from '@hr-blockbot/contracts';
import { performanceModel } from './performance-model.js';
export const TaskEvaluationModel=performanceModel('TaskEvaluation','task_evaluations',TaskEvaluationSchema,[[{taskId:1,version:1},{unique:true}],[{evaluatorEmployeeId:1,evaluatedAt:1}]]);
