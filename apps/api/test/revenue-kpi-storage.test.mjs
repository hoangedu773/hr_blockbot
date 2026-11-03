import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { ensureRevenueKpiStorage } from '../dist/services/revenue-kpi-storage.service.js';
before(async () => { mongoose.set('autoCreate', false).set('autoIndex', false); await connectDB(); });
after(disconnectDB);
test('explicit provisioning returns safe 503 on permission failure, then retries successfully', async () => {
  const db = mongoose.connection.db, original = db.createCollection;
  db.createCollection = async () => { throw Object.assign(new Error('owned denied fixture'), { code: 13 }); };
  try { await assert.rejects(ensureRevenueKpiStorage(), e => e.status === 503 && e.code === 'REVENUE_KPI_STORAGE_UNAVAILABLE' && !e.message.includes('owned')); }
  finally { db.createCollection = original; }
  await ensureRevenueKpiStorage(); await ensureRevenueKpiStorage();
  const names = (await db.listCollections().toArray()).map(c => c.name);
  for (const name of ['revenue_kpi_periods', 'revenue_kpi_assignments', 'revenue_kpi_results', 'revenue_kpi_grants']) assert.ok(names.includes(name));
});
