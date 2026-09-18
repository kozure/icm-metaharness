# 03 Questions Round 1 — upgrade fidelity

Please answer each question below (select one or more options, or add your own notes). Feel free to add additional context under any question.

> **Why this round exists.** The request is one sentence — "make `upgrade` faithful" — and it is a **defect fix that changes what a destructive command is allowed to do**. Two things make it more than a patch: the "fix" that looks obvious (re-apply the missing passes inside `upgradeCmd`) is the shape that **already failed once** here, and the command's damage is currently *silent and cumulative*. So the questions are mostly about **shape and honesty of reporting**, not about which lines to change.
>
> **Context found during assessment** (measured against source at `9d69e37` via the source-level API, not recalled):
>
> - **`upgrade` reports drift on every harness `scaffold` can produce.** On a fresh, untouched `minimal` harness: `0 added / 2 removed / 1 clean-overwrite`. On a fresh `vertical:coding` (2 hosts, `--sessions`): `0 added / 5 removed / 2 clean-overwrite`. `added` is empty in both — the entire drift is **scaffold-only content**, which is the signature of the root cause.
> - **One root cause, four passes.** `scaffold()` applies four post-render passes *outside* `templates/` — host configs (GH #10/ADR-045), the license (GH #23), Darwin Mode (ADR-147, **default ON**), and sessions (ADR-246 §2.3). `upgradeCmd()` re-applies **one** of them (`integrateFieldMemory`, `upgrade-cmd.ts:117-119`). That one was patched *because* it drifted (`upgrade-cmd.ts:116-118`) — the fix was correct, local, and did not generalise.
> - **`--apply` silently destroys `package.json`.** Exit code **0**, summary line `Clean apply — no conflicts.` Measured before → after on a clean `vertical:coding` harness: `license` `MIT` → `undefined`; `devDependencies['@metaharness/darwin']` present → **dropped**; `scripts.evolve` → **dropped**; `dependencies['@metaharness/host-codex']` → **dropped**. `planUpgrade` classified it `clean` — correct about the local file, wrong about the upstream one, because one came from `scaffold()` and the other from a partial re-render.
> - **The "removed" files are not removed.** `applyPlan` (`upgrade.ts:127-159`) has no `plan.removed` loop — it never deletes anything. Verified post-apply on disk: `LICENSE`, the evolve skill, `src/sessions/log.ts`, `.codex/config.toml`, `AGENTS.md` all still present. So the report claims a deletion it does not perform, on files that should never have been deleted.
> - **It gets worse each run, and this is the repository-corrupting part.** `.harness/manifest.json` is **never rewritten by apply** (post-apply it still lists 32 files and still names `LICENSE`). Run 1: `0 conflict`, exit 0. Run 2: `2 conflict`, exit 1, **one** `<<<<<<< current` marker written into `package.json`. Run 3: markers accumulate (1 → 2) and `package.json` **stops parsing as JSON** — so npm, the tooling, and the next upgrade all break on it.
> - **The `No drift` branch is unreachable.** `__tests__/upgrade-cmd.test.ts:44` asserts `No drift` on a freshly scaffolded harness and fails. It encodes the right contract and cannot pass, because every scaffold carries at least `LICENSE` and the darwin skill by default.
> - **The test that would catch it cannot run.** `__tests__/upgrade-cmd.test.ts` is one of the **58** entries in `scripts/runner-coverage-allowlist.json` ("nothing runs the root suite today. Tracked in #194"). `npm test` is `npm run -ws --if-present test`, and `-ws` excludes the root package. This failure is one of 17 currently invisible in CI.
> - **The repo already claims a standard it violates.** `upgrade.ts:1-19` cites "per ADR-008 + copier docs" and reproduces copier's algorithm. Copier's stated rule for this exact case: *"Template-based files/directories that were deleted in the generated project are automatically excluded from updates."* Copier treats a path the template no longer emits as **excluded**, never as something to delete — and never deletes user files during `update`.

---

## 1. Fix shape — where does `upgrade`'s "expected" file set come from?

This is the decision that determines whether the bug is fixed once or every time someone adds a pass.

- [ ] (A) **One shared `renderHarness(template, vars, opts)` returning `{ files, manifest }`.** `scaffold()` and `upgradeCmd()` both call it. A fifth pass later touches one place and both paths get it; the manifest can come from the same call (→ Q3).
- [ ] (B) **`upgrade` scaffolds into a temp dir and diffs against it.** Correct by construction — the baseline *is* `scaffold` — at the cost of a throwaway tree per run and dragging the onboarding/answers path into `upgrade`.
- [ ] (C) **Record the pass switches in the manifest and replay them.** Half-built already (`hosts` and `field_memory` are recorded, `index.ts:1003-1005`), but `darwin` and `sessions` are not — so it needs a schema bump and still doesn't prove the bytes match.
- [ ] (D) Other (describe).

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` is the only option where the *next* pass cannot silently re-open this class of bug. The evidence is in the repo: the one pass that was re-applied by hand (`field_memory`) does not drift, and the four that weren't do. Hand-re-application is already demonstrated to fail here.
- `(A)` also collapses Q3 — the manifest becomes a return value of the same call, so "apply must rewrite the manifest" stops being a separate obligation that can be forgotten (which is exactly what happened).
- `(B)` is genuinely tempting and is the fallback I'd take if the extraction turns out messy inside `scaffold()`. It is strictly more correct than `(A)` and strictly more expensive; `(A)` gets the same guarantee for a refactor, and the SC2 matrix is what proves it.
- `(C)` is the most "data-driven" answer and the only one that would keep working if the passes were ever applied conditionally on something *not* derivable from the file map. Nothing in this codebase suggests that. It buys a schema bump for a problem the file map already answers — the same way `icmEnabled` reads the manifest.

---

## 2. `removed` — what does the report mean, and may `--apply` ever delete?

Today the plan prints `5 removed` and `applyPlan` never touches `plan.removed`. It claims an action it does not perform, for files that were never supposed to be removed.

- [ ] (A) **Name it, never act on it.** The report states plainly that these paths are no longer emitted by the template and are left in place, listing them. Matches copier's "excluded from updates" reading; keeps the genuine signal; zero destruction risk.
- [ ] (B) **Drop `removed` from the user-facing report.** Only `added`/`changed` shown; `removed` stays internal. Smallest surface; loses the "no longer managed" signal.
- [ ] (C) **Make `removed` real — actually delete the files.** Contradicts copier, and would delete files that are legitimately user-managed.
- [ ] (D) Other (describe) — e.g. (A) plus an opt-in `--prune-removed` that moves files aside rather than unlinking.

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` makes the report honest without adding a destructive path. After Q1 the `removed` set should shrink to genuinely-retired template files — which is real information a user wants ("this file is no longer managed by the template"), and exactly what the current report is trying to say while also implying deletion.
- `(A)` is also the conservative reading of the house rule on this machine: nothing destructive is the default, and a move-aside beats an unlink. `upgrade` runs in the *user's* repository.
- `(B)` loses a signal for a cosmetic gain, and the signal is the one that tells a user a file has stopped being maintained.
- `(C)` should only be chosen deliberately. If you do want pruning, `(D)` is the shape I'd write — opt-in, explicit, and move-aside — but it is extra scope and arguably its own spec.

---

## 3. Convergence — must `--apply` rewrite `.harness/manifest.json`?

The manifest is never rewritten by apply (verified: still 32 files, still listing `LICENSE` after a successful apply). That is the direct cause of the marker accumulation — run 2 sees the file run 1 just wrote as a local edit.

- [ ] (A) **Yes — write the manifest from the same pipeline result**, including the self-hash (`index.ts:1008-1011`). Makes apply idempotent and convergent; SC5 and SC6 depend on it.
- [ ] (B) **No — leave the manifest alone**, and only stop the false `removed` report. `upgrade` then stays permanently non-convergent, and the conflict-marker bug stays live.
- [ ] (C) Yes, **and** treat "manifest describes a file the template no longer emits" as its own diagnosable state rather than silently rewriting over it.
- [ ] (D) Other (describe).

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` is what turns "the report is now correct" into "the repo actually converges". Without it the spec can promise SC1–SC4 and cannot promise SC5/SC6 at all, and the run-2/run-3 damage remains.
- `(C)` is `(A)` plus a diagnostic, and is defensible — but note that after Q1 the manifest and the pipeline agree by construction, so the "stale manifest" state largely stops arising. Adding a detector for a state the fix removes is scope I'd rather not take on speculatively.
- `(B)` is the option that would make this spec *look* like it fixed the bug while leaving the worst symptom in place. I'd push back on it.

---

## 4. Report detail — must the plan name the affected files?

Today the dry-run prints `5 removed` / `2 clean-overwrite` and never lists a path. My probes had to call `planUpgrade` directly to learn the five names.

- [ ] (A) **Yes — every affected path is listed**, grouped by kind. The dry-run becomes reviewable, which is the point of a dry-run.
- [ ] (B) **Keep counts; add `--verbose` for paths.**
- [ ] (C) Leave as-is.

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` addresses the second half of why this bug survived: a destructive plan that does not name its targets is unreviewable, so nobody could see that it intended to overwrite `package.json`. Listing is a few lines and it is what makes `--apply` auditable.
- `(B)` is the compromise if you want to keep default output terse — but the counts are precisely what hid the problem, and `--apply` is the command where "terse" is least appropriate.
- `(C)` leaves the spec depending on the SC3 snapshot test as the *only* way to see what happened, including for a human at a terminal.

---

## 5. Is "byte-exact no-op on an untouched harness" a hard invariant?

- [ ] (A) **Hard invariant, snapshot-tested** (SC3): a full recursive file-hash snapshot before and after `--apply` on an untouched harness must be identical — not merely "the plan said 0 changed".
- [ ] (B) **Best-effort** — assert the plan's counts plus the specific fields we know about (license, darwin, host deps).

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` is the assertion that would have caught the real damage without me knowing where to look. `(B)` only catches §3.2 because I already knew `license`/`darwin`/host deps were the injected fields; a future pass would slip straight past it.
- The core lesson of this defect is that **the plan's own report was trusted** and was wrong in both directions. The test must not repeat that mistake.
- `(A)` is also cheap: hash the tree, apply, hash again, compare. No new infrastructure.

---

## 6. Harnesses already damaged by the current bug

Anyone who ran `upgrade --apply` on a clean harness has quietly lost `license`, Darwin Mode, and secondary host deps; anyone who ran it twice has conflict markers inside a `package.json` that no longer parses. Both are recoverable — by scaffolding into a temp dir and reconciling, not by running the tool again.

- [ ] (A) **Detect and document.** `doctor` warns on the damage signature; `USERGUIDE`/`README` carry the recovery recipe. Repair tooling is a separate spec.
- [ ] (B) **Detect and repair in place** — this spec also restores the dropped fields.
- [ ] (C) **Do nothing** — the fix only prevents new damage.

**Recommended answer(s):** [(A)]

**Why:**

- `(A)` is small, honest, and does not pretend to a guarantee we can't make. Detection is a signature check (injected fields missing / markers present / manifest naming files that no longer exist) and a doc paragraph.
- `(B)` sounds kinder but needs its own decisions that are genuinely hard: which dropped field was user-edited vs machine-injected, what merge order, what to do when the user *also* changed `package.json`. That is a spec, not a section.
- `(C)` leaves silent damage in repos and no way to learn about it. I would not ship `(C)` alongside a changelog entry that admits the data loss.

---

## 7. Two adjacent scope calls — (a) version drift, (b) the root-suite runner

Two things sit next to this fix. Neither is required for SC1–SC11.

**(a) Version drift.** `template_version` is hardcoded `'0.0.0'` (`manifest.ts:78`) and `generator_version` is declared (`upgrade-cmd.ts:33`) but never read — so a template that changed upstream is indistinguishable from corruption, surfacing as anonymous drift.

- [ ] (A) **In scope** — record real versions and let the plan distinguish "the template moved" from "you edited this".
- [ ] (B) **Separate spec.**

**Recommended answer(s):** [(A)]

**(b) The root-suite runner (#194, SC12).** All 9 root test files are in `runner-coverage-allowlist.json`; `npm test` uses `-ws`, which excludes the root package — so the test that catches this bug is invisible in CI.

- [ ] (A) **In scope** — add the runner so this fix is actually guarded.
- [ ] (B) **Separate** — the fix ships unguarded; #194 tracks the runner.

**Recommended answer(s):** [(B)]

**Why:**

- `(a)` → `(A)`: it is the same defect class (a recorded value that doesn't describe reality), it is two fields, and doing it now avoids touching the manifest schema twice in the same surface. Left separate, the very next template edit reproduces anonymous drift and someone re-opens this spec.
- `(b)` → `(B)`, with a caveat said out loud: the runner is its own piece of work with its own CI surface, and bundling it lets a CI problem block a data-loss fix. But then **SC12 carries no weight until #194 lands**, and the honest consequence is that this fix is unguarded on merge — visible only to whoever runs the root suite by hand. If that trade is not acceptable, answer `(A)` and I will fold the runner in as its own demoable unit.

---

## Round 1 answers

| Q | Answer | Date |
|---|---|---|
| 1 | *(pending)* | |
| 2 | *(pending)* | |
| 3 | *(pending)* | |
| 4 | *(pending)* | |
| 5 | *(pending)* | |
| 6 | *(pending)* | |
| 7a | *(pending)* | |
| 7b | *(pending)* | |
