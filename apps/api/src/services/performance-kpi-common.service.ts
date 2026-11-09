import mongoose from 'mongoose';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser as User } from '../middlewares/auth.middleware.js';
import { resolvePrincipal } from './principal.service.js';
import { withCrmWriter } from './crm-writer.service.js';
import { WorkflowError } from './project-workflow.service.js';
import { requireCapability,hasCapability,resourceScope } from './authorization-scope.service.js';
import { digest } from './project-audit.service.js';
import { ensurePerformanceKpiStorage } from './performance-kpi-storage.service.js';
export const performanceEnabled=()=>process.env.PERFORMANCE_KPI_ENABLED==='true';
export function pfail(code:string,message:string,status=409):never{throw new WorkflowError(status,code.startsWith('PERFORMANCE_')||code==='REPORTING_RELATION_REQUIRED'||code==='RBAC_DENIED'?code:'PERFORMANCE_KPI_'+code,message);};
export const pid=(s:string)=>digest(s).slice(0,24);
export const nowIso=()=>new Date().toISOString();
export const profile=(u:User)=>u.authorization?.profile??'';
export const toRow=(v:any)=>{const {id,...body}=v;return {_id:id,...body};};
export function pdto(schema:any,r:any):any{if(!r)return null;const {_id,...body}=r.toObject?r.toObject():r;return schema.parse({id:String(_id),...body});}
export async function pfresh(user:User){if(!performanceEnabled())pfail('DISABLED','KPI hiệu suất chưa được bật.',503);const u=await resolvePrincipal({sub:user.userId,role:user.role,securityVersion:user.securityVersion});if(!['hr','am','sm','ptch','staff'].includes(profile(u)))pfail('RBAC_DENIED','Bạn chưa có quyền sử dụng KPI hiệu suất.',403);await ensurePerformanceKpiStorage();return u;}
export async function pwrite<T>(u:User,fn:(user:User)=>Promise<T>){const result=await withCrmWriter(async()=>fn(await pfresh(u)));try{const {flushPerformanceNotices}=await import('./performance-kpi-notification.service.js');await flushPerformanceNotices(result);}catch{console.error('[PerformanceKpi] notice delivery deferred');}return result;}
export function policyAuthority(u:User){if(profile(u)!=='hr')pfail('RBAC_DENIED','Chỉ HR được công bố chính sách.',403);requireCapability(u,'performance_kpi.policy_manage');}
export function ownAuthority(u:User,employeeId:string,cap:C.AuthorizationCapability='performance_kpi.read_self'){if(u.employeeId!==employeeId)pfail('RBAC_DENIED','Chỉ được thực hiện cho hồ sơ của mình.',403);requireCapability(u,cap,{employeeId});}
export async function employeeRole(employeeId:string){const rows=await mongoose.connection.collection('users').find({employeeId:new mongoose.Types.ObjectId(employeeId),status:'active'}).limit(2).toArray();if(rows.length!==1||!['staff','ptch','sm'].includes(rows[0]?.authorization?.profile))pfail('RESPONSIBILITY_CONFLICT','Chưa xác định được vai trò KPI của nhân viên.');return String(rows[0].authorization.profile).toUpperCase() as 'STAFF'|'PTCH'|'SM';}
export async function subject(employeeId:string){C.PerformanceId.parse(employeeId);const e=await mongoose.connection.collection('employees').findOne({_id:new mongoose.Types.ObjectId(employeeId),status:'active'});if(!e||!e.storeMappingRef||e.lifecyclePendingRequestId)pfail('RESPONSIBILITY_CONFLICT','Hồ sơ nhân viên chưa có cửa hàng hợp lệ.');return e!;}
export async function directManager(u:User,employeeId:string,storeId:string,cap:C.AuthorizationCapability){
 if(u.employeeId===employeeId)pfail('SELF_APPROVAL','Không được tự chấm hoặc tự duyệt.',403);
 const role=await employeeRole(employeeId);if((role==='SM'&&profile(u)!=='am')||(role!=='SM'&&profile(u)!=='sm'))pfail('RBAC_DENIED','Cần người quản lý trực tiếp đúng cấp chấm.',403);
 const e=await subject(employeeId);if(String(e.storeId)!==storeId)pfail('RESPONSIBILITY_CONFLICT','Nhân sự đã đổi cửa hàng; cần đối chiếu trách nhiệm.');
 const edge=await directEdge(u.employeeId!,employeeId,storeId);if(!edge)pfail('REPORTING_RELATION_REQUIRED','Chưa có quan hệ quản lý trực tiếp được phê duyệt.',403);
 requireCapability(u,cap,resourceScope(u,{storeId,storeMappingRef:e.storeMappingRef,employeeId}));
 return role;
}
export async function directEdge(managerEmployeeId:string,employeeId:string,storeId:string){return mongoose.connection.collection('management_relations').findOne({managerEmployeeId:new mongoose.Types.ObjectId(managerEmployeeId),employeeId:new mongoose.Types.ObjectId(employeeId),storeId:new mongoose.Types.ObjectId(storeId),approvalRef:{$type:'string',$ne:''},revokedAt:null,validFrom:{$lte:new Date()},$or:[{validUntil:null},{validUntil:{$gt:new Date()}}]});}
export async function scopedRead(u:User,employeeId:string,storeId:string){if(u.employeeId===employeeId){ownAuthority(u,employeeId);return;}
 requireCapability(u,'performance_kpi.read_scope',resourceScope(u,{storeId,storeMappingRef:'performance-kpi',employeeId}));
 if(profile(u)==='hr')return;
 if(profile(u)==='am'){const edge=await directEdge(u.employeeId!,employeeId,storeId);if(edge)return;const ancestors=await mongoose.connection.collection('management_relations').find({employeeId:new mongoose.Types.ObjectId(employeeId),storeId:new mongoose.Types.ObjectId(storeId)}).limit(50).toArray();for(const e of ancestors)if(await directEdge(String(e.managerEmployeeId),employeeId,storeId)&&await directEdge(u.employeeId!,String(e.managerEmployeeId),storeId))return;}
 if(profile(u)==='sm'&&await directEdge(u.employeeId!,employeeId,storeId))return;
 pfail('REPORTING_RELATION_REQUIRED','Hồ sơ không thuộc quan hệ quản lý được cấp.',403);
}
export function replay(row:any,u:User,action:string,input:any){const old=row.history.find((h:any)=>h.requestId===input.clientRequestId);if(!old)return false;if(old.by!==u.userId||old.action!==action||old.payloadHash!==digest(input))pfail('VERSION_CONFLICT','Mã yêu cầu đã dùng với nội dung khác.');return true;}
export function checkVersion(row:any,input:any){if(row.version!==input.expectedVersion)pfail('VERSION_CONFLICT','Dữ liệu đã thay đổi. Hãy tải lại.');}
const state=(v:any)=>{const {history,...rest}=v;return rest;};
export function pHistory(before:any,after:any,u:User,action:string,input:any){const h={at:nowIso(),by:u.userId,actorEmployeeId:u.employeeId??null,action,version:after.version,requestId:input.clientRequestId,payloadHash:digest(input),reason:input.reason??input.text??null,evidenceRefs:input.evidenceRefs??[],before:before?state(before):null,after:state(after),previousHash:before?.history.at(-1)?.hash??'0'.repeat(64)};return {...h,hash:digest(h)};}
export function verifyHistory(row:any){let hash='0'.repeat(64);for(const e of row.history){const {hash:h,...rest}=e;if(e.previousHash!==hash||digest(rest)!==h)pfail('RESPONSIBILITY_CONFLICT','Lịch sử không khớp; cần kiểm tra dữ liệu.');hash=h;}const last=row.history.at(-1);if(last&&digest(last.after)!==digest(state(row)))pfail('RESPONSIBILITY_CONFLICT','Hồ sơ không khớp lịch sử.');}
export async function pcreate(model:any,schema:any,fields:any,u:User,action:string,input:any){if(input.expectedVersion!==0)pfail('VERSION_CONFLICT','Bản mới phải bắt đầu từ phiên bản 0.');const now=nowIso(),v={...fields,version:1,createdAt:now,updatedAt:now,history:[]};v.history=[pHistory(null,v,u,action,input)] as any;const row=schema.parse(v);try{return pdto(schema,await model.create(toRow(row)));}catch(e:any){if(e.code===11000)pfail('VERSION_CONFLICT','Hồ sơ đã tồn tại. Tải lại để đối chiếu.');throw e;}}
export async function pupdate(model:any,schema:any,row:any,changes:any,u:User,action:string,input:any){verifyHistory(row);if(replay(row,u,action,input))return row;checkVersion(row,input);if(row.history.length>=250)pfail('INVALID_STATE','Lịch sử đã đạt giới hạn; cần lưu trữ được kiểm chứng.');const next={...row,...changes,version:row.version+1,updatedAt:nowIso()};next.history=[...row.history,pHistory(row,next,u,action,input)];const v=schema.parse(next);if(mongoose.mongo.BSON.calculateObjectSize(toRow(v))>8*1024*1024)pfail('INVALID_STATE','Hồ sơ đã đạt giới hạn lưu trữ an toàn.');const result=await model.findOneAndUpdate({_id:row.id,version:row.version},{$set:toRow(v)},{new:true,runValidators:true});if(!result)pfail('VERSION_CONFLICT','Dữ liệu đã thay đổi.');return pdto(schema,result);}
export async function pget(model:any,schema:any,id:string){C.PerformanceId.parse(id);const v=pdto(schema,await model.findById(id).lean());if(!v)pfail('NOT_FOUND','Không tìm thấy hồ sơ.',404);verifyHistory(v);return v;}
