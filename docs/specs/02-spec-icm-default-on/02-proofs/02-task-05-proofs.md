# Task 5.0 proofs — `upgrade` regression guard and the residual question count

Parent 5.0, spec `02-spec-icm-default-on` (ADR-285, superseding ADR-279 d2).
Files: `packages/create-agent-harness/src/upgrade-cmd.ts`,
`packages/create-agent-harness/src/onboarding.ts`,
`packages/create-agent-harness/src/index.ts`,
`packages/create-agent-harness/src/validate.ts`,
`packages/create-agent-harness/__tests__/upgrade.test.ts`,
`packages/create-agent-harness/__tests__/onboarding.test.ts`,
`packages/create-agent-harness/__tests__/validate.test.ts`,
`packages/create-agent-harness/__tests__/fixtures/icm-preremoval/`.

---

## What This Task Proves

- **The `upgrade` gate survives, and is provably load-bearing.** Merging
  `icmEnabled` into `resolveIcmDefault` — the exact "simplification" task 5.3
  warns against — reddens **2 of 3** SC5 tests, including the meta-test written to
  catch it. The guard is not decorative.
- **The pre-removal fixture is a real baseline, not a restatement.** It records
  19 files and **0** ICM paths, while naming a template whose
  `resolveIcmDefault` is `true`. The 10-file overlay is computed as a
  **counterfactual** and asserted absent from the actual report.
- **8 raw markers → 6 questions is measured, and the delta is exactly 2.** The
  two `{{?COND}}` openers (`?SUBAGENT_HANDOFF`, `?FIX_LOOP`) collapse to their
  question ids; the two closers are structure and vanish.
- **A second, independent undercount was found underneath the first** (task
  5.8's finding). The old source — `render().unresolved` — reported **4**, not 6.
  It never saw `SUBAGENT_HANDOFF` or `FIX_LOOP`, because both appear *only* in
  conditional form. The spec anticipated the 8→6 collapse; it did not anticipate
  this.

Two consequential findings are recorded below rather than smoothed over: the
`minimal`-conflation in the `SKIP` string (F1), and `onboardFiles`' absent
caller (F2).

## Proof artifact: SC5 — the mutation kill

The claim SC5 pins is narrow and asymmetric: `upgradeCmd` decides ICM-ness from
**what the harness emitted** (`icmEnabled(manifest)`), never from **what the
template can emit** (`resolveIcmDefault(template)`). The mutation makes them one
function.

```diff
-import { templateDir } from './index.js';
+import { templateDir, resolveIcmDefault } from './index.js';

-  const rendered = await walkTemplate(tdir, manifest.vars, { strict: false, icm: icmEnabled(manifest) });
+  const rendered = await walkTemplate(tdir, manifest.vars, { strict: false, icm: resolveIcmDefault(manifest.template) });
```

```
$ npx tsc && npx vitest run __tests__/upgrade.test.ts
  × SC5 — pre-removal harness gains no ICM tree on upgrade > reports zero ICM files added or removed
  × SC5 — pre-removal harness gains no ICM tree on upgrade > holds because icmEnabled reads the manifest, not the catalog capability
⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯
 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
```

**Both failures are the right ones.** `upgrade.test.ts:178` exists solely to kill
this mutation — it asserts the counterfactual overlay is 10 files, that the actual
report contains none of them, and that the `added` count differs from the
counterfactual's by exactly those 10. Un-mutated, the same file is **8/8 green**:
```
$ npx tsc && npx vitest run __tests__/upgrade.test.ts
 ✓ __tests__/upgrade.test.ts (8 tests) 259ms
      Tests  8 passed (8)
```

The restore was verified byte-identical against a pre-mutation copy
(`diff` → rc 0), and the mutated import is absent: `grep -n "resolveIcmDefault" src/upgrade-cmd.ts`
returns only the two **doc-comment** mentions that explain why the split exists,
never a call. That is the F2 naming split intact.

**Why test 2 is not a restatement of test 1.** A baseline obtained by running
`upgradeCmd` on a fresh scaffold would be worthless: under the mutation both arms
re-render from capability, agree, and pass. The test therefore computes its
baseline from `walkTemplate(…, { icm: false })` — independently of the code path
under test — and then asserts that baseline is itself ICM-free ("guards the
guard").

## Proof artifact: the fixture is a baseline, not an approximation

```
$ find __tests__/fixtures/icm-preremoval -type f
__tests__/fixtures/icm-preremoval/.harness/manifest.json
__tests__/fixtures/icm-preremoval/README.md

$ python3 -c "…files…"
total files: 19
ICM paths: []
```

Provenance is recorded in the fixture README: captured at HEAD `f59fbe7`,
template `vertical:coding`, generator `0.0.0`, produced through the internal
`scaffold({ icm: false })` override (which *is* pre-flip behaviour post-task-2.4,
since the CLI no longer supplies it), with `generated_at` masked to `"MASKED"`.

**Why a manifest and not a whole tree.** `upgradeCmd` reads the manifest to decide
what was emitted and re-renders the *current* template to compute drift; it never
reads harness file contents to decide ICM-ness, and absent on-disk files classify
as `clean`, not `conflict`. Committing 19 rendered files would add rot for no
assertion the manifest does not already support. Precedent: spec 01's
`arc-pre-removal-tools.json`.

## Proof artifact: 5.4 measured — 8 raw markers → 6 questions

Measured on a **flagless** capable scaffold (capability-derived default, no `icm`
key), against the catalog's own derived question ids.

```
vertical:coding (icm: true, generate: true)
  declared questions : 6  ["PROJECT_GOAL","SUBAGENT_HANDOFF","BUILD_COMMAND",
                           "TEST_COMMAND","FIX_LOOP","REVIEW_FOCUS"]
  token mode (raw)   : 8  ["PROJECT_GOAL","?SUBAGENT_HANDOFF","/SUBAGENT_HANDOFF",
                           "BUILD_COMMAND","TEST_COMMAND","?FIX_LOOP","/FIX_LOOP","REVIEW_FOCUS"]
  question mode      : 6  ["PROJECT_GOAL","SUBAGENT_HANDOFF","BUILD_COMMAND",
                           "TEST_COMMAND","FIX_LOOP","REVIEW_FOCUS"]
  delta              : 2  — exactly the two conditional openers
```

The delta is **2**, and they are the two `{{?COND}}` openers. The two `{{/COND}}`
closers are excluded as *structure* by `scanResiduals`' question mode
(`onboarding.ts:351`); the openers collapse to their question id, which is the
correct reading — `{{?FIX_LOOP}}` **is** the unanswered question `FIX_LOOP`.

`minimal` (icm: true, `generate: false`) emits **0** markers flagless — it stays
off by default, which is Q1's answer working as designed, not a regression. It
emits its 3 questions only under the explicit override:

```
minimal icm=(default) | files: 22 | ICM files: 0  | question markers: 0
minimal icm=true      | files: 38 | ICM files: 14 | question markers: 3
```

## Proof artifact: 5.8's finding — a second undercount the spec did not predict

The spec (§4.1, :220) anticipated the **8-token → 6-question** collapse. Underneath
it there was a **second, independent** error: the old source for the operator-facing
count was `render().unresolved`, which only sees bare `{{ID}}` forms. A question
appearing **solely** in conditional form is invisible to it.

```
catalog declared questions : 6
OLD source (bare {{ID}})   : 4  ["BUILD_COMMAND","PROJECT_GOAL","REVIEW_FOCUS","TEST_COMMAND"]
NEW source (question mode) : 6
MISSED by old source       : ["SUBAGENT_HANDOFF","FIX_LOOP"]
```

So `validate` reported **4** where the true unanswered-question count is **6**.
This is recorded in the source at `validate.ts:361-369` as a *correction of the
source*, not a second scanner — `scanResiduals` is the same identifier-form
scanner the walker half already used.
`minimal` declares 3 questions and `vertical:coding` 6, so a hard-coded count
would fail one of them; `onboarding.test.ts:405` asserts both counts per template.
## Proof artifact: CLI — the operator-facing string

`npx metaharness validate` is **not** a command (the `metaharness` bin is the
scaffolder). The subcommand binary is `harness` → `dist/harness-bin.js`. Running
the scaffolder's `validate` instead scaffolds a template literally named
`validate` into `./validate` — this was hit again during this task and the stray
directory **trashed**, the same foot-gun task 4.0 recorded for a stray `diag/`.

```
$ node dist/harness-bin.js validate /tmp/dirty-$X/h --skip-gcp
  PASS icm-structure — five-layer shape ok (4 stages); 6 ICM question(s): BUILD_COMMAND,
       FIX_LOOP, PROJECT_GOAL, REVIEW_FOCUS, SUBAGENT_HANDOFF, TEST_COMMAND
Result: HEALTHY (release-ready)
```

`6 ICM question(s)` matches the measured count, the ids are the catalog's declared
questions sorted, and no marker form (`?X`, `/X`) leaks into the operator string.
The string says `question(s)`, not `placeholder` — asserted at
`validate.test.ts:252-253` (`toMatch(/2 ICM question\(s\)/)` plus
`not.toMatch(/placeholder/)`).

## Proof artifact: grep — `icmEnabled` unchanged, naming split applied

```
$ grep -n "icmEnabled" src/upgrade-cmd.ts
64:function icmEnabled(manifest: { files?: Record<string, string> }): boolean {
108:  const rendered = await walkTemplate(tdir, manifest.vars, { strict: false, icm: icmEnabled(manifest) });
```

Behaviour unchanged; the load-bearing comment at `:43-58` is new and names the
anti-pattern explicitly:

> ⚠️ **Load-bearing (task 5.3). Do not "simplify" this to
> `resolveIcmDefault(manifest.template)`.**

The two resolvers answer different questions — *what did this harness emit?*
(manifest) vs *what should this template emit?* (capability) — and are
deliberately not merged (ADR-285 §"Two resolvers").

## Proof artifact: 5.7 — the conditional is its question, its closer is not

```
$ npx vitest run __tests__/onboarding.test.ts
  ✓ question mode counts a conditional marker as its question, not as a marker
  ✓ question mode excludes a marker the template never declared
  ✓ the two capable templates report their own question counts, not one number
```

The first asserts a 4-token / 2-question split on a synthetic source:
token mode returns `[PROJECT_GOAL, ?FIX_LOOP, /FIX_LOOP]`; question mode returns
`[PROJECT_GOAL, FIX_LOOP]` with neither marker form present. The third proves a
per-template count (6 vs 3) rather than one number. `onboardFiles` forwards
`knownQuestions` (`onboarding.ts:392`) with the parameter optional, so the batch
entry point keeps its pre-5.5 token semantics.

Test lines: `onboarding.test.ts:379` (conditional-as-its-question),
`:398` (undeclared excluded), `:405` (per-template counts).

## Changelog-facing note (5.8) — lift-ready wording for task 6.6

The release entry itself is task **6.6 / SC10** (the `minor` bump and the entry
*leading* with the breaking default change). This task fixes only the measured
number that entry must state; it does **not** write the entry, so as not to
pre-claim 6.6's version decision.

Wording 6.6 can lift verbatim:

> The ICM setup note now counts **unanswered questions**, not placeholder
> markers. On a flagless `vertical:coding` harness the number goes from
> `8 ICM placeholder(s)` to `6 ICM question(s)` — two of the eight tokens were a
> conditional section's open and close markers, and the old count was taken from
> a source that also missed two questions that appear *only* in conditional form
> (it reported `4`). `minimal` reports `3` and `vertical:coding` `6`; neither
> number is hard-coded.

The measured values, for the record: raw markers **8**, true questions **6**,
old-source undercount **4**. The spec anticipated the 8→6 collapse; the 4→6
correction is this task's finding (recorded above and at `validate.ts:361-369`).

## ⚠️ Finding F1 — `minimal` is reported "not ICM-capable"

Measured, on a **flagless** `minimal` harness:

```
$ node dist/harness-bin.js validate /tmp/minf-$X/h --skip-gcp
  SKIP icm-structure — template is not ICM-capable
```

`minimal` is not non-capable; it is **capable and suppressed by default**
(`icm.enabled: true` + `generate: false`). `resolveIcmDefault` folds both
conjuncts into `false`, so the SKIP string at `validate.ts:306` asserts something
false about the template. The two states are genuinely distinguishable —
`entry.icm?.enabled` is readable at that point — so this is a wording fix inside
the same three-way branch §7 describes, not new machinery.

**Not fixed here, deliberately.** SC4's contract is *"distinguishes
capable-but-tree-less (`WARN`) from non-capable (`SKIP`)"*; a third arm is the
spec author's call, and §7's three-way branch is Chris's artifact to amend. The
`WARN` string itself is already honest — it offers *"may be a pre-removal harness
or a hand-deleted tree"* rather than guessing.

## ⚠️ Finding F2 — `onboardFiles` has no caller in the repository

```
$ grep -rn "onboardFiles" packages/create-agent-harness/src packages/create-agent-harness/__tests__ \
    | grep -v "^.*onboarding.ts:392"
(no hits — only the definition)
```

This is **pre-existing, not introduced here**: `git grep onboardFiles f59fbe7`
returns the same single definition line, added in `9afc42e`. Task 5.6 requires the
batch entry point "keeps working"; it does, and its parameter is optional, but it
carries no test and no caller. Recorded so a later grep does not read it as a
miss, and so the dead surface is a known one.

## Full gates

```
$ npm --prefix packages/create-agent-harness run build   → tsc, clean
$ npm --prefix packages/create-agent-harness run lint    → tsc --noEmit, clean
$ npm --prefix packages/create-agent-harness test
   Test Files  52 passed | 2 skipped (54)
        Tests  674 passed | 2 skipped (676)
```

Every mutation experiment in this task was run **before** its restore and the
restore re-verified by `diff` against a saved copy; the tree committed here is
the un-mutated one (`grep` evidence above).
