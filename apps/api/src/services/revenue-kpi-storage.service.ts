import mongoose from 'mongoose';
import { RevenueKpiPeriodModel } from '../models/RevenueKpiPeriod.js';
import { RevenueKpiAssignmentModel } from '../models/RevenueKpiAssignment.js';
import { RevenueKpiResultModel } from '../models/RevenueKpiResult.js';
import { NotificationModel } from '../models/Notification.js';
import { WorkflowError } from './project-workflow.service.js';
const initialized = new WeakMap<object, Promise<void>>();
export async function ensureRevenueKpiStorage() {
  const db = mongoose.connection.db;
  if (!db) throw new WorkflowError(503, 'REVENUE_KPI_STORAGE_UNAVAILABLE', 'Chưa thể lưu KPI doanh thu.');
  let ready = initialized.get(db);
  if (!ready) {
    ready = (async () => {
      for (const model of [RevenueKpiPeriodModel, RevenueKpiAssignmentModel, RevenueKpiResultModel, NotificationModel]) {
        try { await db.createCollection(model.collection.name); } catch (e: any) { if (e.code !== 48) throw e; }
        for (const [key, options] of model.schema.indexes()) {
          try { await model.collection.createIndex(key as any, options as any); }
          catch (e: any) {
            if (![85, 86].includes(e.code)) throw e;
            const existing = await model.collection.indexes();
            if (!existing.some((i: any) => JSON.stringify(i.key) === JSON.stringify(key) && !!i.unique === !!options.unique && JSON.stringify(i.partialFilterExpression) === JSON.stringify(options.partialFilterExpression))) throw e;
          }
        }
      }
      try { await db.createCollection('revenue_kpi_grants'); } catch (e: any) { if (e.code !== 48) throw e; }
      await db.collection('revenue_kpi_grants').createIndex({ userId: 1, sourceGrantId: 1 }, { unique: true });
      // Chat proposals that were never confirmed must not accumulate forever.
      // purgeAt is set only on creation and removed once a decision is stored, so
      // executed/cancelled proposals remain available to chat history.
      try { await db.createCollection('revenue_kpi_open_actions'); } catch (e: any) { if (e.code !== 48) throw e; }
      const actions = db.collection('revenue_kpi_open_actions');
      await actions.createIndex({ ownerId: 1, status: 1 });
      await actions.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 });
    })().catch(() => { initialized.delete(db); throw new WorkflowError(503, 'REVENUE_KPI_STORAGE_UNAVAILABLE', 'Chưa thể khởi tạo lưu trữ KPI doanh thu.'); });
    initialized.set(db, ready);
  }
  await ready;
}
