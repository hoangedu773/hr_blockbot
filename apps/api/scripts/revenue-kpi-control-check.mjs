// Operator diagnostic/recovery for this interrupted test seed only. Refuse to
// unlock a live process or a fence that changed since inspection.
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part; const c = JSON.parse(raw);
  if (c.dbName !== 'hr_bot_test_363') throw Error('Pinned test DB required');
  await mongoose.connect(c.uri, { dbName: c.dbName, autoCreate: false, autoIndex: false });
  const controls = mongoose.connection.collection('authorization_controls'), crm = await controls.findOne({ _id: 'crm-writers' }), account = await controls.findOne({ _id: 'account-security' });
  const result = { crm: crm ? { locked: crm.locked, ownerProcessId: crm.ownerProcessId, at: crm.at } : null, account: account ? { locked: account.locked, at: account.at } : null };
  if (c.recover) {
    if (c.approvalRef !== 'OWNER_REVENUE_KPI_SEED_RESUME_20261104' || !crm?.locked || !account?.locked || crm.ownerProcessId !== c.expectedPid || new Date(crm.at).toISOString() !== c.expectedAt) throw Error('Fence does not match interrupted owner');
    try { process.kill(c.expectedPid, 0); throw Error('Owner process still exists'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    await fs.writeFile(c.privateEvidence, JSON.stringify({ at: new Date().toISOString(), ...result, action: 'RECOVER_VERIFIED_DEAD_LOCAL_SEED_WRITER', approvalRef: c.approvalRef }), { flag: 'wx' });
    const r = await controls.updateOne({ _id: 'crm-writers', locked: true, token: crm.token, ownerInstanceId: crm.ownerInstanceId }, { $set: { locked: false }, $unset: { token: '', at: '', ownerProcessId: '', ownerInstanceId: '' } });
    if (r.modifiedCount !== 1) throw Error('Writer fence changed');
    const a = await controls.updateOne({ _id: 'account-security', locked: true, token: account.token, at: account.at }, { $set: { locked: false }, $unset: { token: '', actorId: '', at: '' } });
    if (a.modifiedCount !== 1) throw Error('Account fence changed');
    result.recovered = true;
  }
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ status: 'FENCE_CHECK_STOPPED' })); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
