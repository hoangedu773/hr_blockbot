# Automatic employee codes — owner decision 2026-11-03

New onboarding requests and HR drafts receive `GT-CHYYMMNNNN` on the server.
This is the project owner's new rule, not a claim about the meaning of every
legacy company identifier.

- `YYMM` comes from the initial proposed start date in Asia/Ho_Chi_Minh time.
  Supported years: 2000–2099. Existing codes are never rewritten.
- `NNNN` is a global sequence shared across stores and months. It continues
  above all GT-CH suffixes in canonical/legacy employees, pending/rejected
  onboarding requests and usernames. It does not restart each month.
- `employee_code_counters` uses one document with MongoDB's unique `_id` and
  atomic increment. Initialization uses atomic max; later imports raise the
  high-water mark. Gaps after failed/concurrent retries are allowed and are
  never intentionally recycled. At 9999, creation fails explicitly; no wrap
  or silent format change is permitted. Back up this counter with the DB.
- The create payload requires a random `clientRequestId` UUID and rejects a
  supplied `employeeCode`. The client keeps the key while retrying its form.
  An actor-bound deterministic request ID uses the existing unique `_id`
  index. Same key/input returns the same persisted identity/code; a changed
  payload under the same key returns 409. A signed creation fingerprint
  protects replay and remains stable through subsequent amendments.
- Codes remain unchanged after rejection, corrected start dates, review,
  activation, transfer or reactivation. Resubmit the existing request rather
  than creating a new identity. Username remains the lowercased assigned code.
- Capability, store validation and required existing indexes are checked
  before reserving a code. Allocation creates only an onboarding request;
  independent HR approval and recipient activation are still required.

Rollout: deploy API and Web together and refresh old open forms. No new unique
index maintenance is required: the counter and retry identity use MongoDB's
built-in unique `_id` indexes. No existing employee, account or graph migration
is part of this change.

Validation: dedicated isolated code-allocation and retry/concurrency/exhaustion
tests, existing HR draft/authorization/recovery/workflow regressions, contract
tests, and both real-browser authorization/completion suites using owned local
MongoDB. No external activation delivery is used in these suites.
