# 02-audit-icm-default-on.md

Planning audit of `02-tasks-icm-default-on.md` against `02-spec-icm-default-on.md`. **Run 1 — 2026-09-16.**

## Executive Summary

- Overall Status: **FAIL**
- Required Gate Failures: **3**
- Flagged Risks: **2**

## Gateboard

| Gate | Status | Why it failed (<=10 words) | Exact fix target |
| --- | --- | --- | --- |
| Requirement-to-test traceability | PASS | SC1–SC10 each map to ≥1 planned artifact | — |
| Requirement-to-test traceability (SC9) | FAIL | SC9 has grep only, no regression test | `02-spec §4` SC9 / new sub-task in 2.0 |
| Proof artifact verifiability | FAIL | SC7's "4 placeholder(s)" unverified, contradicted by measurement | `02-spec §4` SC7 |
| Repository standards consistency | PASS | 6 guideline sources read; no conflict; `AGENTS.md` absent | — |
| Open question resolution | FAIL | Spec §6 contradicts Q1 as implemented; `minimal` tree unemittable | `02-spec §6` + §1/§5/§9 |
| Regression-risk blind spots | FLAG | §5 table one file short; omits the `minimal` block | `02-spec §5` |
| Non-goal leakage | FLAG | §7's `upgrade-cmd` line number wrong; claim load-bearing | `02-spec §7` |

## Standards Evidence Table (Required)

| Source File | Read | Standards Extracted | Conflicts |
| --- | --- | --- | --- |
| `README.md` | yes | Gate order `build` → `test` → `healthcheck`; `## Quality gates` maps each concern to a workflow; "19 quick-start templates" | none |
| `CONTRIBUTING.md` | yes | "Every load-bearing change requires either updating an existing ADR or adding a new one"; TS tests are vitest; `scripts/smoke.mjs` is the pre-publish gate | none |
| `packages/create-agent-harness/package.json` | yes | `test` = `vitest run --passWithNoTests`; `lint` = `tsc --noEmit`; `gen:templates` owns `generate:true` dirs only | none |
| `.github/workflows/ci.yml` | yes | Fork disposition header block is the durable ledger; `vertical-tour` (iter 88) is a required, non-skipped gate | none |
| `docs/adrs/INDEX.md` | yes | Ratified ADR bodies amended by follow-on, never edited in place (`:359`); row-annotation precedent (`:339`) | none |
| `docs/specs/01-*/01-tasks-remove-ui-components.md` | yes | In-repo precedent: `## Relevant Files` with per-file rationale + line numbers | none |
| `AGENTS.md` | **not found** | — | — |
| `.github/pull_request_template.md` | **not found** | — | — |

No conflicts. Confidence: **high** — 6 sources read; both required ones present.

## Traceability (SC → planned artifact)

| SC | Task(s) | Artifact |
| --- | --- | --- |
| SC1 | 1.3–1.4, 1.8 | CLI + `icm-scaffold`/`generated-templates` |
| SC2 | 1.9, 3.8 | CLI stdout assertion + test |
| SC3 | 2.7 | CLI exit-0 pair |
| SC4 | 4.4–4.5 | `validate.test.ts` three cases |
| SC5 | 5.1–5.3 | Committed fixture + `upgrade.test.ts` |
| SC6 | 3.14 | Three mutation transcripts |
| SC7 | 5.4–5.8 | **FAIL** — target value unverified |
| SC8 | 6.4–6.5 | ADR-285 + INDEX row + body-untouched diff |
| SC9 | 2.3, 2.5–2.6, 6.7 | **FAIL** — grep only, no test |
| SC10 | 6.6 | Changelog + version diff |

## Findings

### REQUIRED Failures

1. **Spec §6 contradicts Q1's decision as implemented — `minimal`'s ICM generation becomes unreachable.**
   - Missing item: §6 resolves `const useIcm = capable && catalogEntry.generate !== false;` and §7 records `upgrade-cmd.ts` as "**unchanged**". Four internal callers pass `icm: true` **explicitly to `scaffold()`** — `vertical-tour.mjs:116` (filtered by `t.icm`, which includes `minimal`), `icm-optin.test.ts:251,260` (`minimal`), `scaffold-e2e.test.ts:153`, `icm-scaffold.test.ts:59`, `onboarding.test.ts:86,166,309`. `minimal` is verified as the **only** `generate:false` template carrying an `icm`/`stages` block (3 stages). Under §6 as written it resolves to `false` by every path, so the `vertical-tour` ICM pass asserts stages that are never emitted → **the iter-88 CI gate fails on every push**, and `icm-optin.test.ts`'s `generate:false` block fails.
   - File section to edit: `02-spec-icm-default-on.md` §6 (proposed design), with consequences reflected in §1, §5, and §9; add an SC for "explicit `icm` override preserved".
   - Acceptance condition: §6 states `useIcm = opts.icm ?? resolveIcmDefault(opts.template)`; §1 distinguishes the retired user-facing flag from the surviving internal override; §5 lists the `minimal` block as a premise to **preserve**; a new SC asserts an explicit `icm: true` still emits `minimal`'s 3-stage tree.

2. **SC7's `4 ICM placeholder(s)` is unverified and contradicted by measurement.**
   - Missing item: the measured `vertical:coding` overlay holds **8** marker tokens (4 plain + 4 conditional), while the catalog declares **6** questions. `scanResiduals` (`onboarding.ts:320-338`) counts every `{{SCREAMING_SNAKE}}`/`{{?COND}}` token, so it cannot return any of these values. `4` is stated as a target in §4 and as a proof in §12/Q7's record.
   - File section to edit: `02-spec-icm-default-on.md` §4 SC7 and §8 Q7's decision row.
   - Acceptance condition: SC7 is expressed as the **semantics** (count unanswered *questions*, not raw tokens) with the numeric value recorded by task 5.4's measurement rather than pre-asserted; §8 Q7 records the measurement as pending, not decided.

3. **SC9 has no planned test artifact — grep-only, so it cannot regress-detect.**
   - Missing item: SC9's verification is `grep -- '--no-icm\|--icm'` across `src/`, `README.md`, `docs/`. A one-time grep passes once and guards nothing afterwards; a future commit can reintroduce a flag reference with no failing gate.
   - File section to edit: `02-tasks-icm-default-on.md` parent 2.0 (new sub-task) — and SC9's verification clause.
   - Acceptance condition: a test asserts the `--help` output contains no `--icm`/`--no-icm`, alongside the grep.

### FLAG Findings

1. **§5's disposition table is one file short and omits the `minimal` block.**
   - Risk: §5 names six test files; a **seventh** (`__tests__/validate.test.ts:206-216`, asserting `/not generated with --icm/`) has its premise die under 4.4–4.5 and is not listed. Separately, §5 does not mention `icm-optin.test.ts:216-266` at all — the block that must be *preserved* as F1's regression guard. A reader following §5 alone would both miss a victim and delete a guard.
   - Suggested remediation: extend §5's table to seven entries and add a "preserved, not repurposed" row for the `minimal` block.

2. **§7's `upgrade-cmd.ts:49` line number is wrong, and the "unchanged" claim is load-bearing.**
   - Risk: the function is `icmEnabled` at `:44-47`; the re-render call is `:93`. `:49` is inside a doc comment. Since §3.5 makes this site a regression guard, an implementer following the wrong line could conclude there is nothing to protect.
   - Suggested remediation: correct to `:44-47` (function) and `:93` (call), and state that the guard is the **manifest** read, not the line.

## User-Approved Remediation Plan

- **Pending approval** — findings R1 (required), R2 (required), R3 (required), plus optional F1/F2 documentation fixes. No edits made.

## Chain-of-Verification

- *Do all REQUIRED gates pass with explicit evidence?* No — 3 failures, each re-verified against live source this session (F1's four callers by `grep -rn "icm:"`, `minimal`'s uniqueness by catalog query, SC7 by `scanResiduals` source + token count, SC9 by inspection of its verification clause).
- *Are the findings supported?* Yes. R1 is corroborated by the task file's own F1 box; R2 by 5.4/5.8 explicitly defying the pre-stated number; R3 by the absence of any test in parent 2.0 for the help surface.
- *Inconsistencies corrected:* R1 was initially recorded in Phase 2 as "the CI tour breaks", which overstated it for the `vertical:coding` half (capable + `generate:true` keeps working) and understated the `minimal` half (its tree becomes unemittable, not merely untested). Corrected here.
- *Final status:* **FAIL** — 3 REQUIRED. Proceed only after approval and re-audit.
