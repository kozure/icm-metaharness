# Task 03 Proofs — the byte-equality premise is retired, its guards repurposed

## Task Summary

Task 1.0's flip made `icm-off.test.ts` and parts of `icm-optin.test.ts`
`scaffold-e2e.test.ts` and `onboarding.test.ts` assert a premise that no longer
exists: *"no flag ⇒ no ICM."* After the flip, `icm: undefined` resolves to `true`
on a capable template, so those tests compared an ICM scaffold against another
ICM scaffold — they passed and proved nothing. This task repoints or retires each
one, and **falsifies the repointed guards by mutation** so the new greening is
earned rather than inherited.

Two of the task's own prescribed re-points were **measured to be impossible** and
were not implemented as written. Both are recorded below as findings, not
silently substituted.

## What This Task Proves

- The vacuity 1.0 predicted is **real and measured**: the un-repointed
  `icm-off.test.ts` passes 2 of its 5 tests for the wrong reason.
- The repointed guards are **not vacuous**: mutation (a) reddens 8, mutation (c)
  reddens 8, and mutation (b) reddens 3 across the suite.
- The `minimal` `generate:false` block survives as the **F1 guard** — it passes
  only because the explicit override survives, and mutation (c) proves it goes red
  without it.
- The override is honoured in **both** directions (SC11), proven by a new
  `icm:false`-on-capable case that mutation (c) also reddens.
- `scaffold-e2e.test.ts`'s byte-equality test is **deleted, not weakened**, with
  the reason the claim is now false-by-design recorded at the deletion site.
- The suite is green with **no** premise-dies failure remaining: `666 passed |
  2 skipped (668)`, and the CI tour holds at `19/19 HEALTHY, 2/2 ICM trees OK`.

## Evidence Summary

| Artifact | Result |
|---|---|
| Un-repointed `icm-off.test.ts` against new `src/` | **3 failed, 2 passed** — the 2 are the vacuous pair |
| `icm-off.test.ts` repointed | 5/5 pass, 5 distinct claims |
| Mutation (a) resolver→`false` | **8 red** (3 `icm-off` + 3 `icm-optin` + 2 `icm-default`) |
| Mutation (b) resolver→`true` | **3 red** (`icm-default` only — see the evasion finding) |
| Mutation (c) override dropped | **8 red**, incl. the `minimal` F1 block **and** the `icm:false` case |
| Full suite, unmutated | `666 passed \| 2 skipped (668)`, 52 files passed |
| CI tour | `19/19 verticals HEALTHY, 2/2 ICM trees OK` |
| `grep -rn "icm: undefined" __tests__/` | 1 hit — a **comment** explaining the old baseline, no live assertion |

## Artifact: The vacuity is real — falsified before the repoint

**What it proves:** 1.0's finding was not a suspicion. Task 3.0's proof had to
assert the two tests go red if un-repointed, and it does, measured.

**Why it matters:** A task whose whole purpose is "no test left silently vacuous"
must demonstrate the vacuity it is fixing. Reading the code and predicting it is
not evidence.

**Command:** `git show HEAD:…/icm-off.test.ts > /tmp/…` then run it against the
new `src/`.

**Result summary:** The original file yields `3 failed | 2 passed (5)`. The two
that pass are exactly the pair 1.0 named — *"yields identical bytes for every file
the flag does not legitimately rewrite"* and *"leaves the flagless manifest
byte-identical across two independent runs"* — because both compared
`icm: undefined` against `icm: true`, and `undefined` **is** `true` on a capable
template now.

~~~text
× replaces the banner with the router at root CLAUDE.md — and only that
× adds exactly the ICM paths and nothing else
× keeps the flagless manifest free of every ICM path
 Tests  3 failed | 2 passed (5)
~~~

Both survivors were repointed (3.2/3.4): the byte comparison now toggles the
*override* on a single template, and the determinism test uses a capable flagless
pair so it still proves the **new default** is stable.

## Artifact: Task 3.2 / 3.5's prescribed re-point is falsified

**What it proves:** The task text told me to repoint the byte-delta onto a
*capable vs non-capable* comparison (`vertical:coding` vs `vertical:devops`) and to
assert `capable-minus-non-capable == ICM_PATHS`. Both are impossible. Measured, not
argued.

**Why it matters:** This is the one place the task's own instruction produced a
wrong test. Implementing it as written would have produced a green test that
asserts nothing about the overlay — the precise failure mode task 3.0 exists to
remove. The spec (§4 SC7, §7) is explicit that a measurement may falsify a
prediction and that the honest response is to report it.

**Command:** scaffold each template flagless, compare name sets and per-file bytes.

**Result summary:**

| Measurement | Value | Implication |
|---|---|---|
| `coding` flagless files | 31 | — |
| `devops` flagless files | 19 | — |
| Names in common | 14 | — |
| Of those 14, **content differs** | **8** | sharing a path ≠ equal file |
| `coding`-only names | **17** | ≠ 10, so "capable − non-capable == ICM_PATHS" is false |
| `ICM_PATHS.length` | 10 | — |
| Templates whose flagless output ⊆ `coding`'s | **1** (`minimal`) | every other non-capable adds 3–7 own files |

A cross-template file/byte delta therefore **cannot isolate the ICM contribution**:
the two templates differ in their base content by more than the overlay. The
measurement that *does* isolate it is toggling the surviving override on **one**
template (`icm:false` vs `icm:true`) — exactly what the removed flag used to do,
now expressed through the library seam. The *capability* claim is guarded
separately and correctly, by name-set presence (capable flagless emits the tree,
non-capable flagless does not).

**Result summary (asymmetric finding):** the substituted override-delta guard is
**blind to mutation (b)** — see the evasion artifact. The capability direction is
covered by `icm-default.test.ts` 1.1/1.9 instead. Coverage moved; it was not lost.
Recorded because the task's proof artifact predicted *"mutation (b) → the
non-capable cases red"* in **this file**, and in this file they are not.

## Artifact: Mutation falsification — three mutations, two directions

**What it proves:** The repointed guards gate. Each mutation reddens a distinct
set, and (c) reddens both halves of the override proof.

**Why it matters:** ADR-279's own standard: a gate must be shown to go red. A
guard that cannot fail is documentation.

**Command:** mutate `src/index.ts`, `npx vitest run` over the three ICM files.

| Mutation | Red | Which |
|---|---|---|
| (a) `resolveIcmDefault` → `false` | **8** | 3 `icm-off` (router-per-mode, manifest records, capable tree) + 3 `icm-optin` (flagless tree, router, upgrade post) + 2 `icm-default` (1.1 predicate, 1.8 emission/record) |
| (b) `resolveIcmDefault` → `true` | **3** | 1.1 predicate ×2 + 1.9 leak channel (`result.onboarding`) |
| (c) `opts.icm ??` dropped | **8** | the `minimal` **F1 block** ×2 + 3.10b `icm:false` case + `icm-off` delta + `icm-optin` delta/upgrade-pre/2.6 ×2 + 1.10 ×2 |

~~~text
(a) Test Files  3 failed (3)   Tests  8 failed | 24 passed (32)
(c) Test Files  3 failed (3)   Tests  8 failed | 24 passed (32)
~~~

Mutation (c) satisfies 3.14's requirement literally: it turns **both** the
`minimal` `generate:false` block (3.10) **and** 3.10b's `icm:false` case red —
the pair that is the proof §6.1's override is honoured in both directions.

## Artifact: Mutation (b)'s evasion — explained, and where it IS caught

**What it proves:** Mutation (b) is invisible to *file-set* guards for a
structural reason, and the suite still catches it — but only via the stdout/leak
guards, not the file guards.

**Why it matters:** A mutation that kills nothing is either a vacuous guard or a
missing one. Here it is neither: it is a **structurally unobservable-at-file-level**
change, and the observable consequence lives on a different channel. Saying that
plainly is the point of this artifact.

**Command:** probe non-capable output under mutation (b).

**Result summary:** `vertical:devops` owns **no `.icm/` overlay**, so
`useIcm = true` is a **file-level no-op** — 19 files, 0 `stages/` entries, no root
`CONTEXT.md`, byte-identical before and after.

~~~text
                unmutated   mutated(b)
resolveIcmDefault(devops)   false       true
devops flagless files          19          19
devops stages/ entries          0           0
devops CONTEXT.md at root   false       false
~~~

The leak is real but lives on **stdout**: `index.ts:922`'s `if (useIcm)` runs the
onboarding pass regardless of payload, producing
`{ mode: 'interactive', required: [], residuals: [] }` — the
`Onboarding: interactive (0 questions)` line of §3.3. `icm-off.test.ts` walks
*files* and never inspects `result.onboarding`, so it cannot see (b) by
construction. `icm-default.test.ts` 1.9 asserts that field (and the printed line),
which is why (b) reddens there.

**Conclusion:** the mutation pair is complete **across the suite**, not within
`icm-off.test.ts`. SC2 ("files **and** stdout") is satisfied by the pair, not by
one file.

## Artifact: The stale-`dist` trap — a mutation that appeared to be uncatchable

**What it proves:** 1.0's caveat ("the CLI assertion cannot fail on a broken
resolver while the CLI still passes `icm:` explicitly") was **correct as written
but is now obsolete**, and its obsolescence was initially masked by a stale build.

**Why it matters:** My first mutation-(b) run showed the CLI stdout guard
*passing*. The cause was not the resolver — it was that
`icm-default.test.ts:31` spawns `dist/bin.js`, and `dist/` is **gitignored**
(`.gitignore:2`), so the guard graded the pre-flip artifact. This is a
reporting-of-false-negative class of error: the guard looked vacuous and was not.

**Command:** mutate `src/`, **`npm run build`**, then re-run.

**Result summary:** after rebuilding, mutation (b) reddens the CLI guard too:

~~~text
before rebuild:  × 1.1 ×2, × 1.9 library      (3 red)   ← CLI guard passed
after  rebuild:  × 1.1 ×2, × 1.9 library,
                 × 1.9 CLI stdout             (3 red, now incl. the user-visible surface)
~~~

1.0's caveat is therefore **closed by task 2.4**: the CLI no longer supplies
`icm:`, so an explicit `false` no longer masks the resolver, and the printed
surface gates the resolver directly. Four test files spawn `dist/bin.js`
(`bin-exit-code`, `plugin-manifest-coverage`, `onboarding`, `icm-default`); CI is
unaffected because `ci.yml:151-153` runs `npm run build` before `npm test` — but a
local `vitest run` without a build grades a stale artifact. Recorded here so it is
not re-diagnosed as a vacuous guard.

## Artifact: The `minimal` F1 guard survives, with the reason written down

**What it proves:** `icm-optin.test.ts`'s `generate:false` block is left
*substantively intact* (3.10) and now carries the explanation of why its
assertions must not be "cleaned up" as leftovers.

**Why it matters:** `minimal` is the **only** template that both carries an ICM
payload **and** is ICM-free by default (`icm.enabled === true`,
`generate: false`). Because the resolver requires `generate !== false`, a bare
capability default would make its tree **unemittable by any path** — audit R1.
Those tests pass *only* because an explicit `icm: true` still overrides.

**Artifact path:** `__tests__/icm-optin.test.ts` (`F1 GUARD (task 3.10)` comment
block, `MINIMAL_PATHS`, the two `generate:false` cases).

**Result summary:** the block is unchanged in substance; mutation (c) reddens both
of its cases, which is the falsification the comment promises.

## Artifact: 3.10b — the reverse override case (SC11)

**What it proves:** `scaffold({ template: 'vertical:coding', icm: false })` emits
**no** ICM tree — the override wins in the negative direction.

**Why it matters:** 3.10 covers `icm: true` on a default-off template. Without the
mirror, an override-dropping regression that respected only `true` would pass
every other test in the suite.

**Result summary:** no `ICM_PATHS` present, no `stages/` entries, and still a full
scaffold (>10 files) — the override suppresses ICM, not the harness. Reddened by
mutation (c) as required.

## Artifact: 3.11 — deleted, not weakened

**What it proves:** `scaffold-e2e.test.ts`'s "byte-identical when the flag is
absent" is removed with a comment naming why it is unrepurposable.

**Why it matters:** A superseded-contract assertion left in place freezes the
defect. The spec's honest framing ("byte-equality retired,
capability-preservation substituted") requires the *loss* to be recorded, not
hidden.

**Result summary:** deleted at `:184`, replaced by a comment stating the premise
died, that a capable flagless scaffold is now different by design, and that the
surviving property (capability decides) is guarded by `icm-off`/`icm-optin`.

## Artifact: 3.12 — the vestigial flag is gone; the subject is asserted

**What it proves:** `onboarding.test.ts`'s `--icm` argument is removed and the
test passes because of its real subject (residue reporting), not because an
ignored flag happened to change behaviour.

**Result summary:** the spawn now runs flagless; the passing assertion is
unchanged (the pre-onboarding placeholder residue is reported).

## Artifact: 3.13 — disposition

**What it proves:** `validate.test.ts:206-216` was audited and is **not** silently
dropped.

**Why it matters:** It is the *seventh* premise-dies site, and §5 flags that it is
easy to miss because it asserts on a message string, not a mode.

**Result summary:** the task text says "coordinate with 4.2's new message", so the
repoint is genuinely blocked on parent **4.0**'s three-branch rewrite
(`WARN` capable-tree-less / `SKIP` non-capable / carve-out pre-removal). It is
repointed in 4.5, under 4.0. Left unchecked here rather than checked on a
half-truth: the current assertion still matches `/not generated with --icm/`, which
4.2 is scheduled to replace. **No grep-clean claim is made for this site in this
task.**

## Artifact: Suite and CI tour — no premise-dies failure remains

**What it proves:** All 7 premise-dies tests from 1.0's report are now resolved,
and nothing else moved.

**Command:** `npx vitest run` (package) · `node examples/vertical-tour/vertical-tour.mjs`

**Result summary:**

~~~text
Test Files  52 passed | 2 skipped (54)
     Tests  666 passed | 2 skipped (668)

[vertical-tour] DONE — 19/19 verticals HEALTHY, 2/2 ICM trees OK
~~~

1.0 reported `654 passed | 7 failed (663)`; the 7 are gone, and the count rose by
12 as the repointed/added guards landed. The 2 skips are pre-existing.

## Artifact: The 3.0 proof-artifact sweep

**What it proves:** Every proof artifact named in 3.0's header was produced.

| 3.0 artifact | Result |
|---|---|
| four ICM test files pass | 51 passed (4 files) |
| mutation (a) → capable cases red | 8 red, incl. 3 `icm-off` |
| mutation (b) → non-capable cases red | 3 red **in `icm-default`, not `icm-off`** — see evasion finding |
| `grep -rn "icm: undefined" __tests__/` | 1 hit, a comment (no live assertion) |
| `scaffold-e2e.test.ts:184` deleted with a note | done |
| `icm-optin.test.ts:216-266` substantively intact | done, F1 comment added |
| explicit `icm: false` on capable → no tree | done (3.10b), reddened by (c) |

## Reviewer Conclusion

The premise-dies set is fully resolved and the repointed guards are
mutation-falsified in both directions (8 red for (a), 8 for (c)), with the suite
green at `666 passed` and the CI tour at `2/2 ICM trees OK`. Two findings must be
carried forward rather than smoothed over: **(1)** task 3.2/3.5's prescribed
cross-template re-point is impossible and was replaced by a same-template override
delta, which is blind to mutation (b) — that direction is covered by
`icm-default.test.ts` 1.1/1.9 instead; **(2)** the CLI stdout guard grades a
gitignored `dist/`, so it must be rebuilt before it is trusted locally (CI builds
first, so CI is unaffected). Task 3.13 is deliberately left open, blocked on
parent 4.0's message rewrite as its own text specifies.
