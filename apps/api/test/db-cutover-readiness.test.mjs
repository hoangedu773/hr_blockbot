import './require-isolated-db.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { auditDatabaseReadiness } from '../scripts/verify-db-cutover-readiness.mjs';
import { encryptApiKey } from '../dist/services/crypto.service.js';

const keyA = Buffer.alloc(32, 17).toString('base64');
const keyB = Buffer.alloc(32, 29).toString('base64');
const id = () => new mongoose.Types.ObjectId();

async function seedReadyDatabase(db, name) {
  const userId = id(), employeeId = id(), storeId = id(), approvalId = id();
  await db.collection('departments').createIndex({ creationKey: 1 }, {
    name: 'f1_department_creation_key', unique: true,
    partialFilterExpression: { creationKey: { $type: 'string' } },
  });
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ employeeId: 1 }, {
    unique: true, partialFilterExpression: { employeeId: { $type: 'objectId' } },
  });
  await db.collection('employees').createIndex({ personnelKey: 1 }, {
    name: 'f1_personnel_creation_key', unique: true,
    partialFilterExpression: { personnelKey: { $type: 'string' } },
  });
  await db.collection('onboarding_requests').createIndex({ employeeKey: 1 }, { unique: true });
  await db.collection('stores').insertOne({
    _id: storeId, kind: 'outlet', status: 'ACTIVE', deleted_at: null,
    scopeApprovalRef: 'fixture-store-approval', store_name: 'Fixture store',
  });
  await db.collection('employees').insertOne({
    _id: employeeId, status: 'active', personnelKey: `${name}-personnel`, userId,
    storeId, storeMappingRef: 'fixture-canonical-map', lifecyclePendingRequestId: null,
  });
  await db.collection('users').insertOne({
    _id: userId, username: `${name}-user`, status: 'active', employeeId,
    legacyImportApprovalId: approvalId, legacyImportActivation: { state: 'CONSUMED' },
  });
  await db.collection('legacy_import_approvals').insertOne({
    _id: approvalId, targetDatabase: name, userId, employeeId,
  });
  await db.collection('authorization_controls').insertMany([
    { _id: 'crm-writers', locked: false },
    { _id: 'account-security', locked: false },
  ]);
  await db.collection('policies').insertOne({
    title: 'fixture policy',
    acl: { reviewStatus: 'APPROVED', revokedAt: null },
    chunks: [{ embedding: new Array(3072).fill(0) }],
  });
  await db.collection('settings').insertOne({
    _id: 'llm', providers: [{ id: 'fixture-provider', keyCipher: encryptApiKey('fixture-api-key') }],
  });
}

function checkByCode(result, code) {
  const entry = result.checks.find((check) => check.code === code);
  assert.ok(entry, `missing check: ${code}`);
  return entry;
}

test('auditDatabaseReadiness detects ready and broken cutover databases without writes', async () => {
  const client = new mongoose.mongo.MongoClient(process.env.TEST_MONGODB_URI, {
    maxPoolSize: 2, serverSelectionTimeoutMS: 8000,
  });
  const originalEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  await client.connect();
  try {
    process.env.SETTINGS_ENCRYPTION_KEY = keyA;
    const readyName = `test_hr_cutover_ready_${Date.now()}`;
    const readyDb = client.db(readyName);
    const readyBaseline = `${readyName}_baseline`;
    await seedReadyDatabase(readyDb, readyName);
    await seedReadyDatabase(client.db(readyBaseline), readyBaseline);
    const ready = await auditDatabaseReadiness(readyDb, { targetDb: readyName, baselineDb: readyBaseline });
    assert.equal(ready.ok, true, JSON.stringify(ready.checks.filter((check) => check.status === 'FAIL')));
    assert.equal(checkByCode(ready, 'CORE_COLLECTION_COMPARISON').status, 'PASS');
    assert.equal(checkByCode(ready, 'ACTIVE_USER_CANONICAL_EMPLOYEE').status, 'PASS');
    assert.equal(checkByCode(ready, 'POLICY_EMBEDDING_DIMENSION').status, 'PASS');
    assert.equal(checkByCode(ready, 'SETTINGS_ENCRYPTION_KEY').status, 'PASS');
    assert.equal(checkByCode(ready, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'PASS');
    assert.equal(checkByCode(ready, 'USERS_USERNAME_INDEX').status, 'PASS');
    assert.equal(checkByCode(ready, 'USERS_EMPLOYEE_ID_INDEX').status, 'PASS');
    assert.equal(checkByCode(ready, 'EMPLOYEES_PERSONNEL_KEY_INDEX').status, 'PASS');
    assert.equal(checkByCode(ready, 'ONBOARDING_EMPLOYEE_KEY_INDEX').status, 'PASS');

    const brokenName = `test_hr_cutover_broken_${Date.now()}`;
    const brokenDb = client.db(brokenName);
    await seedReadyDatabase(brokenDb, brokenName);
    await brokenDb.collection('authorization_controls').updateOne({ _id: 'crm-writers' }, { $set: { locked: true } });
    await brokenDb.collection('legacy_import_approvals').updateOne({}, { $set: { targetDatabase: 'test_hr_different_database' } });
    await brokenDb.collection('departments').createIndex({ creationKey: 1 }, {
      name: 'f1_department_creation_key', unique: true,
      partialFilterExpression: { creationKey: { $type: 'string' } },
    });
    await brokenDb.collection('departments').dropIndex('f1_department_creation_key');
    await brokenDb.collection('policies').updateOne({}, { $set: { 'chunks.0.embedding': new Array(768).fill(0) } });
    process.env.SETTINGS_ENCRYPTION_KEY = keyB;
    const broken = await auditDatabaseReadiness(brokenDb, { targetDb: brokenName });
    assert.equal(broken.ok, false);
    assert.equal(checkByCode(broken, 'CRM_WRITERS_LOCK').status, 'FAIL');
    assert.equal(checkByCode(broken, 'LEGACY_IMPORT_TARGET_DATABASE').status, 'FAIL');
    assert.equal(checkByCode(broken, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'FAIL');
    assert.equal(checkByCode(broken, 'POLICY_EMBEDDING_DIMENSION').status, 'FAIL');
    assert.equal(checkByCode(broken, 'SETTINGS_ENCRYPTION_KEY').status, 'FAIL');
  } finally {
    if (originalEncryptionKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
    else process.env.SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    await client.close();
  }
});

test('auditDatabaseReadiness enforces exact partial filter requirements on unique indexes', async () => {
  const client = new mongoose.mongo.MongoClient(process.env.TEST_MONGODB_URI, {
    maxPoolSize: 2, serverSelectionTimeoutMS: 8000,
  });
  const originalEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  await client.connect();
  try {
    process.env.SETTINGS_ENCRYPTION_KEY = keyA;
    const dbName = `test_hr_cutover_partial_regression_${Date.now()}`;
    const testDb = client.db(dbName);
    await seedReadyDatabase(testDb, dbName);

    const initial = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(initial, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'PASS');
    assert.equal(checkByCode(initial, 'EMPLOYEES_PERSONNEL_KEY_INDEX').status, 'PASS');
    assert.equal(checkByCode(initial, 'USERS_USERNAME_INDEX').status, 'PASS');

    // 1. departments index without partialFilterExpression must FAIL
    await testDb.collection('departments').dropIndex('f1_department_creation_key');
    await testDb.collection('departments').createIndex({ creationKey: 1 }, {
      name: 'f1_department_creation_key',
      unique: true,
    });
    const missingDeptPartial = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(missingDeptPartial, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'FAIL');

    // 2. departments index with wrong partialFilterExpression must FAIL
    await testDb.collection('departments').dropIndex('f1_department_creation_key');
    await testDb.collection('departments').createIndex({ creationKey: 1 }, {
      name: 'f1_department_creation_key',
      unique: true,
      partialFilterExpression: { creationKey: { $type: 'number' } },
    });
    const wrongDeptPartial = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(wrongDeptPartial, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'FAIL');

    // 3. restoring correct departments index -> PASS
    await testDb.collection('departments').dropIndex('f1_department_creation_key');
    await testDb.collection('departments').createIndex({ creationKey: 1 }, {
      name: 'f1_department_creation_key',
      unique: true,
      partialFilterExpression: { creationKey: { $type: 'string' } },
    });
    const restoredDept = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(restoredDept, 'DEPARTMENTS_CREATION_KEY_INDEX').status, 'PASS');

    // 4. employees personnelKey index without partial filter must FAIL
    await testDb.collection('employees').dropIndex('f1_personnel_creation_key');
    await testDb.collection('employees').createIndex({ personnelKey: 1 }, {
      name: 'f1_personnel_creation_key',
      unique: true,
    });
    const missingEmpPartial = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(missingEmpPartial, 'EMPLOYEES_PERSONNEL_KEY_INDEX').status, 'FAIL');

    // 5. users username index with an unexpected partial filter must FAIL
    await testDb.collection('users').dropIndex('username_1');
    await testDb.collection('users').createIndex({ username: 1 }, {
      name: 'username_1',
      unique: true,
      partialFilterExpression: { username: { $type: 'string' } },
    });
    const unexpectedUserPartial = await auditDatabaseReadiness(testDb, { targetDb: dbName });
    assert.equal(checkByCode(unexpectedUserPartial, 'USERS_USERNAME_INDEX').status, 'FAIL');
  } finally {
    if (originalEncryptionKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
    else process.env.SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    await client.close();
  }
});
