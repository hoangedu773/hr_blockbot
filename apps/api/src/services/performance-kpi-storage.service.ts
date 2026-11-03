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
  // Atlas shared tiers may reject collMod. Keep an unrelated validator untouched.
  // v2 uses legacy ANALYZED + machineScore=null: every released v1 writer rejects
  // that combination before changing data. Exercise the actual pinned v1 code.
  const info:any=await db.listCollections({name:'evaluations'}).next();
  if(info?.options?.validator&&Object.keys(info.options.validator).length)throw Error('Unreviewed evaluations validator');
 })().catch((e:any)=>{ready.delete(db);throw Object.assign(new WorkflowError(503,'PERFORMANCE_KPI_STORAGE_UNAVAILABLE','Chưa thể khởi tạo lưu trữ KPI hiệu suất.'),{storageCauseCode:e.code??e.codeName??'UNKNOWN'});}));
 await ready.get(db);
}
