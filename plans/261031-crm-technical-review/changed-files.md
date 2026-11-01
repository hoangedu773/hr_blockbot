# File inventory — CRM technical review and follow-through

Baseline `71bd202`, dirty `main`, 31/10/2026. Includes tracked modifications and untracked source/docs; no file was staged, committed or pushed. Generated build output, fixtures, test logs and screenshots are ignored artifacts. No `apps/ai-service` file changed.

`Review + follow-through` = edited/added during this review and the user's continuation. `Carried over` = earlier CRM implementation preserved and reviewed, not rewritten here.

Total 70 source/config/test/document paths; 41 edited/added in the review and continuation.

| File (repository-relative) | Origin |
|---|---|
| `.gitignore` | Carried over |
| `apps/api/.env.example` | Carried over |
| `apps/api/package.json` | Review + follow-through |
| `apps/api/scripts/build-decision-registry.mjs` | Carried over |
| `apps/api/src/app.ts` | Review + follow-through |
| `apps/api/src/models/DecisionAnchor.ts` | Carried over |
| `apps/api/src/models/Department.ts` | Review + follow-through |
| `apps/api/src/models/Employee.ts` | Review + follow-through |
| `apps/api/src/models/Project.ts` | Review + follow-through |
| `apps/api/src/models/Report.ts` | Carried over |
| `apps/api/src/routes/assignment.ts` | Review + follow-through |
| `apps/api/src/routes/attachments.ts` | Carried over |
| `apps/api/src/routes/auth.ts` | Carried over |
| `apps/api/src/routes/dashboard.ts` | Review + follow-through |
| `apps/api/src/routes/employees.ts` | Review + follow-through |
| `apps/api/src/routes/personnel-admin.ts` | Review + follow-through |
| `apps/api/src/routes/projects.ts` | Carried over |
| `apps/api/src/routes/reports.ts` | Carried over |
| `apps/api/src/routes/stores.ts` | Review + follow-through |
| `apps/api/src/services/assignment-candidates.service.ts` | Carried over |
| `apps/api/src/services/assignment.service.ts` | Carried over |
| `apps/api/src/services/decision-anchor.service.ts` | Carried over |
| `apps/api/src/services/employee-profile.service.ts` | Review + follow-through |
| `apps/api/src/services/project-audit.service.ts` | Review + follow-through |
| `apps/api/src/services/project-workflow.service.ts` | Review + follow-through |
| `apps/api/src/socket.ts` | Review + follow-through |
| `apps/api/test/assignment-consent.test.mjs` | Review + follow-through |
| `apps/api/test/attachments-security.test.mjs` | Carried over |
| `apps/api/test/crm-technical-review.test.mjs` | Review + follow-through |
| `apps/api/test/crm-workflow.test.mjs` | Review + follow-through |
| `apps/api/test/dashboard-overview.test.mjs` | Carried over |
| `apps/api/test/decision-anchor.test.mjs` | Review + follow-through |
| `apps/api/test/employees-scope.test.mjs` | Carried over |
| `apps/api/test/personnel-admin.test.mjs` | Review + follow-through |
| `apps/api/test/with-memory-mongo.mjs` | Review + follow-through |
| `apps/web/src/App.tsx` | Carried over |
| `apps/web/src/components/AssignmentPanel.tsx` | Carried over |
| `apps/web/src/components/CrmDashboardView.tsx` | Carried over |
| `apps/web/src/components/EmployeeListView.tsx` | Review + follow-through |
| `apps/web/src/components/EmployeeProfileView.tsx` | Review + follow-through |
| `apps/web/src/components/PersonnelAdmin.tsx` | Review + follow-through |
| `apps/web/src/components/ProfileApprovalQueue.tsx` | Review + follow-through |
| `apps/web/src/components/ProjectListView.tsx` | Review + follow-through |
| `apps/web/src/components/ui/CrmDialog.tsx` | Carried over |
| `apps/web/src/components/ui/Select.tsx` | Carried over |
| `apps/web/src/services/api.ts` | Review + follow-through |
| `apps/web/src/styles/crm-work.css` | Carried over |
| `apps/web/test/crm-workflow.integration.mjs` | Review + follow-through |
| `apps/web/test/e2e-revamp-flow.test.mjs` | Review + follow-through |
| `docs/03-decision-records/ADR-021-assignment-consent-handover-hash-proof.md` | Review + follow-through |
| `docs/04-domain-model.md` | Carried over |
| `docs/05-data-model.md` | Review + follow-through |
| `docs/06-api-spec.md` | Review + follow-through |
| `docs/07-auth-rbac.md` | Review + follow-through |
| `docs/18-user-flows.md` | Carried over |
| `package.json` | Carried over |
| `packages/contracts/solidity/AssignmentDecisionRegistry.sol` | Carried over |
| `packages/contracts/src/index.ts` | Review + follow-through |
| `packages/contracts/test/contracts.test.mjs` | Review + follow-through |
| `plans/261031-assignment-consent/implementation-report.md` | Review + follow-through |
| `plans/261031-assignment-consent/plan.md` | Carried over |
| `plans/261031-crm-business-completion/implementation-report.md` | Carried over |
| `plans/261031-crm-business-completion/plan.md` | Review + follow-through |
| `plans/261031-crm-technical-review/changed-files.md` | Review + follow-through |
| `plans/261031-crm-technical-review/personnel-admin-plan.md` | Review + follow-through |
| `plans/261031-crm-technical-review/personnel-admin-report.md` | Review + follow-through |
| `plans/261031-crm-technical-review/plan.md` | Review + follow-through |
| `plans/261031-crm-technical-review/review-report.md` | Review + follow-through |
| `pnpm-lock.yaml` | Carried over |
| `pnpm-workspace.yaml` | Carried over |

Latest follow-through verification artifacts: `test-results/personnel-api-regression.log`, `personnel-contracts.log`, `personnel-typecheck.log`, `personnel-build.log`, `personnel-web-final.log`, `personnel-required-e2e.log`, `personnel-browser-regression.log`; screenshots `crm-personnel-department-mobile.png`, `crm-profile-approval-desktop.png`, `crm-profile-history-mobile.png`, `assignment-handover-desktop.png`, `assignment-handover-mobile.png`, `crm-work-admin.png`, `crm-work-mobile.png`.

Historical technical-review evidence remains in `test-results/review-api-regression.log`, `review-contracts.log`, `review-web-regression.log`, `review-required-e2e.log`, `review-browser-regression.log`, `review-focused-final.log`, `review-typecheck.log`, `review-build.log`, `review-solidity-build.log`. The failed first follow-through web fixture run is retained at `personnel-web-regression.log` and explained in personnel-admin-report.md; it is not the final gate result.
