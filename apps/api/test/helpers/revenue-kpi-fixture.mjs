import { authorizationV1Fixture } from './authorization-v1-fixture.mjs';
import { UserModel } from '../../dist/models/User.js';
import { SmAppointmentModel } from '../../dist/models/SmAppointment.js';
import { PosOrderModel } from '../../dist/models/PosOrder.js';
import { resolvePrincipal } from '../../dist/services/principal.service.js';
import { randomUUID } from 'node:crypto';
export const command = (version, extra = {}) => ({ expectedVersion: version, clientRequestId: randomUUID(), ...extra });
export async function revenueFixture() {
  process.env.REVENUE_KPI_ENABLED = 'true'; const f = await authorizationV1Fixture();
  for (const alias of ['hr', 'hr2', 'am', 'sm']) {
    const role = alias === 'hr2' ? 'hr' : alias;
    const self = role === 'hr' ? ['revenue_kpi.read_self'] : ['revenue_kpi.read_self', 'revenue_kpi.respond', 'revenue_kpi.request_adjustment'];
    const org = role === 'hr' ? ['revenue_kpi.read_scope', 'revenue_kpi.assign', 'revenue_kpi.approve', 'revenue_kpi.close'] : role === 'am' ? ['revenue_kpi.read_scope', 'revenue_kpi.verify_adjustment'] : [];
    await UserModel.updateOne({ _id: f.actors[alias].user._id }, { $addToSet: { 'authorization.grants.0.capabilities': { $each: self }, 'authorization.grants.1.capabilities': { $each: org } } });
  }
  const now = new Date().toISOString();
  await SmAppointmentModel.create({ employeeId: f.actors.sm.employee._id, storeId: f.stores[0]._id, clientRequestId: randomUUID(), payloadHash: 'fixture', kind: 'PRIMARY', status: 'APPROVED', validFrom: new Date('2026-01-01'), validUntil: null,
    evidenceRef: 'Owner-approved isolated fixture', basis: 'SIMULATION_APPROVED', reason: 'Isolated test', requestedBy: f.actors.hr.user._id, requesterEmployeeId: f.actors.hr.employee._id, approvedBy: f.actors.hr2.user._id, approvedAt: new Date(), version: 1, history: [] });
  for (const period of ['2026-07', '2026-08', '2026-09', '2026-10']) await PosOrderModel.create({ orderId: 'KPI-' + period, storeId: f.stores[0]._id, orderedAt: new Date(period + '-10T06:30:00+07:00'), source: 'demo', ledgerVersion: 1,
    status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000, items: [{ productId: 'T', productName: 'Đơn giả lập', quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }] });
  return { ...f, principal: name => resolvePrincipal({ sub: String(f.actors[name].user._id), role: f.actors[name].user.role, securityVersion: 0 }) };
}
