import mongoose from 'mongoose';
import * as C from '@hr-blockbot/contracts';
import { TaskInstanceModel as Task } from '../models/TaskInstance.js';
import { EvaluationModel as Evaluation } from '../models/Evaluation.js';
import { resolvePrincipal } from './principal.service.js';
import { notifyUser } from './notification.service.js';
import { performanceNotificationContent } from './performance-notification-content.js';
import { performanceEnabled,pid,scopedRead,pdto } from './performance-kpi-common.service.js';
import { canReadTask } from './task-instance.service.js';
const eventType=(action:string):C.NotificationType|null=>({TASK_ASSIGN:'task_assigned',TASK_ACCEPT:'task_accepted',TASK_REFUSE:'task_refused',TASK_SUBMIT:'task_submitted',TASK_EVALUATE:'task_evaluated',TASK_HANDOVER:'task_handover',EVALUATION_OPENED:'performance_kpi_opened','EVALUATION_MANAGER-SCORE':'performance_kpi_score_ready',EVALUATION_FINALIZE:'performance_kpi_finalized',EVALUATION_RECONSIDERATION:'performance_kpi_reconsideration_requested','EVALUATION_RECONSIDERATION-RESPONSE':'performance_kpi_reconsideration_responded',EVALUATION_APPEAL:'performance_kpi_appeal_requested','EVALUATION_APPEAL-DECISION':'performance_kpi_appeal_decided',EVALUATION_CORRECT:'performance_kpi_corrected'} as Record<string,C.NotificationType>)[action]??null;
async function queue(row:any,type:C.NotificationType,key:string){const task=!!row.templateSnapshot,employees=task?[row.assigneeEmployeeId,row.assignerEmployeeId,...row.responsibilitySegments.map((s:any)=>s.employeeId)]:[row.employeeId,row.evaluatorEmployeeId,row.appeal?.reviewerEmployeeId];if(type==='performance_kpi_appeal_requested'||type==='task_refused'){const reviewers=await mongoose.connection.collection('users').find({status:'active','authorization.profile':{$in:['am','hr']},employeeId:{$ne:null}},{projection:{employeeId:1}}).limit(501).toArray();if(reviewers.length>500)throw Error('Review recipient limit');employees.push(...reviewers.map(r=>String(r.employeeId)));}await mongoose.connection.collection<any>('performance_kpi_events').updateOne({_id:pid(key)},{$setOnInsert:{type,entityKind:task?'task':'performance_kpi',entityId:row.id,dedupeKey:key,employeeIds:[...new Set(employees.filter(Boolean))],at:new Date(),delivered:[],completedAt:null}},{upsert:true});}
async function deliver(event: any) {
  const content = performanceNotificationContent(event.type, event.dedupeKey);
  const rows = await mongoose.connection.collection('users').find({
    employeeId: { $in: event.employeeIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
    status: 'active',
  }).limit(100).toArray();
  for (const r of rows) {
    if (event.delivered.includes(String(r._id))) continue;
    try {
      const u = await resolvePrincipal({ sub: String(r._id), role: r.role, securityVersion: r.securityVersion ?? 0 });
      if (event.entityKind === 'task') {
        const task = await Task.findById(event.entityId).lean();
        if (!task) continue;
        await canReadTask(u, pdto(C.TaskInstanceSchema, task));
      } else {
        const evaluation: any = await Evaluation.findById(event.entityId).lean();
        if (!evaluation?.performanceSnapshot) continue;
        await scopedRead(u, evaluation.performanceSnapshot.employeeId, evaluation.performanceSnapshot.storeId);
      }
      await notifyUser({
        userId: u.userId, employeeId: u.employeeId, type: event.type,
        title: content?.title ?? (event.entityKind === 'task' ? 'Cập nhật nhiệm vụ' : 'Cập nhật KPI hiệu suất'),
        body: content?.body ?? 'Mở mục KPI hiệu suất để xem nội dung cập nhật.',
        severity: content?.severity, actionRef: event.entityId,
        dedupeKey: event.dedupeKey, entityKind: event.entityKind, entityId: event.entityId,
      });
      await mongoose.connection.collection<any>('performance_kpi_events').updateOne({ _id: event._id }, { $addToSet: { delivered: String(r._id) } });
    } catch (err: any) {
      if (![401, 403].includes(err?.status)) return;
    }
  }
  await mongoose.connection.collection<any>('performance_kpi_events').updateOne({ _id: event._id }, { $set: { completedAt: new Date() } });
}
export async function flushPerformanceNotices(result?:any){if(!performanceEnabled())return;const records:any[]=[];if(result?.templateSnapshot||result?.frameworkVersion)records.push(result);else if(result?.evaluations)records.push(...result.evaluations);else if(!result){for(const t of await Task.find().limit(2000).lean())records.push(pdto(C.TaskInstanceSchema,t));for(const e of await Evaluation.find({frameworkVersion:{$gte:2}}).limit(5000).lean() as any[])records.push(e.performanceSnapshot);}
 for(const row of records)for(const h of row.history??[]){const type=eventType(h.action);if(type)await queue(row,type,type+':'+row.id+':'+h.version);}
 for(const event of await mongoose.connection.collection<any>('performance_kpi_events').find({completedAt:null}).sort({at:-1}).limit(5000).toArray())await deliver(event);
}
export async function runPerformanceReminders(now=new Date()){if(!performanceEnabled())return;const {ensurePerformanceKpiStorage}=await import('./performance-kpi-storage.service.js');await ensurePerformanceKpiStorage();const tasks=(await Task.find({status:{$nin:['COMPLETED','CANCELLED']}}).limit(2000).lean()).map(r=>pdto(C.TaskInstanceSchema,r));for(const t of tasks){const due=t.extendedDueAt??t.dueAt,d=Date.parse(due)-now.getTime();if(d<0)await queue(t,'task_overdue','task_overdue:'+t.id+':'+due);else if(d<=86400000)await queue(t,'task_due_soon','task_due_soon:'+t.id+':'+due);}
 for(const row of await Evaluation.find({frameworkVersion:{$gte:2},evaluationStatus:'PENDING_DISPUTE'}).limit(5000).lean() as any[]){const e=row.performanceSnapshot,deadline=e.appeal?.decisionDeadlineAt??e.reconsideration?.responseDeadlineAt;if(deadline&&deadline<now.toISOString())await queue(e,'performance_kpi_appeal_requested','performance_kpi_response_overdue:'+e.id+':'+deadline);}
 await flushPerformanceNotices();
}
export function startPerformanceReminderScheduler(){if(!performanceEnabled())return;const timer=setInterval(()=>{void runPerformanceReminders().catch(()=>console.error('[PerformanceKpi] reminder deferred'));},15*60*1000);timer.unref();return timer;}
