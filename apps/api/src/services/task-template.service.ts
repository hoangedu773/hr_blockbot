import * as C from '@hr-blockbot/contracts';
import { TaskTemplateModel as Template } from '../models/TaskTemplate.js';
import type { AuthenticatedUser as User } from '../middlewares/auth.middleware.js';
import { pfresh,pwrite,policyAuthority,pid,pget,pcreate,pupdate,pdto,pfail,nowIso,replay,profile } from './performance-kpi-common.service.js';
import { allowedStoreIds, requireCapability, resourceScope } from './authorization-scope.service.js';
export async function listTaskTemplates(user:User){const u=await pfresh(user);requireCapability(u,'task.read_scope');const hr = profile(u) === 'hr';
  const stores = allowedStoreIds(u, hr ? 'performance_kpi.policy_manage' : 'task.read_scope');
  const filter = hr
    ? { $or: [{ proposalStoreId: { $exists: false } }, { proposalStoreId: { $in: stores } }] }
    : { $or: [
      { status: 'PUBLISHED', $or: [{ proposalStoreId: { $exists: false } }, { proposalStoreId: { $in: stores } }] },
      { status: { $in: ['DRAFT', 'ARCHIVED'] }, proposalStoreId: { $in: stores }, 'history.0.by': u.userId },
    ] };
  return(await Template.find(filter).sort({'content.code':1,templateVersion:-1}).limit(200).lean()).map(r=>pdto(C.TaskTemplateSchema,r));}
export async function createTaskTemplate(user:User,body:any){const input=C.CreateTaskTemplateRequestSchema.parse(body);return pwrite(user,async u=>{policyAuthority(u);const id=pid('template-request:'+u.userId+':'+input.clientRequestId),old=await Template.findById(id).lean();if(old){const t=pdto(C.TaskTemplateSchema,old);if(replay(t,u,'TEMPLATE_CREATED',input))return t;}const prior:any=await Template.findOne({'content.code':input.content.code}).sort({templateVersion:-1}).lean();return pcreate(Template,C.TaskTemplateSchema,{id,content:input.content,templateVersion:(prior?.templateVersion??0)+1,status:'DRAFT',approvedBy:null,approvedAt:null,isDemo:false},u,'TEMPLATE_CREATED',input);});}
export async function proposeTaskTemplate(user: User, body: unknown) {
  const input = C.ProposeTaskTemplateRequestSchema.parse(body);
  return pwrite(user, async u => {
    requireCapability(u, 'task.manage', resourceScope(u, { storeId: input.storeId, storeMappingRef: 'task-template' }));
    const id = pid('template-proposal:' + u.userId + ':' + input.clientRequestId);
    const old = await Template.findById(id).lean();
    if (old) {
      const template = pdto(C.TaskTemplateSchema, old);
      if (replay(template, u, 'TEMPLATE_PROPOSED', input)) return template;
    }
    return pcreate(Template, C.TaskTemplateSchema, {
      id, content: { ...input.content, code: 'PROPOSED_' + id.toUpperCase() },
      proposalStoreId: input.storeId, templateVersion: 1, status: 'DRAFT',
      approvedBy: null, approvedAt: null, isDemo: false,
    }, u, 'TEMPLATE_PROPOSED', input);
  });
}

function requireProposalReviewer(u: User, t: C.TaskTemplate) {
  if (!t.proposalStoreId) return;
  requireCapability(u, 'performance_kpi.policy_manage', resourceScope(u, { storeId: t.proposalStoreId, storeMappingRef: 'task-template' }));
  if (t.history[0]?.by === u.userId) pfail('SELF_APPROVAL', 'Cần HR khác duyệt mẫu đã đề xuất.', 403);
}

export async function rejectTaskTemplateProposal(user: User, id: string, body: unknown) {
  const input = C.TaskReasonRequestSchema.parse(body);
  return pwrite(user, async u => {
    policyAuthority(u);
    const template = await pget(Template, C.TaskTemplateSchema, id);
    if (!template.proposalStoreId) pfail('INVALID_STATE', 'Mẫu này không phải đề xuất của cửa hàng.');
    requireProposalReviewer(u, template);
    if (replay(template, u, 'TEMPLATE_PROPOSAL_REJECTED', input)) return template;
    if (template.status !== 'DRAFT') pfail('INVALID_STATE', 'Đề xuất đã được xử lý.');
    return pupdate(Template, C.TaskTemplateSchema, template, { status: 'ARCHIVED' }, u, 'TEMPLATE_PROPOSAL_REJECTED', input);
  });
}

export async function publishTaskTemplate(user:User,id:string,body:any){const input=C.TaskReasonRequestSchema.parse(body);return pwrite(user,async u=>{policyAuthority(u);const t=await pget(Template,C.TaskTemplateSchema,id);requireProposalReviewer(u,t);if(replay(t,u,'TEMPLATE_PUBLISHED',input))return t;if(t.status!=='DRAFT')pfail('INVALID_STATE','Chỉ công bố mẫu nhiệm vụ nháp.');C.TaskTemplateContentSchema.parse(t.content);return pupdate(Template,C.TaskTemplateSchema,t,{status:'PUBLISHED',approvedBy:u.userId,approvedAt:nowIso()},u,'TEMPLATE_PUBLISHED',input);});}
