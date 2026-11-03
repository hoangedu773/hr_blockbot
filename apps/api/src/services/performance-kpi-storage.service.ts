import mongoose from 'mongoose';
import { PerformanceKpiFrameworkModel } from '../models/PerformanceKpiFramework.js';
import { PerformanceKpiPolicyModel } from '../models/PerformanceKpiPolicy.js';
import { TaskTemplateModel } from '../models/TaskTemplate.js';
import { TaskInstanceModel } from '../models/TaskInstance.js';
import { TaskEvaluationModel } from '../models/TaskEvaluation.js';
import { EvaluationModel } from '../models/Evaluation.js';
import { NotificationModel } from '../models/Notification.js';
import { WorkflowError } from './project-workflow.service.js';
const ready=new WeakMap<object,Promise<void>>();
export async function ensurePerformanceKpiStorage(){
 const db=mongoose.connection.db;if(!db)throw new WorkflowError(503,'PERFORMANCE_KPI_STORAGE_UNAVAILABLE','Lưu trữ KPI hiệu suất chưa sẵn sàng.');
 if(!ready.has(db))ready.set(db,(async()=>{
  for(const m of [PerformanceKpiFrameworkModel,PerformanceKpiPolicyModel,TaskTemplateModel,TaskInstanceModel,TaskEvaluationModel,EvaluationModel,NotificationModel]){
   try{await db.createCollection(m.collection.name);}catch(e:any){if(e.code!==48)throw e;}
   for(const [keys,options]of m.schema.indexes())try{await m.collection.createIndex(keys as any,options as any);}catch(e:any){if(![85,86].includes(e.code))throw e;const old=await m.collection.indexes();if(!old.some((i:any)=>JSON.stringify(i.key)===JSON.stringify(keys)&&!!i.unique===!!options.unique&&JSON.stringify(i.partialFilterExpression)===JSON.stringify(options.partialFilterExpression)))throw e;}
  }
  for(const name of ['performance_kpi_grants','performance_kpi_events']){try{await db.createCollection(name);}catch(e:any){if(e.code!==48)throw e;}}
  await db.collection('performance_kpi_grants').createIndex({userId:1,sourceGrantId:1},{unique:true});
  await db.collection('evaluations').createIndex({period:1,frameworkVersion:1,evaluationStatus:1});
  // A shared old Main binary must not mutate a v2 record through a v1 endpoint.
  // Existing v1 rows bypass this validator. Never replace an unrelated validator.
  const info:any=await db.listCollections({name:'evaluations'}).next();
  const validator={$or:[{frameworkVersion:{$exists:false}},{frameworkVersion:null},{frameworkVersion:1},{$and:[{frameworkVersion:{$gte:2}},{$expr:{$and:[{$eq:['$version','$performanceSnapshot.version']},{$eq:['$finalScore','$performanceSnapshot.finalScore']},{$eq:['$employeeId',{$toObjectId:'$performanceSnapshot.employeeId'}]},{$eq:['$period','$performanceSnapshot.period']},{$eq:['$status','OPEN']},{$eq:['$managerReview',null]},{$eq:['$selfReview',null]},{$eq:[{$size:{$ifNull:['$history',[]]}},0]}]}}]}]};
  const existing=info?.options?.validator;
  if(existing&&Object.keys(existing).length&&JSON.stringify(existing)!==JSON.stringify(validator))throw Error('Unreviewed evaluations validator');
  await db.command({collMod:'evaluations',validator,validationLevel:'strict',validationAction:'error'});
 })().catch(()=>{ready.delete(db);throw new WorkflowError(503,'PERFORMANCE_KPI_STORAGE_UNAVAILABLE','Chưa thể khởi tạo lưu trữ KPI hiệu suất.');}));
 await ready.get(db);
}
