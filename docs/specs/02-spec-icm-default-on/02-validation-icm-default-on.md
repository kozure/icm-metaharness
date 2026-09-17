# Validation Report — ICM Default On

**Spec:** `docs/specs/02-spec-icm-default-on/02-spec-icm-default-on.md`
**Task List:** `docs/specs/02-spec-icm-default-on/02-tasks-icm-default-on.md`
**Validated commit:** `cc11071` (branch `main`)
**Validation date:** 2026-09-16
**Validated by:** Alfred (Software Engineer agent) — independent re-execution, not a proof-artifact read-through

---

## 1) Executive Summary

**Overall: PASS** — no gates tripped. One **MEDIUM** and one **LOW** issue recorded, neither blocking.

**Implementation Ready: Yes.** All 11 success criteria were re-executed from a clean build and hold; every requirement is traced to a commit and an artifact; the three red preflight steps are independently confirmed pre-existing and touch no file this spec changed.

**Key metrics**

| Metric | Value |
|---|---|
| Requirements verified | **11/11 (100%)** — SC1–SC11 |
| Proof artifacts working | **5/5 documents; 1 unit's evidence in a commit body** (see §3, MEDIUM) |
| Files changed vs expected | **37 changed; 36 in the Relevant Files table, 1 (package-lock.json) linked via its parent commit** |
| Package suite | **674 passed, 2 skipped, 0 failed** (was 657 pass / 7 premise-deaths mid-flight) |
| Structural gates | healthcheck, path-guard, runner-coverage, CI tour — **all green** |
| Typecheck | `tsc --noEmit` — **clean** |

---

## 2) Coverage Matrix

### Functional Requirements

Spec 02 states its requirements as **Success Criteria**, not `FR-` ids — a deliberate
choice, because §4.1 records that the criterion is *semantics* and the number is an
output of implementation. `grep -c "FR-"` on the spec returns **0**; 11 SCs are the
requirement set. No `Unknown` entries.

| Requirement | Status | Evidence |
|---|---|---|
| SC1 — flagless capable scaffold emits the tree; `doctor` → `icm-structure PASS` | Verified | Live: `vertical:coding` flagless → **31 files**, stages `01-plan 02-implement 03-test 04-review`; `runIcmStructure` → `tag=PASS`, `five-layer shape ok (4 stages); 6 ICM question(s)`. Commit `63489a3` |
| SC2 — all 18 non-capable templates unaffected (files **and** stdout) | Verified | Live: `vertical:devops` → 19 files, `Onboarding:` lines **0**; CI tour `20/20 ICM defaults OK` asserts all 20 templates' capability-derived default. Commit `eb0972e` |
| SC3 — `--icm` / `--no-icm` accepted and silently ignored | Verified | Live: `--no-icm` exit 0 with tree emitted; `--icm` stdout **byte-identical** to flagless, file sets identical; no unknown-flag rejection added. `help-surface.test.ts`; commit `f42a32c` |
| SC4 — `doctor` distinguishes capable-but-tree-less (`WARN`) from non-capable (`SKIP`) | Verified | Live two-arm probe: capable+tree-less → `tag=WARN code=0` "…may be a pre-removal harness or a hand-deleted tree"; non-capable → `tag=SKIP code=0` "template is not ICM-capable"; umbrella **HEALTHY** in both. Commit `f59fbe7` |
| SC5 — `upgrade` does not retro-add ICM files | Verified | `upgrade.test.ts` **8/8 pass** against the committed `fixtures/icm-preremoval/` baseline. Commit `a241011` |
| SC6 — no test left silently vacuous; repurposed guards mutation-falsified | Verified | Four mutations redden the new guards (task 01); three more across the suite (task 03); SC5 mutation kills 2/3 incl. the meta-test. Commit `be36438` |
| SC7 — residual note counts **questions**, not marker tokens | Verified | Live: token mode **8** → question mode **6**, `== declared count` (catalog declares 6). Commit `a241011` |
| SC8 — ADR-285 written; ADR-279 row annotated; ADR-279 body **unedited** | Verified | `ADR-285-…md` present with `Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`; `INDEX.md` carries the row; `git log --name-only` over the whole range shows **zero** touches to ADR-279/282. Commit `eb0972e` |
| SC9 — no flag reference survives; help surface **guarded by a test** | Verified | `--help` → `grep -c -- '--icm'` = **0**; `src/` parser+help hits = **0**; the surviving hits are historical ADR bodies and past-tense records (spec §5 names them as records). `help-surface.test.ts` is the gate. Commit `f42a32c` |
| SC10 — changelog **leads** with the breaking change; version `minor` | Verified | `CHANGELOG.md` opens `## [Unreleased]` → `### Changed — BREAKING: ICM emission follows the template; the --icm flag is removed`; version `0.4.16 → 0.5.0`. Commit `eb0972e` |
| SC11 — explicit `icm: true` still emits `minimal`'s tree; `icm: false` suppresses `vertical:coding`'s | Verified | `icm-optin.test.ts` **18/18 pass**, incl. the preserved `generate:false` block; both directions mutation-falsified by dropping the override. Commit `be36438` |

### Repository Standards

| Standard Area | Status | Evidence & Compliance Notes |
|---|---|---|
| Coding Standards | Verified | Typecheck clean (`tsc --noEmit`, exit 0). No ESLint config exists in the repo, so typecheck + `path-guard` are the enforcement surface — both green. Single-source discipline honoured: `resolveIcmDefault` is the *only* capability authority, never re-written at a second call site (`validate.ts` comment says so explicitly) |
| Testing Patterns | Verified | Follows the repo's established Vitest conventions; the repo's own mutation-falsification standard (ADR-279's test contract) was applied to every repurposed guard, and the `minimal` override guard was **preserved** rather than repurposed |
| Quality Gates | Verified | `healthcheck.mjs` PASS (incl. `catalogCount` cross-language sync), `path-guard.mjs` pass, `check-runner-coverage.mjs` ok, CI tour `19/19` verticals + `2/2` ICM + `20/20` ICM defaults, exit 0 |
| Documentation | Verified | ADR-285 + `INDEX.md` row + CHANGELOG leading entry + README/USERGUIDE/ARCHITECTURE updates. Superseded bodies (ADR-279/282) left intact per `INDEX.md:359` — the correct pattern, not a miss |
| Git Traceability | Verified | 11 commits, each scoped to one parent unit and naming its tasks. Logical progression: 1.0 resolver → 2.0 flag deletion → 3.0 premise retirement → 4.0 doctor → 5.0 upgrade/count → 6.0 release |

### Proof Artifacts

| Unit | Proof Artifact | Status | Verification Result |
|---|---|---|---|
| 1.0 | `02-proofs/02-task-01-proofs.md` | Verified | Cited at tasks `:163`. Four mutations each redden the new guards; the fixture's 31-file count reconciles: 21→31 delta of exactly the 10 overlay paths |
| 2.0 | **Commit body** `f42a32c` (no proof document) | Verified — **MEDIUM** | Its 4 CLI artifacts were **re-executed by me**: `--no-icm` → exit 0 + tree; `--icm` ≡ flagless (identical stdout + file set); `--help` grep → 0; `help-surface.test.ts` 2/2. Evidence is real and correct — it lives in the commit message, not a proof doc |
| 3.0 | `02-proofs/02-task-03-proofs.md` | Verified | Cited at tasks `:228`. Three mutations over two directions; records the `icm-off` re-point honestly, incl. a mutation the artifact predicted would be seen and instead was blind to |
| 4.0 | `02-proofs/02-task-04-proofs.md` | Verified | Cited at tasks `:267`. Contains the task-4.3 falsification; my live probe reproduces both arms of SC4 exactly |
| 5.0 | `02-proofs/02-task-05-proofs.md` | Verified | Task 5.5 explicitly cites it. Contains the SC7 measurement and the second (unanticipated) undercount finding |
| 6.0 | `02-proofs/02-task-06-proofs.md` | Verified | Records the 20→30 vs 21→31 discrepancy rather than smoothing it, and attributes the preflight red state instead of re-running it green |

All artifacts are Markdown documents (no URLs, no screenshots), so the URL/screenshot
checks in the reference are not applicable. Each opens with an explanatory heading
before raw evidence, per the repo's established shape.

---

## 3) Validation Issues

### MEDIUM — Unit 2.0's proof evidence lives only in a commit body

- **Severity:** MEDIUM
- **Issue:** Parent 2.0 has a `#### 2.0 Proof Artifact(s)` block with four executable CLI artifacts, and its tasks are all `[x]`, but it is the **only** parent with no `02-proofs/02-task-02-proofs.md`. The evidence — and it is real, correct, and detailed — sits in commit `f42a32c`'s message. Compare: parents 1.0/3.0/4.0 cite a proof document explicitly at tasks `:163/:228/:267`, while 2.0's block ends and jumps straight to `#### 2.0 Tasks`. Evidence: `ls 02-proofs/` → `01,03,04,05,06` (no 02); `grep "02-proofs/02-task-0"` → no `-02-` hit.
- **Impact:** Traceability only. The artifacts re-execute and pass, so **nothing is unverifiable** — but a reader auditing 2.0 must leave the spec tree and read git history, which is a different discovery path than every sibling unit uses.
- **Recommendation:** Non-blocking for merge. Either accept the commit body as 2.0's durable record (it is complete and immutable), or lift it into `02-proofs/02-task-02-proofs.md` for symmetry with its siblings. I have not created it: the unit's evidence was already committed by whoever closed it, and manufacturing a proof doc after the fact is the kind of paperwork that reads as verification without being it.

### LOW — preflight is red, for six pre-existing/environmental reasons

- **Severity:** LOW
- **Issue:** `node scripts/preflight.mjs` exits non-zero. 6.0's artifact list requires it to PASS, and the proof artifact says so plainly, attributing all six. My independent run reproduces **3 of them** (the other 3 are rust/wasm, which I skipped as this spec touched no Rust — and `wasm-pack` is genuinely absent from this host).
- **Impact:** None on verifiability; the repo's own release gate is not green, but was not green before this work.
- **Recommendation:** Already flagged to Chris by 6.0; no action needed for this spec. My verification of each claim:
  - **`version drift`** — the check demands *every* package be `0.1.0` while 41 are independently versioned. **Pre-existing**, confirmed: `metaharness` was `0.4.16` at baseline `0c3aa5e`, also ≠ `0.1.0`.
  - **`evals-extract` missing README** — `git log --all -- packages/evals-extract/README.md` → never existed. **Pre-existing**, and the package is untouched by this diff.
  - **`agntcy` publish test** — a live-server integration test against `localhost:8888`; no Directory server running. `packages/agntcy` has **0** changed files in this range. **Environmental.**

### LOW — two documentation inaccuracies amended, not corrected silently

- **Severity:** LOW
- **Issue:** SC1's table says `vertical:coding` → **30 files**; the live measurement is **31**. And the spec's §3.4 / SC4 carried a `manifest.generatorVersion` pre-removal carve-out that task 4.3 falsified on two independent facts.
- **Impact:** Verification only, and both are now resolved.
- **Recommendation:** Done, with Chris's approval, in commit `cc11071`. The 30-vs-31 gap was already explained by 6.0 (the fixture manifest excludes the two `.harness/` files; **30 is the `--no-darwin` count**, confirmed live: `--no-darwin` → 30, Darwin mode → 31; the stable quantity is the delta of 10). The `generatorVersion` clause is now amended at all three sites — §3.4 (dated amendment block), SC4 ("withdrawn as unimplementable", case count corrected three→two), and the originating round-1 claim in `02-questions-1` — each marked as an amendment rather than silently rewritten, so a future grep lands on the correction.

---

## 4) Evidence Appendix

### Commits analysed

| Commit | Unit | Scope |
|---|---|---|
| `971f33b` | Phase 2 | Sub-tasks + planning audit Run 1 (FAIL, 3 required) |
| `3362e07` | Phase 2 | Audit remediation (R1,R2,R3,F1,F2) |
| `5715f50` | Phase 2 | Audit Run 2 PASS; withdraw false F2 finding |
| `63489a3` | 1.0 | Capability-derived default replacing the two flag checks |
| `98e4095` | 1.0 | Proof notes, preflight caveat, vacuous-test finding |
| `f42a32c` | 2.0 | Flag surface deleted; `help-surface.test.ts` gate added |
| `be36438` | 3.0 | Byte-equality premise retired; guards repurposed |
| `f59fbe7` | 4.0 | `doctor` WARN/SKIP distinction |
| `a241011` | 5.0 | SC5 upgrade guard + question-count semantics |
| `eb0972e` | 6.0 | CI tour, ADR-285, release `0.4.16 → 0.5.0` |
| `cc11071` | 4.3 | Amendment of the falsified `generatorVersion` clause |

### Commands executed (independent re-execution)

| Command | Result |
|---|---|
| `npm run build` | OK |
| `npm --prefix packages/create-agent-harness test` | **674 passed / 2 skipped / 0 failed** (52 passed + 2 skipped files) |
| `node scripts/healthcheck.mjs` | PASS (incl. `catalogCount` sync) |
| `node scripts/path-guard.mjs` | pass |
| `node scripts/check-runner-coverage.mjs` | ok — every test reached by a runner or allowlisted |
| `node examples/vertical-tour/vertical-tour.mjs` | exit 0 — `19/19` verticals HEALTHY, `2/2` ICM, **`20/20` ICM defaults** |
| `npx tsc --noEmit -p packages/create-agent-harness` | exit 0, clean |
| `npx vitest run upgrade / validate / icm-default / help-surface / icm-optin` | 8 / 19 / 3 / 2 / 18 — all pass |
| `node scripts/preflight.mjs --skip-rust --skip-wasm` | exit 1 — 3 failures, all attributed above |

### Live probes (scaffold + inspect, fresh `mktemp` dirs)

| Probe | Result |
|---|---|
| Flagless `vertical:coding` | **31 files**, 10 ICM paths, stages `01 02 03 04`; `runIcmStructure` → PASS, 6 questions |
| Flagless `--no-darwin` | **30 files** — resolves SC1's "30" |
| `--no-icm` | exit 0, tree emitted (silent-ignore holds) |
| `--icm` vs flagless | identical stdout **and** identical file set |
| `vertical:devops` flagless | 19 files, no `Onboarding:` line |
| SC4 arm A (capable, tree-less) | `WARN` code 0, names the template, umbrella **HEALTHY** |
| SC4 arm B (non-capable) | `SKIP` code 0, umbrella **HEALTHY** |
| SC7 token vs question mode | 8 markers → **6** questions == catalog's 6 |
| Finding F1 (`minimal` flagless) | `SKIP — template is not ICM-capable` — **confirmed live**; see note below |

### Carried forward, not fixed here

**Finding F1** was recorded by 5.0 and left open: a flagless `minimal` harness is
reported as *"not ICM-capable"* when it **is** capable — it is `generate: false`, i.e.
capable-and-suppressed-by-default. `resolveIcmDefault` folds both conjuncts to `false`,
so the string asserts something false about the template. I reproduced it live:
`minimal flagless => SKIP | template is not ICM-capable`. It is a **wording** defect
inside §7's branch, not a structural one, and SC4's contract names only two arms — so
fixing it is an amendment to the spec, not a validation finding. Recorded for the spec
author. Note it does **not** weaken SC2: `minimal`'s default output is unchanged.

**Before merging, do a final human review of the implementation and this report.** The
MEDIUM item (2.0's proof-document gap) and two LOWs block nothing.

**Validation Completed:** 2026-09-16 23:49 (America/Vancouver)
**Validation Performed By:** Alfred (Software Engineer agent)
