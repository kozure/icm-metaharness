# Task 4.0 proofs — `doctor` distinguishes capable-but-tree-less from non-capable

Parent 4.0, spec `02-spec-icm-default-on` (ADR-285, superseding ADR-279 d2).
Files: `packages/create-agent-harness/src/validate.ts`,
`packages/create-agent-harness/__tests__/validate.test.ts`.

---

## ⚠️ Task 4.3 is falsified: the pre-removal carve-out is unimplementable

Task 4.2/4.3 prescribe a **three-way** branch whose third arm is a pre-removal
carve-out keyed on `manifest.generatorVersion`. Two independent facts kill it:

**1. The field does not exist.** `HarnessManifest` records `generator`
(`src/manifest.ts:49`), not `generatorVersion`. `manifest.generatorVersion` is
`undefined` on every scaffold ever produced. Task 4.3's "already recorded at
scaffold time" is false.

```
$ python3 -c "import json; m=json.load(open('/tmp/final-intact/.harness/manifest.json')); print(list(m.keys()))"
['schema', 'generator', 'template', 'template_version', 'vars', 'hosts', 'files', 'generated_at', 'meta']
                                                                             ^ no generatorVersion
$ scaffold({template:'vertical:coding', generatorVersion:'0.1.0'}) -> manifest.generator == "0.1.0"
```

**2. Even with the right field name, the value discriminates nothing.** Every
code path stamps the **hard-coded literal `'0.1.0'`** — `index.ts:1313` and
`analyze-repo.ts:426` — and nothing threads the real package version
(`0.4.16`) into it. No release, build, or script step stamps it either
(`grep -rn "generatorVersion" scripts/ .github/ package.json` → no hits).
So a pre-removal harness and a post-flip tree-less one both record `generator:
"0.1.0"`, and **no comparison against any `FLIP_VERSION` can separate them**:

```
pre-flip  harness stamps "0.1.0"  -> below any 0.5.0/1.0.0 flip -> carve-out
post-flip harness ALSO stamps "0.1.0" (hard-coded) -> below too -> carve-out  <- identical
```

Worse than useless: because `0.1.0` is *always* below the flip, the prescribed
predicate would route **every** capable-tree-less harness — including the
genuine post-flip anomaly the branch exists to surface — to the silent
carve-out, making the WARN arm unreachable and the signal dead on arrival.

Corroborating evidence that the intended discriminator was never real: the
generator-skew machinery already built for this purpose (`diag.ts`
`manifestGeneratorVersion` / `localGeneratorVersion`) reads the same
`generator` field and, on a real harness, reports `minor-diff` — it too cannot
tell pre- from post-removal.

### The substitute taken

The two cases collapse into one honest state: *a capable template with no tree*.
That is emitted as a single `WARN` (code `0`, never `FAIL`), with a detail that
carries **both** readings rather than guessing one:

```
WARN icm-structure — template "vertical:coding" is ICM-capable but no ICM tree
was emitted — may be a pre-removal harness or a hand-deleted tree
```

This preserves SC4's actual requirement (the states are *distinguishable to the
operator*, and the signal names the template) while dropping a carve-out that
could not have been computed.

The spec is internally split on this, and the falsified half is the smaller one.
§3.4's table (`:178`) **already concedes** "indistinguishable" for the
pre-removal row — its only error is the trailing clause "though
`manifest.generatorVersion` is recorded", which is the non-existent field.
§3.4's own prose (`:168`) names `manifest.template` as the free discriminator,
and Q5's answer (`:399`) hedged the carve-out behind "**(B)** reword + …
pre-removal carve-out". So the landed behaviour is what §3.4's table body and
prose describe; what must be struck is the version clause at **`:178`** and the
same phrase in **SC4 (`:199`)**. Flagged rather than edited, since the spec is
Chris's artifact to amend.

Two consequential sub-tasks are therefore **not done as written**: 4.2's third
arm, and all of 4.3. Recorded here, not hidden.

---

## Proof artifact: three cases pass

```
$ npx vitest run __tests__/validate.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

Count: 18, up from 17 committed — **one** test added (the WARN case) and the
SKIP case retargeted in place, not added.

- capable-but-tree-less → `WARN`, naming the template ✅ (new)
- non-capable → `SKIP` ✅ (retargeted off `/not generated with --icm/`)
- pre-removal carve-out → **not implemented; merged into the WARN above** ❌
- tree present → `PASS` ✅ (unchanged path, 4.6)

## Proof artifact: CLI → `WARN`, detail names the template

`npx metaharness validate` is not a command — the subcommand binary is the
**second** `bin` entry (`package.json`: `harness` → `dist/harness-bin.js`;
`metaharness` → `dist/bin.js` is the scaffolder). `npx metaharness validate …`
is therefore parsed as a *harness name* and scaffolds a directory named
`validate`/`diag`. (Hit twice during this task; the stray `diag/` was trashed.)
The proof uses the correct binary, on a capable template whose tree was
stripped from the manifest **and whose sibling `manifest.sha256` was
regenerated** — otherwise `doctor`'s hash check FAILs and confounds the run:

```
$ node dist/harness-bin.js validate /tmp/final-vertical:coding --skip-gcp
  WARN icm-structure — template "vertical:coding" is ICM-capable but no ICM tree
  was emitted — may be a pre-removal harness or a hand-deleted tree
Result: HEALTHY (release-ready)
exit=0
```

`code: 0` confirmed — the WARN is advisory. `validate.ts:441` aggregates
`if (r.code !== 0) problems++` (the tag at `:439` is only chosen *for display*
from `r.code`, so a `code: 0` WARN renders as `WARN` yet does not count), so
`code: 0` keeps `doctor`'s verdict healthy.

## Proof artifact: non-capable → `SKIP`

```
$ node dist/harness-bin.js validate /tmp/final-vertical:devops --skip-gcp
  SKIP icm-structure — template is not ICM-capable
Result: HEALTHY (release-ready)
exit=0
```

## Proof artifact: happy path not regressed (4.6)

```
$ node dist/harness-bin.js validate /tmp/final-intact --skip-gcp
  PASS icm-structure — five-layer shape ok (4 stages); 4 residual placeholder(s):
  BUILD_COMMAND, PROJECT_GOAL, REVIEW_FOCUS, TEST_COMMAND
```

`entry` (the catalog lookup) is still on this path — it is only *moved*, not
removed. Existing coverage: `icm-optin.test.ts` 18/18 and
`icm-scaffold.test.ts` 3/3 pass (21/21).

## Proof artifact: grep — no hits

```
$ grep -rn "not generated with --icm" src/
(no hits) ✓

$ grep -rn -- "--icm" src/
src/index.ts:220:   * `scaffold()`. `--icm` and `--no-icm` were deleted from the parser; they are
```

Both literals in `validate.ts` are gone. The one survivor is **Task 2.7's
deliberate record** of the accepted silent-ignore contract (SC3) — prose
documenting that the flags were removed, not a behavioural reference. Correct
to keep; the grep criterion "no hits" is met for `validate.ts`, which is what
4.4 scoped.

## Proof artifact: the fix is a reorder, not new persisted state

```
$ git diff --stat
 packages/create-agent-harness/__tests__/validate.test.ts | 31 ++++++++++--
 packages/create-agent-harness/src/validate.ts            | 58 ++++++++++++++++++----
 2 files changed, 75 insertions(+), 14 deletions(-)
```

No schema change, no new manifest field, no migration: `manifest.template` was
already recorded and already read — it is hoisted above the `isIcm`
early-return so it is reachable before a `SKIP` is emitted. `index.ts` is
**byte-identical to committed** (`git diff --stat …/src/index.ts` → empty); an
optional-parameter widening of `resolveIcmDefault` was drafted and reverted,
since a second `catalog.json` parse costs 0.5 ms (measured, 1000 iterations)
next to the file walks `validate` already performs, and keeping the signature
untouched keeps parent 1.0's committed surface stable.

## Mutations falsified — the WARN arm actually gates

Each mutation applied to `src/validate.ts`, tests run, file restored.

**(a) capable-absence branch removed (revert to always-`SKIP`):**

```
$ npx vitest run __tests__/validate.test.ts
 × WARNs when a capable template emitted no ICM tree, naming the template
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

**(b) capability hardcoded `false`:**

```
$ npx vitest run __tests__/validate.test.ts
 × WARNs when a capable template emitted no ICM tree, naming the template
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

Both directions of the new branch are load-bearing: it cannot be silently
deleted (a), and it cannot be silently starved of its input (b).

## Full gates

```
$ npx vitest run                     # package
 Test Files  52 passed | 2 skipped (54)
      Tests  667 passed | 2 skipped (669)

$ node examples/vertical-tour/vertical-tour.mjs
 [vertical-tour] DONE — 19/19 verticals HEALTHY, 2/2 ICM trees OK in 578ms

$ npx tsc --noEmit                   # clean
```

Count note: 667 passed, up from 666 at task 3.0 — **one** test added (the WARN
case); the SKIP case was retargeted in place, not added. `npm run build` is
required before any CLI proof because `dist/` is gitignored (`.gitignore:2`) and
`harness-bin.js` was rebuilt before both CLI runs above.

## Task 3.13 discharged here

`validate.test.ts:206-216` was left open at 3.13 **blocked on 4.0's message
rewrite** — repointing earlier would have asserted against a string 4.2 was
scheduled to delete. With the three-way branch landed, the assertion is
retargeted to `/not ICM-capable/` and `makeIcmDir()`'s comment (which explained
`isIcm` as "generated with `--icm`") is rewritten to describe the ADR-285
discriminator. 3.13 can now be closed.
