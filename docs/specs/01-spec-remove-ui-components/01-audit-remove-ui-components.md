# 01-audit-remove-ui-components.md

Planning audit of `01-tasks-remove-ui-components.md` against `01-spec-remove-ui-components.md`. Run 1 — 2026-09-16.

## Executive Summary

- Overall Status: **FAIL**
- Required Gate Failures: **3**
- Flagged Risks: **2**

## Gateboard

| Gate | Status | Why it failed (<=10 words) | Exact fix target |
| --- | --- | --- | --- |
| Requirement-to-test traceability | FAIL | Unit 1 FR-1/FR-2 and Unit 2 FR-7 have CLI-only proofs | `## Tasks > 1.0 Tasks`, `## Tasks > 2.0 Tasks` |
| Requirement-to-test traceability (inversion completeness) | FAIL | 7 test files hard-fail; healthcheck + release unplanned | `## Tasks > 3.0 Tasks`, `#### 3.0 Proof Artifact(s)` |
| Proof artifact verifiability | FAIL | 1.0 compares to a "pre-removal baseline" unreadable post-deletion | `#### 1.0 Proof Artifact(s)` |
| Repository standards consistency | PASS | 2+ guideline sources read; no conflict; `AGENTS.md` absent | — |
| Open question resolution | PASS | All 6 spec OQs (`:177-181`) defaulted explicitly in tasks; OQ3's branch pre-specified | — |
| Regression-risk blind spots | FLAG | 3 mutations cover 3 guards; healthcheck/release/ARC guards unmutated | `## Tasks > 3.0 Tasks` |
| Non-goal leakage | FLAG | `PRIME_AGENT_LOOP.md` DONE records sit on the FR-4/FR-5 boundary | `## Tasks > 4.0 Tasks` |

## Standards Evidence Table (Required)

| Source File | Read | Standards Extracted | Conflicts |
| --- | --- | --- | --- |
| `README.md` | yes | Documented gate order `build` → `test` → `healthcheck`; test count / CI-matrix claims that UI removal will invalidate | none |
| `CONTRIBUTING.md` | yes | "Every load-bearing change requires either updating an existing ADR or adding a new one"; TS tests are vitest; `scripts/smoke.mjs` is the pre-publish gate | none |
| `docs/adrs/INDEX.md` | yes | Ratified ADRs are amended by follow-on, never edited in place; new ADRs append, never renumber | none |
| `package.json` | yes | `workspaces: ['packages/*']` excludes the SPA; `test` = workspace fan-out with `pretest` build | none |
| `.github/workflows/ci.yml` | yes | Fork disposition header block is the durable ledger; triggers on `[main]` only | none |
| `FORK-RESYNC.md` | yes | Disposition table + "remove it again if reintroduced" paragraph are the re-sync mechanism | none |
| `vitest.config.ts` | yes | Test discovery globs are `packages/*/__tests__/**` and `__tests__/**` — new tests must land there | none |
| `~/DEV/CLAUDE.md` (nearest parent) | yes | `~/DEV` is not a repo; a project's own `AGENTS.md`/`CLAUDE.md` is authoritative inside it | none |
| `apps/web-ui/README.md` | yes | Documents the surface being deleted; nothing carries forward | n/a — deleted by this work |
| `AGENTS.md` | not found | Searched repo root and `~/DEV`; neither exists | — |

## Findings

### REQUIRED Failures (max 3 in main report)

1. **Three functional requirements have no planned test artifact — CLI proofs only — and none of the three is mechanically guarded today.**
   - Missing item: Unit 1 FR-1 (generator writes no UI path), Unit 1 FR-2 (`manifest.surface` union narrowed to `'cli'`), and Unit 2 FR-7 (`swe-pareto.json` relocated with both consumers repointed) are each evidenced only by a `grep`/`node` proof artifact. No task adds or inverts a test that would go red if the coupling returned, so the gate's "at least one planned test artifact per functional requirement" is unmet for these three.
   - Verified that no existing test closes the gap: re-adding the `apps/web-ui` write in `gen-templates.mjs` fails nothing (the write is a `mkdir -p`); re-widening `manifest.ts:16` to `surface?: 'cli' | 'web-ui'` fails nothing, because widening a union is backward-compatible and so invisible to `tsc --noEmit`; and `grep -rn swe-pareto __tests__/ packages/*/__tests__/` returns zero hits.
   - Noted fairly — there IS adjacent coverage that does **not** satisfy the gate: `__tests__/manifest-kernel-version.test.ts:41,59` asserts the scaffolded `manifest.meta.surface` *value* is `'cli'`. That guards emitted behavior, not the type union FR-2 asks to narrow, and its own comment at `:10` still describes `'web-ui'` as a live value — so it neither covers FR-2 nor would catch a reinstatement.
   - File section to edit: `## Tasks > 1.0 Tasks` (add 1.16), `## Tasks > 2.0 Tasks` (add 2.16).
   - Acceptance condition: after remediation, the task list names a test for FR-1, FR-2, and FR-7, each shown falsifiable — consistent with the repo's existing source-assertion pattern at `__tests__/path-handling.test.ts:104`, which asserts `SCAN_DIRS` source text rather than runtime behavior.

2. **The spec's hard-fail-site count is both internally inconsistent and incomplete; two unplanned files break Success Metric 4.**
   - Missing item, part (a) — the spec contradicts itself. Unit 3's Functional Requirements (`:76-82`) enumerate **5** inversions (`path-handling`, `sbom`, `workflows`, `packages/arc-agi-3-chatgpt/__tests__/package.test.ts`, `audit-deps`), while Goals (`:15`), the Unit 3 Proof Artifacts (`:92`), and Success Metric 4 (`:172`) all say **4**: *"all 4 hard-failing sites inverted, not removed"*. The two counts cannot both be right.
   - Missing item, part (b) — two further files hard-fail on removals the spec does not count at all. Sub-task 2.6 deletes the `pages()` check, which fails `__tests__/healthcheck.test.ts` at three distinct sites: `:35` (the check-name list contains `'pages'`), `:34` (`/healthcheck — 8 checks/`; the count becomes 7 — verified `CHECKS` is what `Object.keys(CHECKS)` counts at `scripts/healthcheck.mjs:332`), and `:45` (`results).toHaveLength(8)`), plus `:89-97` (`--check=pages` assertions, which reference a check name that no longer exists). Sub-task 2.7 deletes the probe wiring, failing `__tests__/release.test.ts:96` (`scripts/preflight.mjs[^]*--probe-pages` in `release.mjs` source) and `:103-104` (`probePages = args.has('--probe-pages')` and `healthcheck.mjs --probe-pages` in `preflight.mjs`).
   - Net verified count: **7 test files** hard-fail — the 5 Unit 3 enumerates, plus `healthcheck.test.ts` and `release.test.ts`. Success Metric 4 cannot hold as written, and neither can the Goals claim.
   - Noted fairly: spec OQ#1 *does* anticipate the mechanism — "`healthcheck`'s printed check set shrinks by one, and `release.mjs`'s 'preflight clean (incl. live Studio probe)' log line changes wording." So the spec saw the behavioral consequence but never carried it through to the two test files that pin it. The gap is one of traceability, not of understanding.
   - File section to edit: `## Tasks > 3.0 Tasks` (add 3.13 and 3.14, extending the mutation set), `#### 3.0 Proof Artifact(s)` (state the verified 7-file count).
   - Acceptance condition: every code path removed by 2.6/2.7 has a corresponding inverted or updated assertion, and `npm test` is green at the end of 3.0 with no test file deleted. **The spec's own wording is not edited** — Phase 1 artifacts are ratified; the drift is recorded here so Phase 4 validation reads "7 files, not 4".

3. **A 1.0 proof artifact is not reproducible after the work it proves.**
   - Missing item: 1.0's third artifact asserts the registered tool list "equals the pre-removal baseline minus zero entries". After the deletion, a reviewer cannot reproduce that baseline — the comparison direction is unrecoverable. The artifact is observable but not reproducible, failing the evidence quality bar.
   - File section to edit: `#### 1.0 Proof Artifact(s)`.
   - Acceptance condition: the artifact names a **durable** baseline. Sub-task 1.13(c) already provides one — the registered tool-name set must equal `packages/arc-agi-3-chatgpt/.harness/mcp-capabilities.json`'s per-lane `tools` lists, a tracked file that survives the removal. The artifact wording must cite that, and additionally require a one-time pre-removal capture (recorded in ADR-284 or the 1.13 test fixture) so the baseline is auditable rather than asserted.

### FLAG Findings (max 2 in main report)

1. **`docs/PRIME_AGENT_LOOP.md` straddles the FR-4 (scrub live docs) / FR-5 (preserve history) boundary.**
   - Risk: the file mixes one live instruction — `:18`, `npm --prefix apps/web-ui install` — with DONE completion records at `:33-39` that narrate `web-ui` parity work. Sub-task 4.10 scrubs the former and keeps the latter on my judgment. If a reviewer reads FR-4 literally over that file, the task list under-delivers; if FR-5 dominates, it over-delivers. The spec does not resolve which applies to this file, and Non-Goal 5 ("no dream-cycle gist is rewritten") protects *gist* files but says nothing about this one.
   - Suggested remediation: either (a) keep 4.10 as written and add one sentence to ADR-284 recording the live-vs-historical reading for this file, or (b) have 4.10 reword only the *path* at `:18` (e.g. to the CLI equivalent) and leave the surrounding narrative untouched. Needs the maintainer's call, since it is a documentation-history judgment, not a mechanical edit.
   - Related sub-finding, same class: `packages/darwin-mode/LEARNINGS.md:1154` references `apps/web-ui/public/assets/swe-pareto.json` but FR-5 protects historical research records — sub-task 4.12 leaves it alone deliberately.

2. **The README's leaderboard section loses its hosting surface with no agreed replacement, and its numbers go stale.**
   - Risk: `README.md:405` links `https://ruvnet.github.io/metaharness/cost-pareto.html`, and the page itself (`apps/web-ui/public/cost-pareto.html`) plus `og.png` are in-tree assets of the deleted SPA tree. Sub-task 4.8 asks for an editorial rewrite that preserves the results table and `SUBMISSIONS.md` pointer while dropping the live-URL dependence — but the spec's FR-4 enumerates only "10 matching lines" and does not decide whether the Cost-Pareto section's *hosting* is knowingly retired. Separately, `README.md:341-342` assert "2,254 passing" across 246 files and a live Studio URL; the passing count will change with this work, so an unscrubbed count becomes a false claim.
   - Suggested remediation: confirm in ADR-284 that the leaderboard's hosting is retired while its data and `SUBMISSIONS.md` path are preserved, and add a sub-task updating `README.md:341`'s test-count claim to whatever the post-removal suite reports (or removing the number if it cannot be stated accurately).

## User-Approved Remediation Plan

- **Pending approval** — no remediation edit has been applied. The task list is unchanged since generation; the three REQUIRED failures and two FLAGs above are the proposed scope.

Planned remediation, on approval:

| # | Gate | Edit target | Change |
| --- | --- | --- | --- |
| R1 | Traceability | `1.0 Tasks` | Add 1.16 — a test asserting the generator emits no `apps/` path and `manifest.ts` admits only `'cli'`, covering FR-1 and FR-2. |
| R2 | Traceability | `2.0 Tasks` | Add 2.16 — a test asserting `swe-pareto.json` is tracked at `docs/research/` and both consumers resolve it, covering FR-7. |
| R3 | Traceability (inversion) | `3.0 Tasks` | Add 3.13 (`healthcheck.test.ts` — `pages` leaves the name list at `:35`, the count assertions at `:34`/`:45` go 8→7, and `:89-97` is inverted/removed since `--check=pages` no longer names a check) and 3.14 (`release.test.ts:90-105` — the probe wiring assertions become assertions the wiring is gone). Add both to the mutation set (3.8-3.10), raising it to 5. |
| R4 | Traceability (inversion) | `3.0 Proof Artifact(s)` | Replace the "4 hard-fail sites" phrasing with the verified 7-file count, and require the run output as evidence. |
| R5 | Proof verifiability | `1.0 Proof Artifact(s)` | Re-anchor the tool-list baseline on `.harness/mcp-capabilities.json` (durable) plus a recorded pre-removal capture. |
| R6 | FLAG 1 | `4.0 Tasks` | Add the live-vs-historical sentence for `PRIME_AGENT_LOOP.md` to ADR-284 (4.1/4.2), pending Chris's (a)/(b) choice. |
| R7 | FLAG 2 | `4.0 Tasks` | Add 4.17 — update `README.md:341`'s stale test-count claim post-removal; record the leaderboard hosting retirement in ADR-284. |

## Re-Audit Delta

Run 1 — no previous run to compare against.
