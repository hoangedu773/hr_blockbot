// Owner requested completion of the POS demo. Secrets only through stdin, no blanket delete.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { withAccountSecurityLock } from '../dist/services/account-security.service.js';
import { verifyAccessToken } from '../dist/services/auth.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { requireCapability } from '../dist/services/authorization-scope.service.js';
import { digest } from '../dist/services/project-audit.service.js';

export const BATCH = 'OWNER_POS_DEMO_20261103';
const products = [ ['CAFE-SUA-DA', 'Cà phê sữa đá', 28000], ['CAFE-DEN-DA', 'Cà phê đen đá', 26000],
  ['TRA-DAO', 'Trà đào', 32000], ['BAC-XIU-DA', 'Bạc xỉu đá', 35000], ['BANH-MI', 'Bánh mì', 42000] ];
const hash = text => createHash('sha256').update(text).digest('hex');
export function planPosDemo(stores, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  if (today < '2026-10-01' || today > '2026-11-30') throw new Error('This owner-approved batch is limited to October/November 2026');
  const result = [];
  for (const store of stores.filter(s => s.kind === 'outlet' && s.status === 'ACTIVE' && !s.deleted_at)) {
    for (let day = '2026-10-01'; day <= today; day = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)) {
      for (let sequence = 0; sequence < 6; sequence++) {
        const orderedAt = new Date(day + 'T' + ['06:30', '08:15', '10:45', '14:30', '17:00', '20:15'][sequence] + ':00+07:00');
        if (orderedAt > now) continue;
        const seed = parseInt(hash(String(store._id) + ':' + day + ':' + sequence).slice(0, 8), 16), product = products[seed % products.length];
        const quantity = 1 + seed % 3, subtotalVnd = product[2] * quantity, discountVnd = seed % 5 === 0 ? 5000 : 0;
        const status = seed % 29 === 0 ? 'CANCELLED' : seed % 31 === 0 ? 'REFUNDED' : 'COMPLETED';
        const refundVnd = status === 'REFUNDED' ? subtotalVnd - discountVnd : status === 'COMPLETED' && seed % 17 === 0 ? 3000 : 0;
        const orderId = `DEMO-POS-V1-${store._id}-${day}-${sequence}`;
        result.push({ _id: new mongoose.Types.ObjectId(hash(orderId).slice(0, 24)), orderId, storeId: store._id, orderedAt,
          channel: ['IN_STORE', 'APP', 'SHOPEEFOOD', 'PARTNER'][seed % 4], paymentMethod: ['CASH', 'CARD', 'MOMO', 'ZALOPAY', 'VNPAY'][seed % 5],
          status, subtotalVnd, discountVnd, refundVnd, netRevenueVnd: status === 'CANCELLED' ? 0 : subtotalVnd - discountVnd - refundVnd,
          items: [{ productId: product[0], productName: product[1], quantity, unitPriceVnd: product[2], lineTotalVnd: subtotalVnd }],
          source: 'demo', ledgerVersion: 1, batchId: BATCH });
      }
    }
  }
  return result;
}
export async function applyPosDemo(actor, orders, snapshot, privateDirectory) {
  if (mongoose.connection.name !== 'hr_bot_test_363' && !(process.env.NODE_ENV === 'test' && mongoose.connection.name.startsWith('test_'))) throw new Error('Pinned test DB only');
  requireCapability(actor, 'accounts.manage');
  return withAccountSecurityLock(actor, async () => {
    const stores = await mongoose.connection.collection('stores').find({}).sort({ _id: 1 }).toArray();
    if (digest(stores) !== snapshot.storeHash) throw new Error('Store catalog changed');
    await PosOrderModel.collection.createIndex({ orderId: 1 }, { unique: true });
    await PosOrderModel.collection.createIndex({ storeId: 1, orderedAt: 1, source: 1 });
    const result = { inserted: 0, existing: 0 };
    for (let offset = 0; offset < orders.length; offset += 300) {
      const batch = orders.slice(offset, offset + 300);
      for (const o of batch) await new PosOrderModel(o).validate();
      const conflicts = await PosOrderModel.find({ $or: [{ _id: { $in: batch.map(o => o._id) } }, { orderId: { $in: batch.map(o => o.orderId) } }] }).lean();
      for (const old of conflicts) {
        const planned = batch.find(o => String(o._id) === String(old._id) && o.orderId === old.orderId);
        if (!planned || Object.keys(planned).some(k => digest(old[k]) !== digest(planned[k]))) throw new Error('Existing demo order differs; preserved');
      }
      const write = await PosOrderModel.bulkWrite(batch.map(o => ({ updateOne: { filter: { _id: o._id, orderId: o.orderId, batchId: BATCH }, update: { $setOnInsert: o }, upsert: true, timestamps: false } })));
      result.inserted += write.upsertedCount; result.existing += batch.length - write.upsertedCount;
      if (privateDirectory) await fs.appendFile(path.join(privateDirectory, 'journal.private.jsonl'), JSON.stringify({ at: new Date().toISOString(), offset, ...result }) + '\n');
    }
    return result;
  });
}
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part; const c = JSON.parse(raw);
  if (c.dbName !== 'hr_bot_test_363' || c.apiOrigin !== 'https://hr-blockbot-363-test-api-starter.onrender.com' || c.approvalRef !== BATCH) throw new Error('Pinned owner-approved target required');
  process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = c.jwtSecret;
  mongoose.set('autoIndex', false).set('autoCreate', false);
  let cookie;
  try {
    const r = await fetch(c.apiOrigin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c.actorCredential) });
    if (!r.ok) throw new Error('Technical actor unavailable'); cookie = r.headers.get('set-cookie')?.split(';')[0];
    const claims = await verifyAccessToken((await r.json()).accessToken);
    await mongoose.connect(c.uri, { dbName: c.dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
    const actor = await resolvePrincipal(claims); requireCapability(actor, 'accounts.manage');
    const stores = await mongoose.connection.collection('stores').find({}).sort({ _id: 1 }).toArray(), storeHash = digest(stores);
    const now = new Date(c.now), orders = planPosDemo(stores, now), existing = await PosOrderModel.find({}).sort({ _id: 1 }).lean();
    await fs.mkdir(c.privateDirectory, { recursive: true });
    await fs.writeFile(path.join(c.privateDirectory, `${c.apply ? 'apply' : 'dry-run'}-${Date.now()}.private.json`), JSON.stringify({ storeHash, now, count: orders.length, orderHash: digest(orders), existingHash: digest(existing) }, null, 2), { flag: 'wx' });
    let result = null;
    if (c.apply) {
      if (c.storeHash !== storeHash || c.orderHash !== digest(orders)) throw new Error('Reviewed plan hash required');
      await fs.writeFile(path.join(c.privateDirectory, `before-${Date.now()}.private.ejson`), mongoose.mongo.BSON.EJSON.stringify(existing, { relaxed: false }), { flag: 'wx' });
      result = await applyPosDemo(actor, orders, { storeHash }, c.privateDirectory);
    }
    console.log(JSON.stringify({ status: c.apply ? 'POS_DEMO_APPLIED' : 'POS_DEMO_DRY_RUN', storeHash, orderHash: digest(orders), count: orders.length, stores: new Set(orders.map(o => String(o.storeId))).size, from: '2026-10-01', through: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now), result }));
  } finally { await mongoose.disconnect(); if (cookie) await fetch(c.apiOrigin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } }).catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(JSON.stringify({ status: 'POS_DEMO_STOPPED', errorClass: e.name, message: 'Private configuration omitted' })); process.exitCode = 1; });
