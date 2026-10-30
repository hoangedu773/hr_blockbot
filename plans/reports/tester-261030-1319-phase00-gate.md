---
phase: 00
plan: design-system-big-update
title: QA gate — Phase 00 (Tailwind v4 real build, 3-tier tokens, dead-code removal)
role: tester
date: 2026-10-30 13:19
verdict: REJECT
---

# QA Gate — Phase 00

**Verdict: REJECT.** Phase 00 is close, but three defects block sign-off. Two are
behavioural regressions that the acceptance checklist does not currently cover, and one is a
release-integrity gap in the new test wiring. All acceptance criteria that Phase 00 lists
*are* met; the phase fails on what the checklist omits.

Every claim below carries the command that produced it and its output.

---

## 1. Verdict summary

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | `dark:` variant switched from class-based to media-based — every `dark:` utility dies for users on a light-preference OS | **High** (a11y, 1.89:1 contrast) | Open |
| F2 | `--surface-card` declares `var(--surface-card)` — 5 tokens guaranteed-invalid, live panels render transparent | **High** (visible break) | Open |
| F3 | `chat-drawer.test.mjs` reads gitignored `dist/` at module scope, no `pretest` — suite fails on clean clone | **Medium** (release integrity) | Open |
| F4 | Tailwind scans `previews/` and `dist-verify/` — 916 dead utilities ship to production | Low (bundle hygiene) | Open |
| F5 | `folio-layout.css` shipped twice (copied to output + inlined) | Low (wasted bytes) | Open |
| F6 | Build emits 3 CSS parse warnings from `folio-layout.css` | Low (pre-existing) | Informational |

---

## 2. Acceptance criteria — measured

| Criterion | Target | Measured | Result |
|---|---|---|---|
| Class coverage | 0 missing | 561 scanned, 7 unstyled, all 7 allowlisted markers | **PASS** |
| `!important` in `src/styles/*` | 0 | 0 / 0 / 0 / 0 / 0 | **PASS** |
| CSS bundle size | < 60 KB gzip | 27.02 KB gzip (159.08 KB raw) | **PASS** |
| Test suite | 50/50 | 50 pass, 0 fail, 0 skip | **PASS** |
| Typecheck | clean | exit 0 | **PASS** |
| Build | green | exit 0 | **PASS** |
| Screenshots unchanged | no unexplained drift | CRM clipped at 1440 (ADR-023 §2b, accepted) | **PASS (per ADR)** |

Command evidence:

```
$ node plans/261030-1153-design-system-big-update/assets/qa-class-coverage.mjs
CSS: index-KJQtlEXU.css
Classes scanned: 561
Unstyled total: 7
  known markers (allowlisted): 7
  real gaps: 0

PASS — every rendered class resolves to a rule or is an allowlisted marker.
EXIT=0
```

```
$ for f in apps/web/src/styles/*.css; do printf "%-40s %s\n" "$f" "$(grep -c '!important' "$f")"; done
apps/web/src/styles/base.css             0
apps/web/src/styles/brand.css            0
apps/web/src/styles/index.css            0
apps/web/src/styles/product.css          0
apps/web/src/styles/tokens.css           0
```

```
$ node plans/261030-1153-design-system-big-update/assets/qa-dist-inventory.mjs
assets/index-KJQtlEXU.css                   159.08KB    27.02KB    21.83KB
CSS gzip total: 27.02KB
Budget (< 60KB gzip): PASS
```

```
$ pnpm --filter web typecheck
$ tsc --noEmit
TYPECHECK_EXIT=0
```

```
$ pnpm --filter web test
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 48139.6808
```

I did **not** accept the developer's `audit-class-coverage.mjs` as evidence. It reads the
three static bundles that Phase 00 deleted, so it now crashes:

```
$ node plans/261030-1153-design-system-big-update/assets/audit-class-coverage.mjs
Error: ENOENT: no such file or directory, open
  'C:\work-space\hr-blockbot\apps\web\public\assets\crm\2voh1gse7971r.css'
EXIT=1
```

That script must be retired — it is referenced by the phase's own success criteria, so the
criterion as written is unverifiable. `qa-class-coverage.mjs` replaces it.

### 2.1 Why my coverage number differs from the developer's

The developer's `audit-post-build.mjs` reports 482 classes and 20 missing. Both numbers are
wrong, for two independent reasons, and I verified each:

1. **Entity decoding.** `FOLIO_HTML` is a double-quoted TS string, so its attributes are
   authored as `class=\"...\"` and its utilities as `[&amp;_svg]:...`. Tailwind emits the
   *decoded* selector. Matching raw source text therefore invents misses that do not exist.
2. **Attribute form.** `CrmDashboardView.tsx` uses plain `class="..."`; `FolioLandingView.tsx`
   uses escaped `class=\"...\"`. A script that handles only one form silently skips a file.

My first version of the checker had bug 2 and reported a false PASS over 233 classes while
never reading `FolioLandingView` at all. I caught it because 233 ≠ 482 and chased the
discrepancy instead of shipping the green. The corrected script scans 561.

Because a checker that can only print PASS is worthless, I added a control:

```
$ node plans/261030-1153-design-system-big-update/assets/qa-class-coverage-control.mjs
  ok    flex                             expected=true  got=true
  ok    min-w-[960px]                    expected=true  got=true
  ok    bg-white/[0.04]                  expected=true  got=true
  ok    dark:text-zinc-300               expected=true  got=true
  ok    this-class-does-not-exist-xyz    expected=false got=false
  ok    text-smith                       expected=false got=false
  ok    flexx                            expected=false got=false

failures: 0
EXIT=0
```

The last two rows prove the matcher is boundary-aware: `.text-smith` is not satisfied by
`.text-sm`.

### 2.2 The 7 "unstyled" classes are correct

`lucide`, `lucide-menu`, `lucide-moon`, `lucide-sun`, `lucide-x` are icon-font markers with no
rule by design. `group/sidebar-wrapper` is a Tailwind group-name token. `reset-filter-btn` is a
DOM hook:

```
apps/web/src/components/CrmDashboardView.tsx:784:
  const resetFilterBtn = emptyRow.querySelector('.reset-filter-btn');
```

Every utility in that same class list resolves — I checked all 16 individually. Allowlisting
these is correct, not a suppression.

---

## 3. F1 — `dark:` variant is no longer class-based (blocking)

### What changed

Pre-Phase-00 the static bundles emitted `:is(.dark *)`. The new build emits
`@media (prefers-color-scheme: dark)`. `index.html` still hardcodes `<html class="dark">`, and
there is no `@custom-variant dark` anywhere in `src/styles/`.

```
$ node plans/261030-1153-design-system-big-update/assets/qa-dark-variant.mjs

=== built (post Phase 00) ===
  .dark\: utilities           101
  prefers-color-scheme blocks 1
  class-scoped (.dark .x)     0
  .dark\: inside media block  101
  => strategy                 MEDIA (prefers-color-scheme)

=== pre-Phase-00 static bundles ===
  .dark\: utilities           99
  prefers-color-scheme blocks 0
  class-scoped (.dark .x)     102
  .dark\: inside media block  0
  => strategy                 CLASS (.dark)

=== verdict ===
REGRESSION: strategy changed CLASS (.dark) -> MEDIA (prefers-color-scheme).
EXIT=1
```

This is a regression, not pre-existing behaviour: the old bundles were class-based, confirmed
independently against the old CRM bundle (`:is(.dark *)` = 28, `prefers-color-scheme` = 0).

### Browser proof

```
$ node plans/261030-1153-design-system-big-update/assets/qa-dark-variant-browser.mjs
class="text-zinc-700 dark:text-zinc-300" inside <html class="dark">

OS prefers   computed colour                    resolved to
  dark       oklch(0.871 0.006 286.286)       zinc-300 (dark: applied)
  light      oklch(0.37 0.013 285.805)        zinc-700 (dark: NOT applied)

  OS=dark   PASS
  OS=light  FAIL  <- dark: utility lost
EXIT=1
```

### User impact

The app is dark-only — it never switches to a light theme. So a user whose OS prefers light
gets the *light-theme fallback colour* on a near-black canvas, permanently. Measured on real
markup from `CrmDashboardView.tsx:476` (the revenue figure in every store row):

```
$ node plans/261030-1153-design-system-big-update/assets/qa-dark-contrast.mjs
Revenue figure in a store row — `text-zinc-700 dark:text-zinc-300` on #0a0a0a

OS prefers   computed colour                  sRGB       contrast   WCAG AA
  dark       oklch(0.871 0.006 286.286)   #d4d4d8    13.39:1   PASS
  light      oklch(0.37 0.013 285.805)    #3f3f46     1.89:1   FAIL

Below 4.5:1: 1 of 2
EXIT=1
```

13.39:1 becomes 1.89:1 — the revenue column becomes unreadable. 64 distinct `dark:` utilities
are affected, across both registers.

**Fix:** add `@custom-variant dark (&:where(.dark, .dark *));` to `tokens.css` or `index.css`.
One line restores the pre-Phase-00 contract. Do not instead remove `class="dark"` from
`index.html` — that would make the app follow OS preference, which it is not designed to do.

---

## 4. F2 — self-referential `--surface-card` (blocking)

`product.css:154` declares `--surface-card: var(--surface-card);`. A custom property that
references itself is *guaranteed invalid*, which poisons every alias built on it.

```css
/* product.css:148-154, inside the unlayered :root legacy-alias block */
--bg-card: var(--surface-card);
--bg-elevated: var(--surface-card);
--surface: var(--surface-card);
--surface-card: var(--surface-card);   /* <- self-reference */
```

`<html>` matches both `[data-register="product"]` and `:root`, at equal specificity. The alias
block comes later in the file, so it wins and overwrites the valid value with the cycle.

### Measured

```
$ node plans/261030-1153-design-system-big-update/assets/qa-token-resolution.mjs

=== register=product — 317 custom properties declared ===
  UNRESOLVED (5):
    --bg-card
    --surface
    --surface-card
    --bg-elevated
    --color-card

=== register=brand — 326 custom properties declared ===
  UNRESOLVED (5):
    --bg-card
    --surface
    --surface-card
    --bg-elevated
    --color-card
EXIT=1
```

Five tokens, not one: the cycle cascades into `--color-card`, which is the Tailwind theme
bridge for `bg-card` / `ring-card`. `--surface` was `#121214` in the deleted `index.css`
(`git show HEAD:apps/web/src/index.css` → line 46), so this is a regression against a value
that previously resolved.

### Live user-visible impact

`EmployeeListView` is reachable from the "Nhân sự" nav item and is the only live consumer.
Measured in the running built app:

```
$ node plans/261030-1153-design-system-big-update/assets/qa-capture-employees.mjs
controls whose inline style references var(--surface*): 2
  <input> "Tìm theo tên, mã NV..."
    declared: var(--surface)
    computed: rgba(0, 0, 0, 0)
  <button> "Làm Mới"
    declared: var(--surface-card)
    computed: rgba(0, 0, 0, 0)

transparent (declaration dropped): 2 of 2
page errors: 0
screenshot: .../qa-gate/employees-1440.png
EXIT=1
```

Screenshot: `plans/261030-1153-design-system-big-update/assets/qa-gate/employees-1440.png`.
The search field and the "Làm Mới" button render with no background at all.

**Fix:** `--surface-card: var(--surface-card)` must become an alias to a *primitive*, not to
itself. The semantic value is already defined on `[data-register]`; the alias line should be
deleted, or changed to `--surface-card: var(--surface-raised)` if the intent was a legacy
pointer. Same for `--surface`, which should point at `var(--surface-card)` only once that
resolves.

`AiCopilotModal.tsx:129` consumes the same token but is never imported — dead code, not a
second live surface. Worth noting for Phase 02's cleanup.

---

## 5. F3 — test suite is not self-contained (blocking for release)

ADR-023 correctly decided to point `chat-drawer.test.mjs` at the built stylesheet, because
`@import "tailwindcss"` cannot resolve outside a bundler. The implementation reads it at
**module scope** with no guard, and `dist/` is gitignored.

```
$ node plans/261030-1153-design-system-big-update/assets/qa-test-build-coupling.mjs
=== build output under version control? ===
  tracked files in apps/web/dist: 0
  gitignore rule: .gitignore:7:dist/	apps/web/dist

=== chat-drawer.test.mjs ===
  reads ../dist/assets/ at module load: true
  readdirSync at module scope (no guard): true

=== package.json scripts ===
  test:    node --test test/**/*.test.mjs
  pretest: (none)
  build:   tsc && vite build

=== verdict ===
RISK — `pnpm --filter web test` is not self-contained:
  - test reads a gitignored build directory
  - no pretest hook builds the CSS the suite consumes
EXIT=1
```

On a clean clone `readdirSync` throws `ENOENT` before any test registers, so the file aborts
rather than failing one test. The 50/50 result I reproduced is only reproducible on a machine
that already ran a build — which is exactly what my session was, so the green is real but not
transferable.

This matters beyond CI hygiene: `render.yaml` runs `pnpm --filter web build` for deploy but no
test step, so nothing in the pipeline catches the day this breaks.

**Fix:** add `"pretest": "pnpm build"`, or make the read lazy inside the test with a clear
`assert.ok(fs.existsSync(...), 'run pnpm build first')`. The former is better — a skipped test
is worse than a slow one.

---

## 6. F4 / F5 / F6 — bundle hygiene (non-blocking)

**F4 — Tailwind scans stale artifacts.** No `@source` directive and no `tailwind.config.*`
exist, so Tailwind auto-scans the whole `apps/web` root, including tracked `previews/` and
`dist-verify/`.

```
$ node plans/261030-1153-design-system-big-update/assets/qa-find-class-origin.mjs bg-card ring-card
bg-card: 7 file(s)
   149  previews\folio-current.html
    19  previews\styles.html
     7  dist\assets\index-KJQtlEXU.css
     5  dist-verify\assets\folio\folio.css
     4  dist-verify\assets\index-BQVgjFEb.css
     2  src\styles\product.css
     1  dist-verify\assets\crm\2voh1gse7971r.css
```

Quantified: of 941 classes that appear *only* in `previews/`, **916 are emitted into the
production stylesheet**. The 60 KB budget still passes at 27.02 KB, so this is not urgent, but
it means the bundle grows with unrelated mock pages and the class-coverage signal gets noisier
over time. `previews/` is also a maintenance trap: it is tracked, so it will drift.

**F5 — `folio-layout.css` shipped twice.** `brand.css:15` inlines it via `@import`, and Vite
also copies `public/` verbatim. Confirmed: 25.19 KB (4.91 KB gzip) present at
`dist/assets/folio/folio-layout.css` *and* inlined in `index-KJQtlEXU.css`. Move it out of
`public/` or accept the duplication deliberately.

**F6 — 3 CSS parse warnings, pre-existing.** The build prints:

```
Found 3 warnings while optimizing generated CSS:
'flex-row' is not recognized as a valid pseudo-class.
'items-center' is not recognized as a valid pseudo-class.
'w-auto' is not recognized as a valid pseudo-class.
```

Source: `folio-layout.css:266` —
`.folio-preview header nav div.flex.w-full.flex-col.gap-3.sm:flex-row.sm:items-center.lg:w-auto`.
An unescaped Tailwind variant in a hand-written selector; browsers drop the rule. I verified
this line exists in `HEAD` unchanged, so Phase 00 did not introduce it. It is a real dead rule
that has never applied. Phase 04 replaces this file; flagging so it is not lost.

---

## 7. Items I verified as correctly done

- `src/index.css` (1,204 lines, 106 `!important`) deleted. `git show HEAD:apps/web/src/index.css | grep -c "!important"` → `106`.
- Three static bundles deleted from `public/assets/{folio,crm}/`; directory listing confirms only `folio-layout.css` remains.
- 7 dead landing components deleted; `landing/` now contains only `WorkflowSection.tsx`; zero remaining imports of the removed names.
- Stylesheet-swapping effect replaced by `document.documentElement.dataset.register`, verified live — `--surface-canvas` resolves `#0a0a0a` (product) vs `#121212` (brand). The register switch is genuinely live, not inert.
- `min-w-[960px]` now emitted (`min-width:960px`), matching ADR-023 §2b's expectation.
- Font fix is real: `Times New Roman` → `Geist` confirmed in the developer's own before/after capture (`live-before.json` vs `live-after.json`, CRM `fontFamily`).
- `index.html` has `viewport-fit=cover`, `color-scheme`, and two `theme-color` metas; the three `<link>` CSS tags are gone.
- Test-file edits are path-only plus one rounding change in `e2e-revamp-flow.test.mjs` (`Math.round` on a 44px box at non-integer DPR). No assertion was weakened.
- CRM table clipping at 1440px matches ADR-023 §2b exactly — the "Trạng thái" column sits outside the viewport. Accepted per ADR, with the Phase 01 acceptance criterion already recorded there.

**Spec deviation, minor:** step 6 required `<link rel="preload">` for Geist and Newsreader.
`grep -c preload apps/web/index.html` → `0`. Fonts load via the Google Fonts stylesheet only.
Not blocking, but the FOUT cost the preload was meant to remove is still paid.

---

## 8. Required before re-review

1. `@custom-variant dark (&:where(.dark, .dark *));` — restores F1.
2. Remove the self-referential `--surface-card` declaration (and fix `--surface`) — restores F2.
3. Add `pretest` (or a guarded read) so the suite runs from a clean clone — restores F3.
4. Either add `@source` scoping to exclude `previews/` and `dist-verify/`, or document why the
   scan scope is intentional. Non-blocking but should be decided now, before Phase 01 adds
   more surfaces.
5. Retire `audit-class-coverage.mjs` and update the phase's success criteria to reference
   `qa-class-coverage.mjs` — otherwise criterion 1 stays unverifiable.

Re-run in this order, since each gate consumes the previous output:

```bash
pnpm --filter web build
node plans/261030-1153-design-system-big-update/assets/qa-class-coverage.mjs
node plans/261030-1153-design-system-big-update/assets/qa-token-resolution.mjs
node plans/261030-1153-design-system-big-update/assets/qa-dark-variant.mjs
node plans/261030-1153-design-system-big-update/assets/qa-test-build-coupling.mjs
pnpm --filter web test
```

Expected: all exit 0. Today: `qa-token-resolution` and `qa-dark-variant` and
`qa-test-build-coupling` exit 1.

### 8.1 Gate exit codes as measured

```
$ for s in qa-class-coverage qa-token-resolution qa-dark-variant \
           qa-test-build-coupling qa-class-coverage-control; do
    node plans/261030-1153-design-system-big-update/assets/$s.mjs >/dev/null 2>&1
    printf "%-30s exit=%s\n" "$s" "$?"
  done
qa-class-coverage              exit=0
qa-token-resolution            exit=1
qa-dark-variant                exit=1
qa-test-build-coupling         exit=1
qa-class-coverage-control      exit=0
```

Gate semantics: `0` = pass, `1` = defect found, `2` = tool error (unparseable input).

One trap when scripting this: piping into `tail` reports `tail`'s exit status, not the
script's, so a failing gate reads as `EXIT=0`. Redirect instead of piping when collecting
exit codes.

---

## 9. Open questions

1. **Is `dark:` intended to follow the OS, or the app?** The app is dark-only and
   `<html class="dark">` is hardcoded, so class-based is the consistent choice — but if the
   design direction (Phase 04) intends a light brand landing, the media query may be
   deliberate and the fix belongs in `index.html` instead. Needs a decision from whoever owns
   the design brief; the two options are mutually exclusive.
2. **Should `previews/` stay in the repo?** It is tracked and 916 of its classes are already in
   production CSS. Either it becomes a first-class surface with `@source` scoping, or it should
   move out of the Tailwind root. This is a call for the phase owner, not a QA decision.
3. **Is the 60 KB gzip budget still meaningful?** At 27 KB with 916 dead classes included, the
   budget will not catch regressions for a long time. Consider a budget on *unused* rules
   instead, which is what actually degrades.
