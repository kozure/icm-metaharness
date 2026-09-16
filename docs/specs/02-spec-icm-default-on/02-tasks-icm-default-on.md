# 02-tasks-icm-default-on.md

Derived from `02-spec-icm-default-on.md` (revised to the flag-removal frame, commit `9af51bf`). Six parent tasks, one per demoable unit, ordered so the capability resolver lands before the flag surface is deleted and before any test premise is retired.

**Sub-tasks and the Relevant Files table are generated in Phase 3**, after these parent tasks are confirmed.

> **Scope corrections carried in from the standards sweep.** Four sites reference the flag but are **absent from the spec's §7 impact table**. Each was verified against source this session and is folded into the tasks below:
>
> 1. `examples/vertical-tour/vertical-tour.mjs` — **CI gate** (`ci.yml` "vertical-tour (iter 88)"). Its ICM pass filters `catalog.filter(t => t.icm)` (`:194`) and calls `scaffold({…, icm: true})` (`:116`). `minimal` **has** an `icm` block, so it is in that set. A `generate !== false` resolver excludes `minimal` → the pass asserts stages that are no longer emitted → **this breaks CI**, and `minimal` loses *all* tour coverage (the main pass is `TEMPLATES.filter(t => t !== 'minimal')`, `:172`).
> 2. `src/validate.ts` — a further literal `` `not generated with --icm` `` at the `isIcm` early-return detail string, plus two doc comments. Q4 rewords one of these three; the other two are unnamed in §7.
> 3. `__tests__/validate.test.ts:212` — `expect(r.detail).toMatch(/not generated with --icm/)`. A **fourth** test whose premise dies; §5 lists six files and misses this one.
> 4. `docs/adrs/ADR-282-seam-smoke-test-one-stage-through-the-bridge.md` — states in its body that "ADR-279's byte-equality-without-the-flag guarantee … still hold[s]". Post-removal the body is false but, per `INDEX.md:359`, a ratified ADR body is **never edited**; the correction is carried by ADR-285's `Supersedes` header plus an `INDEX.md` row annotation. Also `src/seam-driver.ts:79,480` carry `--icm` prose in doc comments and an error message.

## Tasks

### [ ] 1.0 Capability-derived ICM resolution replaces the two flag checks

Introduce the resolver and thread it through the scaffold path. This is the load-bearing task: it is the only one that must land before the flag can be deleted, and it is demoable on its own — after 1.0 a **flagless** `vertical:coding` scaffold emits the ICM tree, while a flagless non-capable scaffold is unchanged.

#### 1.0 Proof Artifact(s)

- CLI: `npx metaharness my-bot --template vertical:coding --force && ls -R my-bot/.harness \| grep -c stages` → `4` directory entries demonstrates the flagless capable path emits the tree
- CLI: `npx metaharness my-bot --template vertical:devops --force` → `Files: 18` and **no** `Onboarding:` line demonstrates the non-capable path is unchanged in files *and* stdout (spec §3.3)
- CLI: `npx metaharness validate my-bot` (capable) → `icm-structure PASS` demonstrates the emitted tree satisfies the catalog's declared stage set
- Test: `__tests__/icm-scaffold.test.ts` and `__tests__/generated-templates.test.ts` pass demonstrates the catalog↔emitted-tree conformance contract still holds after the resolution change
- Diff: the resolver site inside `scaffold()`, replacing `opts.icm === true` at `index.ts:694` and `:855` demonstrates one resolver serves walk, onboarding, and CLI

#### 1.0 Tasks

TBD

### [ ] 2.0 The flag surface is deleted

Remove `--icm` / `--no-icm` from the parser, the help text, the `--answers` implication, and both `icm?: boolean` doc comments. Demoable: the flags become silent no-ops and help no longer advertises them.

#### 2.0 Proof Artifact(s)

- CLI: `npx metaharness my-bot --template vertical:coding --no-icm --force` → **exit 0**, tree still emitted demonstrates the accepted silent-ignore behaviour (spec Q3)
- CLI: `npx metaharness my-bot --template vertical:coding --icm --force` → exit 0, output identical to flagless demonstrates the removed flag is inert, not an error
- CLI: `npx metaharness --help \| grep -c -- '--icm'` → `0` demonstrates no dead flag reference survives in help
- Grep: `grep -rn -- "--no-icm\|'--icm'" src/ templates/ scripts/` → no hits outside intentional test fixtures demonstrates the §3.1 table was complete

#### 2.0 Tasks

TBD

### [ ] 3.0 Retire the byte-equality test premise and repurpose its guards

The sharp edge (spec §5). `icm-off.test.ts` would pass vacuously after 1.0 — comparing an ICM scaffold against an ICM scaffold. This task deletes, inverts, or re-scopes the six tests whose premise dies, then **mutation-falsifies** the repurposed ones so a green result means something.

#### 3.0 Proof Artifact(s)

- Test: `npx vitest run __tests__/icm-off.test.ts __tests__/icm-optin.test.ts __tests__/scaffold-e2e.test.ts` passes demonstrates the retired premise did not simply go silent
- Test (mutation): resolver forced to `return false` → `icm-off.test.ts` capable-case goes **red**; transcript captured and committed demonstrates the repurposed guard actually gates (ADR-279's own falsification standard: "three separate mutations each turn the gate red")
- Grep: `grep -rn "icm: undefined" __tests__/` → nothing outside `minimal`-template cases demonstrates no test still asserts on a mode that no longer exists
- Diff: `__tests__/scaffold-e2e.test.ts:184` deleted, with its removal note naming *why* it is unrepurposable (the flag it would re-point to does not exist) demonstrates the loss is recorded, not hidden

#### 3.0 Tasks

TBD

### [ ] 4.0 `doctor` distinguishes capable-but-tree-less from non-capable

Today `runIcmStructure` conflates both cases behind one `SKIP — not generated with --icm` string that becomes actively false. Reorder the manifest read so the catalog entry is reachable before the early return, and emit a three-way message with a pre-removal carve-out.

#### 4.0 Proof Artifact(s)

- Test: `__tests__/validate.test.ts` — three cases (capable/tree-less → `WARN`; non-capable → `SKIP`; pre-removal flagless harness → carve-out) demonstrates all three branches
- CLI: `npx metaharness validate <capable-and-tree-less-dir>` → `WARN`, not `FAIL`, and the detail names the template demonstrates the new signal is actionable
- Diff: the reordered `manifest.template` read at `validate.ts:271` relative to the `:266-269` early return demonstrates the fix is a reorder, not new state

#### 4.0 Tasks

TBD

### [ ] 5.0 `upgrade` regression guard and the residual question count

Two independent correctness items that share a verification style. `upgrade-cmd.ts:49` must keep reading the harness's own manifest — or `upgrade` retro-adds 10 files to a pre-removal harness. Separately, `scanResiduals` counts raw tokens, so a capable template reports 8 where 4 questions are unanswered.

#### 5.0 Proof Artifact(s)

- Test: `upgrade` on a committed pre-removal flagless `vertical:coding` fixture → resulting file set **identical** before/after demonstrates no retro-added ICM files (spec SC5)
- Test: `scanResiduals` on the `vertical:coding` tree → `4` named questions (not 8 tokens), conditional markers reported separately demonstrates the count now means "unanswered questions"
- CLI: `npx metaharness validate <dirty-icm-dir>` → residual line reads `4 ICM question(s)` demonstrates the operator-facing string matches the new semantics

#### 5.0 Tasks

TBD

### [ ] 6.0 CI tour, supersession record, and release

Close the loop: repair the CI gate that task 1.0's resolver breaks, write ADR-285, annotate the index, and state the breaking change in the changelog. Demoable as a green `vertical-tour` plus a reviewable ADR diff.

#### 6.0 Proof Artifact(s)

- CLI: `node examples/vertical-tour/vertical-tour.mjs` → **exit 0**, ICM pass reports `1/1 OK` demonstrates the CI gate is repaired for the new capability predicate (scope correction 1)
- CLI: `node examples/vertical-tour/vertical-tour.mjs` → the `minimal` template still appears in some pass demonstrates the tour's coverage hole is closed, not merely narrowed (the main pass excludes `minimal` at `:172`)
- Diff: `docs/adrs/ADR-285-*.md` exists with `Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`, and `docs/adrs/INDEX.md` carries the row annotation demonstrates supersession by follow-on, with the ADR-279 body untouched per `INDEX.md:359`
- CLI: `node scripts/healthcheck.mjs` → PASS demonstrates the structural gate (incl. `catalogCount` cross-language sync) is unaffected
- Diff: `CHANGELOG.md` entry leading with the breaking default change and a `minor` version bump demonstrates the break is stated in words (spec §4.1)

#### 6.0 Tasks

TBD
