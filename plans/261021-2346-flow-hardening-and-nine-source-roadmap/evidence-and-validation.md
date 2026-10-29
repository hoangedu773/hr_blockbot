# Evidence, gates and verification record

Date: 2026-10-22 Asia/Bangkok. This record covers PLAN AUTHORING, not product acceptance.

## Provenance
- Lead read main application entry/routes/socket/auth/client/chat/project/report/provider and AI endpoint/agent paths, current manifests, existing full-delivery plan and user-flow baseline. Main SHA from git: `9824325`.
- PM worktree SHA from git: `f1f4746277260de856bdb0315000d28c2acb8087`; initially clean. Documentation created only here.
- Independent source-reader inspected all SPEC-01..09 and user-flow baseline. Vendor implementation claims not promoted to verified merely by ledger IDs.
- `ak plan create` and `ak plan add-phase` succeeded; no hand-created replacement scaffold. CLI registered plan store ID `hr_blockbot/261021-2346`. No project/global initialization performed.
- The runtime live team-task board was discovered empty, then ten pending phase tasks created with serial dependency chain. Planning completion never marks implementation checkboxes complete.

## Facts versus design proposals
| Statement | Classification | What settles remaining uncertainty |
|---|---|---|
| Main gateway currently lacks chat handlers | Source observed, not deployment observation | P01 selected revision + actual request/Socket smoke |
| Main employee write API missing | Source observed for main only | Feature worktree diff and endpoint tests |
| Existing report writes may diverge | Derived from two separate writes and failure boundary | Failure-injection test and migration inventory |
| Atomic aggregate can prevent partial domain transition | Proposed architecture | Approved P02 storage contract, bounded document design and crash tests |
| Cross-tab Web Locks avoids concurrent cookie refresh | Proposed supported-browser mechanism | True browser two-tab tests, logout race and lost-response recovery policy |
| All nine vendor behaviors were extracted faithfully | NOT established | Versioned artifact bytes/hash, source offsets/captures, reproduction and license review |
| External provider, database, calendar or voice works | NOT tested this session | Authorized isolated runtime/pilot with measured output |

## Existing versus planned verification
Current main manifests expose API build/test/test:auth, Web build/test, contracts build/typecheck/test. Python test files exist. None were executed for this documentation-only task. Old local instruction claiming no API/Web tests is stale relative to observed manifests; current source wins.
`generate:openapi` intentionally exits 1; root lint not established. Proposed browser executables in phases are future work and require installed automation capability discovery first.

## Structural checks
Initial `ak plan validate <plan-dir> --json`: exit 0, valid true. This was a scaffold/format check only, before final authoring; final CLI and link/ID checks must be recorded below after all phases are complete.
PowerShell operations with mistyped working directories initially returned ENOENT; corrected existing worktree commands succeeded. No application diagnosis inferred from that shell path error.

## Pending validation questions
1. Baseline branch/reuse and data migration authority.
2. Browser support and safe refresh recovery; whether OAuth/PKCE or external embedding is actually wanted.
3. Handover staffing plus booking use case/calendar semantics.
4. Offline/feedback/trace retention and allowed operations. Audio was explicitly removed; no voice decision remains.
These are business/security choices, not safe assumptions. Do not interpret a roadmap request as approval of recording, data egress or third-party subscriptions.

## Runtime hydration
Active task IDs task-1 through task-8 map to P01 through P08; task-10 maps to P10 and depends directly on task-8. Former task-9 was deleted after the user removed audio, not marked implemented. Current board was reread on 2026-10-22. Each active task links its durable phase file; all remain pending/unowned. Dependencies serialize overlapping app work. Execution must split per-app ownership inside a phase and not assign a broad multi-app task to one dev branch. No runtime task has been claimed for product implementation.

## Review and final validation
Independent review messages were reconciled against current files; see [dispositions](review-reconciliation.md). A fresh read-only scope audit confirmed detailed P06/P07/P08/P10, retained OAuth/embed tasks and F4/F5/F7 classification/release gates. Its remaining assignment mapping/confirmation and stale audio/task cleanup were incorporated. Maintainer decisions remain explicit gates; no product feature is declared ready.
