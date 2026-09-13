# ADR-280: Fork CI triggers target `fork/main`

- **Status**: Accepted — implemented in `.github/workflows/{ci,security,draco,examples-packages-smoke,real-tools}.yml`; verified on `fork/main` after push.
- **Date**: 2026-09-13
- **Deciders**: Chris (kozure) — fork owner; ruled 2026-09-13 ("A. and add a push trigger").
- **Tags**: fork, ci, github-actions, triggers, upstream-drift, process
- **Extends**: ADR-279 (fork design — pin policy, `--icm` opt-in, `CLAUDE.md` ownership)
- **Amends**: task 1.7's disposition wording ("dispose by enable/disable, never re-trigger") — see Decision, item 4
- **Related**: `FORK-RESYNC.md`, `.fork-pin`, upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: ADR-279's Consequences left an open flag — the fork's only long-lived branch is `fork/main`, but every inherited workflow triggers on `branches: [main]`, so the inherited CI gate ran on **nothing**.

---

## Context

ADR-279 §3 (task 1.3) established the fork as a clone-with-shared-history carrying **exactly one long-lived branch, `fork/main`** — created directly at the pin. At `kozure/icm-metaharness`, that branch is also the repository's **default branch**, and it is the only branch that exists on the remote:

```
fork/main  @ 1e9bf5d   ← the only branch, and the default
main       @ d5833dc   ← local-only, tracks upstream/main; never pushed
```

Upstream's workflows are written for upstream's topology, where `main` is the trunk:

| workflow | `push` trigger | `pull_request` trigger |
|---|---|---|
| `ci.yml` | `branches: [main]` | `branches: [main]` |
| `security.yml` | `branches: [main]` | `branches: [main]` |
| `draco.yml` | `branches: [main]` + bench paths | bench paths (no branch filter) |
| `examples-packages-smoke.yml` | `branches: [main]` + examples paths | examples paths (no branch filter) |
| `real-tools.yml` | *(none — PR-only)* | `branches: [main]` |

Consequently, at the pin:

- **No push to `fork/main` matched any `push` trigger.** The branch name is not `main`, and being the *default* branch does not help — GitHub matches the literal branch name.
- **No PR matched either**, because no PRs are opened against the fork branch.
- Task 1.6's 17-job green run (CI run `34714363286`) was a **manual `gh workflow run ci.yml` dispatch**, not a push-triggered run. `ci.yml`'s `workflow_dispatch` was the only reason any inherited gate had ever executed.

This is a real loss, not cosmetic. ADR-279 records that `ci.yml`'s Rust ×3-OS and WASM ×3-OS jobs "carry the upstream-drift detection value", and `FORK-RESYNC.md`'s whole purpose is to merge upstream commits into `fork/main`. Under the as-inherited triggers, **a re-sync merge is itself a push to `fork/main`** — so the one event most likely to break the fork was precisely the event that ran no checks.

Two options were put to Chris (2026-09-13):

- **A** — widen the triggers to include `fork/main`.
- **B** — keep upstream's triggers byte-identical and gate work through a pull request into a deliberately lagging `main` mirror, relying on the `pull_request: branches: [main]` filters. *(Note: with `fork/main` and `main` at the same commit the PR is empty and GitHub runs no checks, so `main` would have to lag `fork/main` permanently, at the cost of a manual per-change PR discipline.)*

Chris chose **A**, plus a `push` trigger for `real-tools.yml`, which upstream ships as PR-only.

## Decision

### 1. `fork/main` is added to the push and PR branch filters

`ci.yml` and `security.yml` get `branches: [main, fork/main]` on both `push` and `pull_request`. `main` is **kept in the list** rather than replaced: the fork's design intent (ADR-279) is that it may be merged upstream, and a future `main`-targeted PR should not go dark as a side effect of this change.

`draco.yml` and `examples-packages-smoke.yml` receive the same addition. Their **path filters are unchanged**, so both remain cheap: `draco.yml` still fires only on `packages/bench/**` and its own file, `examples-packages-smoke.yml` only on `examples-packages/**`.

### 2. `real-tools.yml` gains a `push` trigger, scoped to `fork/main` only

Upstream is PR-only here, correctly: the gate installs real tools (semgrep, the codeql shell) and guards that the real-tool oracles actually ran rather than silently skipping, which is a *proposed-change* concern. But with no PRs against `fork/main`, that made the gate permanently dark on the fork.

The added trigger is deliberately **narrower** than the others:

```yaml
  push:
    branches: [fork/main]
  pull_request:
    branches: [main, fork/main]
```

`[fork/main]` and not `[main, fork/main]`, so this gate stays inert on upstream-bound PRs it was not designed to run for, while still guarding fork pushes. This is the one place the fork's trigger set is intentionally *less* parallel to the others.

### 3. The divergence is bounded, labelled, and conflict-mechanical

Five workflow files now differ from upstream in their `on:` blocks. Upstream touches `.github/workflows/` in **53 of its last ~800 commits (~6.6%)**, and `ci.yml`/`security.yml` specifically are edited upstream (e.g. `#128` added `timeout-minutes` to every matrix job). So re-sync conflicts on these blocks will occur — but each is a **single line**, and the resolution is always the same: *keep `fork/main` in the list.*

To make that unambiguous at merge time, every edited trigger block carries an inline comment naming ADR-280 and, in `ci.yml`, an explicit re-sync instruction:

```yaml
    # Fork: `fork/main` added per ADR-280. ...
    # Re-sync note: keep `fork/main` in this list when resolving a merge conflict on this block.
    branches: [main, fork/main]
```

Each file's fork-disposition header (the durable ledger established in task 1.7) was also updated to record the ADR-280 amendment, so the headers remain truthful about *why* the trigger differs from upstream.

### 4. This amends task 1.7's disposition wording — explicitly

Task 1.7 reads: *"Disable by workflow edit, never by deleting files"*, and ADR-279 records the disposition as enable/disable. Widening a trigger is neither. It is therefore recorded here as an **explicit, owner-ruled amendment** to that wording rather than a silent edit, in the same spirit as the pin re-amendment recorded in `01-repin-and-halt-note.md`. The *substance* of 1.7 is untouched: the five hazardous workflows remain `disabled_manually`, and `draco.yml`'s scheduled judged job remains removed.

## Consequences

- **The inherited gate is live again.** A push to `fork/main` runs the full `ci.yml` matrix — measured at ~25 minutes, 17 jobs (Rust ×3-OS, WASM ×3-OS, Node 20/22 ×3-OS, native Meta-Proxy ×2, pack+install ×2, bench) on run `34714363286`.
- **Re-sync merges are now guarded.** This is the point of the change: the merge most likely to break the fork now runs CI. Previously it ran nothing.
- **Cost is latency, not money.** The repository is public, so Actions minutes are unlimited and free; the only price is ~25 minutes of wall-clock per push and a notification.
- **A per-push full matrix is noisy for trivial changes.** Accepted knowingly: the alternative is an unguarded trunk. `concurrency: group: ci-${{ github.ref }}` with `cancel-in-progress: true` already bounds the cost by cancelling superseded runs on the same ref.
- **Five workflow files now diverge from upstream.** Each re-sync that touches an `on:` block conflicts on one line per workflow. This is the deliberate trade taken over Option B's permanent PR discipline.
- **The re-sync procedure gains a step.** `FORK-RESYNC.md`'s re-verification of the task-1.7 disposition must now also re-verify that `fork/main` survives in the five trigger lists. The inline comments are the mechanism that makes this hard to miss.
- **A stale re-sync is now visible.** Previously an upstream merge could land on `fork/main` with no CI at all; a regression would wait for someone to remember `gh workflow run`. Under this ADR, silence in the Actions tab means the workflow genuinely did not fire, not that it fired and passed.

## Alternatives Considered

- **Option B — byte-identical `on:` blocks, work gated through a PR into a lagging `main` mirror.** Rejected by the owner. It buys zero trigger divergence, but requires that `main` be held permanently behind `fork/main` (equal commits make the PR empty, and GitHub then runs no checks), plus a manual PR opened and closed at every checkpoint. The gate then depends on a process being remembered, which is the failure mode this ADR exists to remove.
- **Stay dark — keep upstream's triggers and dispatch `ci.yml` by hand.** Rejected: this is exactly the status quo that let the re-sync path go unguarded. `workflow_dispatch` remains available under this ADR, but as a supplement, not the mechanism.
- **Replace `main` with `fork/main` rather than adding to it.** Rejected: a future upstream-bound PR to `main` would silently run nothing.
- **Give `real-tools.yml` the same `[main, fork/main]` list as the others.** Rejected: this gate is a proposed-change concern and upstream's PR-only shape is correct for it; the fork needs it on pushes, not on upstream-bound PRs. Hence the narrower `[fork/main]`.
- **Add a `fork/main` push trigger to the five *disabled* workflows.** Rejected: `publish.yml`, `pages.yml`, `proxy-pin-drift.yml`, `published-smoke.yml`, and `pages-monitor.yml` are `disabled_manually` for reasons independent of triggers (npm publish via GCP WIF, Pages the fork does not deploy, an `issues: write` watcher, published-package smoke tests, and a monitor of upstream's Pages site). Widening their triggers would not make them runnable and would only enlarge the diff.
- **A separate fork-only CI workflow.** Rejected: a second full matrix duplicates ~25 minutes of jobs and drifts from upstream's, defeating the inherited-gate value that ADR-279 §1.7 explicitly preserves.

## Test Contract

**Status (2026-09-13): the trigger wiring is verified by YAML parse and by an observed run; the committed regression test below is not yet written.**

Verified by direct measurement:

- **All ten workflow files parse as valid YAML**, and each of the five edited files resolves to the intended branch list:

  | file | `push` | `pull_request` |
  |---|---|---|
  | `ci.yml` | `[main, fork/main]` | `[main, fork/main]` |
  | `security.yml` | `[main, fork/main]` | `[main, fork/main]` |
  | `draco.yml` | `[main, fork/main]` + bench paths | `[main, fork/main]` + bench paths |
  | `examples-packages-smoke.yml` | `[main, fork/main]` + examples paths | `[main, fork/main]` + examples paths |
  | `real-tools.yml` | `[fork/main]` | `[main, fork/main]` |

- **A push to `fork/main` fires the gate.** The push carrying this ADR triggers `ci.yml` (and `draco.yml` / `examples-packages-smoke.yml` only if their paths are touched) **without a manual dispatch** — the first automatic run in the fork's history. Recorded by run id in the commit that lands this ADR.

Proposed regression test (`packages/create-agent-harness/__tests__/` — NOT YET WRITTEN; a repo-level workflow lint, not a package unit test):

- **Every long-lived branch the fork actually uses appears in every trigger list it needs.** Read `.github/workflows/*.yml`, and assert that each of `ci.yml`, `security.yml`, `draco.yml`, `examples-packages-smoke.yml`, and `real-tools.yml` names `fork/main` in at least one trigger branch filter. The point is to catch a re-sync that silently reverts the `on:` block to upstream's `[main]` — the failure mode this ADR exists to prevent, which is otherwise invisible until someone notices CI has gone quiet.

- **`real-tools.yml`'s `push` filter stays `fork/main`-scoped.** Assert it is not widened to `[main, fork/main]`, so the deliberate narrowing (Decision 2) is pinned rather than incidental.

- **The five hazardous workflows stay `disabled_manually`.** A repo-state assertion via `gh workflow list --all` (task 1.12's proof artifact, re-run after every re-sync): `publish.yml`, `pages.yml`, `proxy-pin-drift.yml`, `published-smoke.yml`, `pages-monitor.yml` disabled; `draco.yml`'s judged job absent. This pins that ADR-280 widened *triggers* without disturbing task 1.7's *disposition*.

## References

- `docs/adrs/ADR-279-fork-pin-policy-icm-optin-claudemd-ownership.md` (fork design; §1 pin policy, §Consequences "New upstream workflows arrive active")
- `docs/specs/01-spec-icm-generator-emission/01-tasks-icm-generator-emission.md` (task 1.7 disposition; task 1.12 proof artifact)
- `docs/specs/01-spec-icm-generator-emission/01-repin-and-halt-note.md` (§6 Phase 5 resolved; §7 the `gh workflow list --all` proof)
- `FORK-RESYNC.md`, `.fork-pin` (this repository)
- `.github/workflows/{ci,security,draco,examples-packages-smoke,real-tools}.yml` @ `fork/main`
- CI run `34714363286` — the dispatched 17-job green run that established `ci.yml` was healthy but push-dark
- Upstream: `ruvnet/metaharness` @ `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`
