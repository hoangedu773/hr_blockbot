import './require-isolated-db.mjs';
import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB,disconnectDB } from '../dist/db.js';
import { ensurePerformanceKpiStorage } from '../dist/services/performance-kpi-storage.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { makePerformanceModuleGrant,withPerformanceModuleGrants } from '../dist/services/performance-kpi-grants.service.js';
import { AuthorizationStateSchema } from '@hr-blockbot/contracts';
before(async()=>{await connectDB();});after(disconnectDB);
test('storage denial is a safe retryable 503; unrelated collection validator is preserved',async()=>{
 const db=mongoose.connection.db,create=db.createCollection;db.createCollection=async()=>{throw Object.assign(new Error('fixture secret'),{code:13});};try{await assert.rejects(ensurePerformanceKpiStorage(),e=>e.status===503&&!e.message.includes('secret'));}finally{db.createCollection=create;}await db.createCollection('evaluations',{validator:{period:{$exists:true}}});await assert.rejects(ensurePerformanceKpiStorage(),e=>e.status===503);assert.deepEqual((await db.listCollections({name:'evaluations'}).next()).options.validator,{period:{$exists:true}});await db.command({collMod:'evaluations',validator:{}});await ensurePerformanceKpiStorage();await ensurePerformanceKpiStorage();for(const name of ['performance_kpi_frameworks','performance_kpi_policies','task_templates','task_instances','task_evaluations','performance_kpi_grants','performance_kpi_events'])assert.ok(await db.listCollections({name}).hasNext());
});
test('separate grants preserve source authorization and enforce binding, profile, scope, revocation and feature flag for staff/PTCH',async()=>{
 const f=await authorizationV1Fixture();process.env.PERFORMANCE_KPI_ENABLED='true';const grants=mongoose.connection.collection('performance_kpi_grants');
 for(const alias of ['staff','ptch','sm','am','hr']){const u=f.actors[alias].user,original=await mongoose.connection.collection('users').findOne({_id:u._id}),state=AuthorizationStateSchema.parse(original.authorization),rows=state.grants.map(g=>makePerformanceModuleGrant(String(u._id),state,g,String(f.actors.hr.user._id))).filter(Boolean);await grants.insertMany(rows);const withGrants=await withPerformanceModuleGrants(String(u._id),state);assert.ok(withGrants.grants.some(g=>g.capabilities.includes('performance_kpi.read_self')));assert.equal((await mongoose.connection.collection('users').findOne({_id:u._id})).authorization.grants.length,state.grants.length);const source=state.grants.find(g=>g.scope.kind==='self');const changed=structuredClone(state);changed.grants.find(g=>g.id===source.id).validFrom=new Date(Date.now()-120000).toISOString();assert.ok(!(await withPerformanceModuleGrants(String(u._id),changed)).grants.some(g=>g.capabilities.includes('task.respond')));const revoked=structuredClone(state);revoked.grants.find(g=>g.id===source.id).revokedAt=new Date().toISOString();assert.ok(!(await withPerformanceModuleGrants(String(u._id),revoked)).grants.some(g=>g.capabilities.includes('task.respond')));assert.deepEqual((await mongoose.connection.collection('users').findOne({_id:u._id})).authorization,original.authorization);}
 const staff=f.actors.staff.user,state=AuthorizationStateSchema.parse(staff.authorization);process.env.PERFORMANCE_KPI_ENABLED='false';assert.deepEqual(await withPerformanceModuleGrants(String(staff._id),state),state);process.env.PERFORMANCE_KPI_ENABLED='true';
});
