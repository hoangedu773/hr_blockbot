import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import ganache from 'ganache';
import solc from 'solc';
import { ContractFactory, Contract, JsonRpcProvider } from 'ethers';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { ProjectModel } from '../dist/models/Project.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { DECISION_REGISTRY_ABI } from '../dist/services/decision-anchor.service.js';
import { digest, verifyProjectAudit } from '../dist/services/project-audit.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';

let chain, provider, api, base, token, registry, registrar, stranger, department, storeId;
const savedEnv = Object.fromEntries(['ASSIGNMENT_CHAIN_RPC_URL', 'ASSIGNMENT_CHAIN_ID', 'ASSIGNMENT_REGISTRY_ADDRESS', 'ASSIGNMENT_CHAIN_CONFIRMATIONS'].map((key) => [key, process.env[key]]));
async function request(path, body) {
  const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function project() {
  const result = await request('/projects', { title: 'Synthetic private task must never appear on chain', departmentId: String(department), storeId, dueDate: '2026-11-15T00:00:00Z' });
  assert.equal(result.status, 201, JSON.stringify(result.body)); return (await request('/projects/' + result.body.id)).body;
}
before(async () => {
  await connectDB();
  const fixture = await authorizationV1Fixture();
  department = fixture.departmentId; storeId = String(fixture.stores[0]._id);
  token = fixture.actors.sm.token;
  chain = ganache.server({ logging: { quiet: true }, chain: { chainId: 1337, hardfork: 'shanghai' }, wallet: { totalAccounts: 3 } });
  await chain.listen(0, '127.0.0.1');
  process.env.ASSIGNMENT_CHAIN_RPC_URL = 'http://127.0.0.1:' + chain.address().port;
  process.env.ASSIGNMENT_CHAIN_ID = '1337'; process.env.ASSIGNMENT_CHAIN_CONFIRMATIONS = '1';
  provider = new JsonRpcProvider(process.env.ASSIGNMENT_CHAIN_RPC_URL);
  registrar = await provider.getSigner(0); stranger = await provider.getSigner(1);
  const source = fs.readFileSync(new URL('../../../packages/contracts/solidity/AssignmentDecisionRegistry.sol', import.meta.url), 'utf8');
  const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Registry.sol': { content: source } },
    settings: { evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
  assert.deepEqual((compiled.errors ?? []).filter((entry) => entry.severity === 'error'), []);
  const contract = compiled.contracts['Registry.sol'].AssignmentDecisionRegistry;
  registry = await new ContractFactory(contract.abi, '0x' + contract.evm.bytecode.object, registrar).deploy(await registrar.getAddress());
  await registry.waitForDeployment(); process.env.ASSIGNMENT_REGISTRY_ADDRESS = await registry.getAddress();
  api = createServer(createApp()); await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + api.address().port;
});
after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  if (api) { api.closeAllConnections(); await new Promise((resolve) => api.close(resolve)); }
  provider?.destroy(); if (chain) await chain.close();
  await mongoose.connection.dropDatabase(); await disconnectDB();
});

test('compiled real Solidity contract accepts registrar only and commitments cannot be overwritten', async () => {
  const id = '0x' + '11'.repeat(32), hash = '0x' + '22'.repeat(32);
  const other = new Contract(await registry.getAddress(), DECISION_REGISTRY_ABI, stranger);
  await assert.rejects(other.record(id, hash));
  await (await registry.record(id, hash)).wait();
  await (await registry.record(id, hash)).wait();
  assert.equal(await registry.commitments(id), hash);
  await assert.rejects(registry.record(id, '0x' + '33'.repeat(32)));
  await assert.rejects(registry.record('0x' + '00'.repeat(32), hash));
});

test('API prepares only random ID + salted hash, then verifies a real local EVM transaction receipt', async () => {
  const p = await project(), event = p.assignmentAudit[0];
  const path = `/projects/${p.id}/assignment/audit/${event.id}`;
  const prepared = await request(path + '/prepare', {}); assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  assert.equal(prepared.body.status, 'READY_FOR_WALLET'); assert.equal(prepared.body.transaction.data.length, 138);
  assert.ok(!prepared.body.transaction.data.includes(Buffer.from(p.title).toString('hex')));
  assert.ok(!prepared.body.transaction.data.includes(p.createdBy));
  assert.equal(await registry.commitments(event.id), '0x' + '00'.repeat(32), 'Preparing must not broadcast or notarize');
  const tx = await registrar.sendTransaction({ to: prepared.body.transaction.to, data: prepared.body.transaction.data }); await tx.wait();
  const verified = await request(path + '/verify', { transactionHash: tx.hash });
  assert.equal(verified.status, 200, JSON.stringify(verified.body)); assert.equal(verified.body.status, 'VERIFIED');
  assert.equal(verified.body.decisionHash, event.hash); assert.equal(verified.body.chainId, '1337');
  assert.equal((await request(`/projects/${p.id}/assignment/proofs`)).body.items[0].status, 'VERIFIED');
  assert.equal((await request(path + '/verify', { transactionHash: tx.hash })).body.status, 'VERIFIED', 'Proof retries remain idempotent');
  const original = await ProjectModel.findById(p.id).lean();
  const { hash: _oldHash, ...forged } = original.assignmentAudit[0];
  forged.reason = 'Privileged database rewrite and recomputed local hash';
  await ProjectModel.updateOne({ _id: p.id }, { $set: { assignmentAudit: [{ ...forged, hash: digest(forged) }] } });
  assert.equal(verifyProjectAudit(await ProjectModel.findById(p.id).lean()), true, 'A privileged writer can recompute a local hash chain');
  assert.equal((await request(path + '/verify', { transactionHash: tx.hash })).body.error.code, 'BLOCKCHAIN_PROOF_INVALID', 'External commitment detects forged history even after local rehash');
  assert.equal((await request(path + '/prepare', {})).body.error.code, 'BLOCKCHAIN_PROOF_INVALID');
  assert.equal((await request(`/projects/${p.id}/assignment/proofs`)).body.items[0].matchesCurrentEvent, false);
  await ProjectModel.updateOne({ _id: p.id }, { $set: { assignmentAudit: original.assignmentAudit } });
  await ProjectModel.updateOne({ _id: p.id }, { $set: { title: 'Tampered HR data' } });
  const tampered = await request(path + '/verify', { transactionHash: tx.hash });
  assert.equal(tampered.status, 409); assert.equal(tampered.body.error.code, 'AUDIT_INTEGRITY_FAILED');
});

test('wrong chain, wrong receipt and unconfigured network cannot become VERIFIED', async () => {
  const p = await project(), event = p.assignmentAudit[0]; const path = `/projects/${p.id}/assignment/audit/${event.id}`;
  const unrelated = await registrar.sendTransaction({ to: await stranger.getAddress(), value: 1 }); await unrelated.wait();
  assert.equal((await request(path + '/verify', { transactionHash: unrelated.hash })).status, 409);
  process.env.ASSIGNMENT_CHAIN_ID = '9999';
  const mismatch = await request(path + '/prepare', {}); assert.equal(mismatch.status, 409); assert.equal(mismatch.body.error.code, 'BLOCKCHAIN_CHAIN_MISMATCH');
  process.env.ASSIGNMENT_CHAIN_ID = '1337';
  delete process.env.ASSIGNMENT_REGISTRY_ADDRESS;
  const absent = await request(path + '/prepare', {}); assert.equal(absent.status, 503); assert.equal(absent.body.error.code, 'BLOCKCHAIN_NOT_CONFIGURED');
  process.env.ASSIGNMENT_REGISTRY_ADDRESS = await registry.getAddress();
  assert.deepEqual((await request(`/projects/${p.id}/assignment/proofs`)).body.items, []);
});

test('a mined transaction remains PENDING until the configured confirmation threshold is met', async () => {
  const p = await project(), event = p.assignmentAudit[0]; const path = `/projects/${p.id}/assignment/audit/${event.id}`;
  process.env.ASSIGNMENT_CHAIN_CONFIRMATIONS = '3';
  try {
    const prepared = await request(path + '/prepare', {});
    const tx = await registrar.sendTransaction({ to: prepared.body.transaction.to, data: prepared.body.transaction.data }); await tx.wait();
    const pending = await request(path + '/verify', { transactionHash: tx.hash });
    assert.equal(pending.status, 200); assert.equal(pending.body.status, 'PENDING');
    await provider.send('evm_mine', []); await provider.send('evm_mine', []);
    const verified = await request(path + '/verify', { transactionHash: tx.hash });
    assert.equal(verified.body.status, 'VERIFIED'); assert.ok(verified.body.confirmations >= 3);
  } finally { process.env.ASSIGNMENT_CHAIN_CONFIRMATIONS = '1'; }
});
