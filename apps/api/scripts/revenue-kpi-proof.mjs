// Read-only pinned test evidence. Never prints documents, URI, users or secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { digest } from '../dist/services/project-audit.service.js';
import { BATCH, planPosDemo } from './seed-pos-demo.mjs';
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part; const c = JSON.parse(raw);
  if (c.dbName !== 'hr_bot_test_363') throw Error('Pinned test target');
  await mongoose.connect(c.uri, { dbName: c.dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db, protectedCollections = ['users', 'employees', 'stores', 'departments', 'management_relations', 'sm_appointments', 'projects', 'evaluations', 'schedule_entries', 'schedule_weeks', 'schedule_blocks', 'attendance_corrections', 'operational_shift_definitions', 'operational_schedule_weeks', 'cash_counts', 'cash_summary'];
  const result = { at: new Date().toISOString(), phase: c.phase, protected: {}, pos: {} };
  await fs.mkdir(c.privateDirectory, { recursive: true });
  for (const name of protectedCollections) {
    const rows = await db.collection(name).find({}).sort({ _id: 1 }).toArray(); result.protected[name] = { count: rows.length, hash: digest(rows) };
  }
  const orders = await db.collection('pos_orders').find({}).sort({ _id: 1 }).toArray();
  if (c.phase === 'before') {
    await fs.writeFile(path.join(c.privateDirectory, 'before-pos.private.ejson'), mongoose.mongo.BSON.EJSON.stringify(orders, { relaxed: false }), { flag: 'wx' });
    await fs.writeFile(path.join(c.privateDirectory, 'before-proof.private.json'), JSON.stringify(result), { flag: 'wx' });
  } else {
    const old = mongoose.mongo.BSON.EJSON.parse(await fs.readFile(path.join(c.privateDirectory, 'before-pos.private.ejson'), 'utf8'), { relaxed: true });
    const oldProof = JSON.parse(await fs.readFile(path.join(c.privateDirectory, 'before-proof.private.json'), 'utf8'));
    const oldIds = new Set(old.map(o => String(o._id))), retained = orders.filter(o => oldIds.has(String(o._id)));
    if (digest(old) !== digest(retained)) throw Error('Old POS changed');
    if (digest(result.protected) !== digest(oldProof.protected)) throw Error('Protected collection changed');
    const stores = await db.collection('stores').find({}).sort({ _id: 1 }).toArray(), expected = planPosDemo(stores, new Date(c.seedNow), '2026-07-01'), byId = new Map(orders.map(o => [String(o._id), o]));
    let mismatches = 0;
    for (const p of expected) { const a = byId.get(String(p._id)); if (!a || Object.keys(p).some(k => digest(a[k]) !== digest(p[k]))) mismatches++; }
    if (mismatches) throw Error('Seed reconciliation mismatch');
    Object.assign(result.pos, { oldOrders: old.length, oldOrdersUnchanged: true, protectedUnchanged: true, expectedBatchCount: expected.length, actualBatchCount: orders.filter(o => o.source === 'demo' && o.batchId === BATCH).length, mismatches, inserted: orders.length - old.length,
      uniqueOrderIds: new Set(orders.map(o => o.orderId)).size, stores: new Set(expected.map(o => String(o.storeId))).size, futureGenerated: expected.filter(o => o.orderedAt > new Date(c.seedNow)).length });
  }
  result.pos.total = orders.length; result.status = c.phase === 'before' ? 'PASS_BEFORE_SNAPSHOT' : 'PASS_ADDITIVE_SEED_RECONCILIATION';
  await fs.writeFile(path.join(c.privateDirectory, c.phase + '-result.private.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ status: 'REVENUE_PROOF_STOPPED', details: 'Inspect private evidence; secrets omitted' })); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
