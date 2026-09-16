# 02-audit-icm-default-on.md

Planning audit of `02-tasks-icm-default-on.md` against `02-spec-icm-default-on.md`.

**Run 1 — 2026-09-16: FAIL (3 required).** Remediation approved and applied in `3362e07`.
**Run 2 — 2026-09-16: PASS.** Findings from Run 1 all closed; see the closure table.

## Run 2 — Executive Summary

- Overall Status: **PASS**
- Required Gate Failures: **0**
- Flagged Risks: **1** (informational)

## Run 2 — Gateboard

| Gate | Status | Evidence |
| --- | --- | --- |
| Requirement-to-test traceability | PASS | SC1–SC11 each map to ≥1 planned artifact (§6.1 override has a test pair) |
| Proof artifact verifiability | PASS | SC7 deferring to measurement was itself verified: 3 independent counts (8 tokens / 6 questions / `scanResiduals` source) |
| Repository standards consistency | PASS | 6 sources; ADR requirement honoured (task 6.4); gate order followed (task 6.8) |
| Open question resolution | PASS | §6 is now consistent with Q1 as implemented; the contradiction that caused Run 1's failure is gone |
| Regression-risk blind spots | PASS | §5 now covers seven files and adds a preserved-row; `validate.test.ts` coordinated between 3.13 and 4.5 |
| Non-goal leakage | PASS | §9 explicitly excludes the override and the resolver merge |

## Run 1 Findings — Closure

| # | Run 1 status | Finding | Closure evidence (verified in the remediated files this session) |
| --- | --- | --- | --- |
| R1 | REQUIRED | §6 made `minimal`'s tree unemittable | **CLOSED.** §6 now reads `useIcm = opts.icm ?? resolveIcmDefault(opts.template)`; §6.1 documents the four callers and `minimal`'s uniqueness; §1 distinguishes flag from override; §5 marks `icm-optin.test.ts:216-266` as **preserve**; §6.3 adds A4 with its casualties; SC11 asserts both override directions; tasks 1.10, 3.10b, 3.14(c) implement it |
| R2 | REQUIRED | SC7's `4` unverified | **CLOSED.** SC7 states semantics only; new §4.1 tabulates the conflicting measurements (8 tokens, 6 questions, `scanResiduals` counting tokens) and defers to 5.4/5.8; §8 Q7 annotated; 5.8 now explicitly says a mismatch is a finding, not a failure |
| R3 | REQUIRED | SC9 grep-only | **CLOSED.** SC9 requires a `--help` assertion; task 2.8 creates `__tests__/help-surface.test.ts`; the grep is downgraded to a companion |
| F1 | FLAG | §5 one file short, omitted the preserve | **CLOSED.** §5 now covers seven files, calls out `validate.test.ts:206-216` by name, and adds the preserved-row with a blockquote explaining that deleting it would remove the only guard for the override rule |
| F2 | FLAG — **WITHDRAWN, was a false finding** | §7 cited `upgrade-cmd.ts:49` | **CLOSED by withdrawal.** Run 1 claimed `:49` was "prose inside a doc comment" and that the function was at `:44-47`. Re-verified live: **`sed -n '49p'` returns `function icmEnabled(…): boolean {`** — Run 1's citation was CORRECT and my "correction" was the error. The doc comment is `:44-48`. Run 2's remediation introduced `:44-47` in four places (spec §6.2, §7, task header, Relevant Files) and those have been reverted to `:49` / `:44-48`. The useful part of the finding survives on its own merits: the **call site** at `:93` was genuinely absent from §7 and is now cited. |

## Run 2 — New Findings

### FLAG (informational, non-blocking)

1. **Task 2.9 is a grep, not a test — accepted as a companion check.**
   - Risk: it verifies a *call-site argument* is absent, which is hard to assert programmatically without exporting internals. It is a build-time companion to 2.8's real test, and 1.10/3.10b cover the *behaviour* (override honoured) rather than the plumbing. This is an acceptable division: the behaviour is tested, the plumbing is grepped.
   - Suggested remediation: none required. Noted so a later reader does not mistake it for the gate.

### Observation

2. **Spec §5's intro still says "All 5 tests share this premise" about `icm-off.test.ts` while the table now covers seven files.** Not an error — the sentence is scoped to that one file — but the file's count (5) and the table's row count (7 files) sit close together and invite a misread. Left as-is; flagged for the Phase 3 implementer's awareness only.

## User-Approved Remediation Plan

- **Run 1's plan: approved 2026-09-16 and fully applied in `3362e07`.** No open remediation items.

## Chain-of-Verification

- *Do all REQUIRED gates pass with explicit evidence?* **Yes.** Each Run 1 REQUIRED finding was re-checked against the remediated file contents by direct read, not by trusting the edit. R1: verified §6/§6.1/§1/§5/§9/SC11 and tasks 1.10/3.10b/3.14(c) all now assert the override. R2: verified §4.1's three-way measurement table exists and 5.8 defers rather than conforms. R3: verified SC9's clause and task 2.8.
- *Are the findings supported?* Yes. R1's supporting count (four callers, `minimal` unique among `generate:false` entries) was established by `grep -rn` and a catalog query in this session, and is reproduced in §6.1.
- *Inconsistencies corrected during remediation:* (a) the §6.2/§6.3 numbering collided with the pre-existing §6.1 "Alternatives" and was renumbered so Alternatives is §6.3; (b) a cross-reference to "§6.2" for the override was corrected to "§6.1" after renumbering; (c) the task file's header box still described F1 as unresolved and was rewritten to state both findings are resolved **in the spec** with the spec authoritative; (d) Run 1's own R1 description overstated the `vertical:coding` half — corrected in Run 1's Chain-of-Verification and carried accurately into §6.1.
- **A defect introduced BY the remediation, caught and fixed in this run.** F2's "correction" was wrong: it moved the `icmEnabled` citation from `:49` (correct) to `:44-47` (its doc comment). Caught by verifying my own correction with `sed -n '49p'` rather than trusting the earlier `sed -n '44,50p'` range read, which had included the comment block and misled me into treating the range's *end* as the declaration. Four files reverted to `:49` / `:44-48`; every other line number cited in spec §3.1, §3.2, §3.4, §5 and §7 was then re-verified individually (`index.ts` 225/226/229/1185/1186/1244/694/855, `walker.ts:59`, `validate.ts:266-271`, `onboarding.ts:320`) — all correct.
- *Lesson recorded:* when a line number is the artifact under review, verify the **single** line, not a context range whose boundaries include surrounding prose.
- *Artifact counts recounted:* task sub-tasks **58** (Run 1's commit message said 61 — a miscount; the true pre-remediation figure was 53, verified via `git show 971f33b`). Spec SCs **11** (was 8 pre-revision, 10 pre-remediation).
- *Final status:* **PASS — 0 required failures.** Ready for Phase 3 implementation.
