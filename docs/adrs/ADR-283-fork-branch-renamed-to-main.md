# ADR-283: The fork's branch is renamed `fork/main` → `main`

- **Status**: Accepted — implemented and verified live (rename performed locally and on `origin`; `kozure/icm-metaharness` default branch is `main`; `CI` + `Security` triggered on the rename push, runs `34818086425` / `34818086434`).
- **Date**: 2026-09-14
- **Deciders**: Chris (kozure) — fork owner; ruled 2026-09-14 ("Option 1", after the rename-vs-alias options were presented).
- **Tags**: fork, git, branching, ci, github-actions, upstream-drift, process
- **Supersedes**: ADR-280 (fork CI triggers target `fork/main`)
- **Extends**: ADR-279 (fork design — pin policy, `--icm` opt-in, `CLAUDE.md` ownership), §3 topology
- **Related**: `FORK-RESYNC.md`, `docs/FORK-BASELINE.md`, `.fork-pin`, upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: development of the fork's five units completed; ADR-280's own Consequences already named the rename as the clean resolution to the trigger-list divergence it had to accept.

---

## Context

ADR-279 §3 (task 1.3) created the fork as a clone-with-shared-history carrying **exactly one long-lived branch, `fork/main`** — a name chosen to avoid colliding with upstream's `main` in a shared-history clone. At the repo root, `.fork-pin` names the upstream baseline, and every verification in `FORK-RESYNC.md` compares against `fork/main`.

That name was never free of cost. ADR-280 records the largest consequence: because upstream's workflows all trigger on `branches: [main]` and `fork/main` satisfies none of them, **every inherited gate was dark on the fork** — a push ran no CI, including the re-sync merge most likely to break the fork. ADR-280 fixed that by widening five trigger lists to `[main, fork/main]`, and explicitly accepted the price:

> **Five workflow files now diverge from upstream.** Each re-sync that touches an `on:` block conflicts on one line per workflow.

ADR-280 §Consequences also named the way out:

> The re-sync procedure gains a step … The inline comments are the mechanism that makes this hard to miss.

Both ADR-279 and ADR-280 treat the awkward name as an accepted cost of the clone topology rather than a defect. With development finished, the owner asked for a **true `main` branch**, which forces the trade to be re-examined.

### What was measured before deciding

- **The repository is not a GitHub fork.** `gh api repos/kozure/icm-metaharness` → `{"fork": false, "parent": null}`. It is a **standalone public repository** that merely shares history with upstream. Consequences: there is no "Sync fork" button, no fork-network PR semantics, and — critically — `origin` owns its own default branch outright.
- **`origin` had exactly one branch**, `fork/main` @ `118130d`, and it was the default. No remote `main` existed to conflict with.
- **A local `main` did exist**, at `d5833dc` (= `.fork-pin`), tracking `upstream/main`, holding **0 commits** of its own. It is the upstream mirror described in ADR-280's Context, never pushed.
- **The name was load-bearing in 6 trigger lists and 10 tracked files** (`FORK-RESYNC.md` ×20, `ADR-280` ×39, `ADR-279`, `FORK-BASELINE.md`, `INDEX.md`).
- **No code or test depended on the name.** ADR-280's Test Contract proposed a workflow-lint test asserting `fork/main` appears in every trigger list, but recorded it as **NOT YET WRITTEN** — and it was never written, so the rename breaks no test.

Two options were put to the owner (2026-09-14):

- **1 — Rename `fork/main` → `main`**, retiring the old name; trigger lists revert to upstream's exact `[main]`, which retires ADR-280's divergence *and* the re-sync conflict hazard it created. Cost: 10 files plus a superseding ADR.
- **2 — Add `main` as a second name** for the same commit; zero churn and trivially reversible, but leaves two names for one line and keeps the ADR-280 hazard permanently.

The owner chose **1**.

## Decision

### 1. `fork/main` is renamed to `main`; the name is retired, not aliased

Executed in this order, each step verified before the next:

```bash
git branch -m main upstream-mirror   # free the name; keep the mirror, renamed
git branch -m fork/main main         # the fork branch becomes main
git push -u origin main              # explicit name — never --all / --tags
gh repo edit kozure/icm-metaharness --default-branch main
git push origin --delete fork/main   # single explicit ref
git remote prune origin
```

The local upstream mirror is **kept**, renamed `upstream-mirror`, still tracking `upstream/main`. It is renamed rather than deleted because `FORK-RESYNC.md`'s verification compares the fork against `upstream/main`, and the local mirror is the convenient handle; deleting it would have been gratuitous.

The rename preserves history exactly — no force-push, no rewrite, no new commit. `main` and the pre-rename `fork/main` are the same object (`118130d`) before and after.

### 2. Trigger lists revert to upstream's exact form

The five lists edited by ADR-280 return to bare `[main]` on both `push` and `pull_request`, and each file's ADR-280 comment block is replaced by one naming ADR-283.

This is the substantive win, and it is larger than cosmetics: **ADR-280's re-sync conflict hazard is retired, not managed.** ADR-280 had to warn that a re-sync touching an `on:` block could silently revert the fork to upstream's `[main]` and turn CI dark with no error, and it mitigated that with inline comments and a documented resolution rule. With the fork's branch *named* `main`, the fork's lists and upstream's are **byte-identical**, so there is no fork-local divergence left to lose in a conflict. A whole procedural step and a whole class of silent failure disappear.

### 3. One deliberate divergence remains — and is kept

`real-tools.yml` carries a `push` trigger where upstream is PR-only (ADR-280 Decision 2). That trigger is **kept**, not reverted.

ADR-280 scoped it to `[fork/main]` so the gate "stays inert on upstream-bound PRs it was not designed to run for." With the branch named `main`, that distinction is no longer expressible by branch name — and it is **moot**: because this repository is standalone (`isFork: false`), no upstream-bound PRs exist for the trigger to reach. `FORK-RESYNC.md` §5 is updated to say so and to resolve any re-sync conflict toward keeping the `push` block.

### 4. This supersedes ADR-280 rather than amending it in place

`INDEX.md`'s convention is explicit: *"A ratified ADR (`Status: Accepted`) is amended by a follow-on ADR (`Status: Supersedes ADR-NNN`) and never edited in place."* ADR-280 is `Accepted`, so it is left as the accurate historical record of why the widening existed and what it caught, and this ADR records its supersession. ADR-279 §3's topology is likewise left intact and extended here, not rewritten.

## Consequences

- **The fork's branch is a true `main`** and the repository's default branch. `gh api repos/kozure/icm-metaharness --jq .default_branch` → `main`.
- **The re-sync conflict hazard is gone.** The five trigger lists match upstream byte-for-byte, so a re-sync touching an `on:` block no longer conflicts on the branch list at all. Only `real-tools.yml`'s `push` block remains fork-local, and it is documented.
- **`FORK-RESYNC.md` §5 shrinks.** "Keep `fork/main` in the list" — a rule that had to be remembered at every merge — becomes "the lists match upstream; verify they still read `[main]`."
- **The name no longer needs explaining.** ADR-280's Context had to open by justifying why the trunk was not called `main`; new readers are not required to learn a local naming quirk.
- **The local `main` mirror is renamed `upstream-mirror`.** It remains available for the re-sync comparison; any muscle-memory `git checkout main` that previously meant *the mirror* now means *the fork*. This is a rename of intent as well as of ref, and it is deliberate.
- **The default-branch change is visible in the repo UI.** Anyone with a clone sees `origin/HEAD → main`; a stale clone will show `origin/fork/main` until `git remote prune origin`.
- **The rename push is itself the verification.** It touched the workflows, so `ci.yml` fired on `main` — run `34818086425` — without a manual dispatch, which is the same self-verifying property `FORK-RESYNC.md` relies on.
- **`fork/main` is gone from `origin`.** Any external reference to the old ref — a bookmark, a badge URL, a saved compare link — breaks. No such reference exists inside the repository (the surviving `fork/main` strings in the tree are historical prose: "renamed from `fork/main`").

## Alternatives Considered

- **Option 2 — add `main` as an alias and keep `fork/main`.** Rejected by the owner. It costs three commands and is trivially reversible, but leaves two names for one line indefinitely and preserves ADR-280's divergence *and* its conflict hazard. It also fails the actual request: an alias is not a true `main`, and `fork/main` would remain the default.
- **Keep the name and simply finish the work.** Rejected, though it was the status quo and cost nothing today. ADR-280 already recorded the divergence as an accepted cost; the owner's request is precisely the signal that the cost is no longer worth carrying once development is done.
- **Rename the branch and also revert `real-tools.yml` to PR-only.** Rejected: that would silently un-guard every push on `main`, and its ADR-280 rationale (no PRs are opened against the fork's branch) is unaffected by the rename.
- **Delete the local upstream mirror instead of renaming it.** Rejected as gratuitous: the mirror costs nothing, is referenced by the re-sync procedure's `upstream/main` comparison, and deleting a ref to free a name that a rename frees just as well is a needless loss.
- **Force-push `main` over a `main` that already existed on `origin`.** Not applicable — but recorded because it is the trap this topology avoids: `origin` had no `main` at all, so the rename was a fast-forwardable branch creation with no rewrite. A force-push was never needed and is forbidden by this repo's conventions.
- **Create `main` as a fresh branch at `118130d` and leave `fork/main` in place as a stale pointer.** Rejected: two refs at the same commit invite divergence, and the deletion is single-ref and explicit, so there is no reason to leave a decoy.

## Test Contract

**Status (2026-09-14): verified — the rename is live and the gate is confirmed firing on the new branch, with no force-push and no history rewrite anywhere.**

Verified by direct measurement:

- **`origin` has exactly one branch, and it is `main`, at the unchanged commit.** `git ls-remote --heads origin` → `118130df95d88d0575ec9b0246f82e16f46c4985 refs/heads/main`; no `refs/heads/fork/main`. The commit is identical to the pre-rename `fork/main`, so the rename rewrote nothing.
- **`main` is the repository's default branch.** `gh api repos/kozure/icm-metaharness --jq '{default_branch, fork}'` → `{"default_branch":"main","fork":false}`. Read back **after** the change, not assumed from `gh repo edit`'s exit code.
- **The rename push fired CI on the new branch, with no manual dispatch.** `gh run list --repo kozure/icm-metaharness` shows `CI` (run `34818086425`) and `Security` (run `34818086434`) both `event: push`, `branch: main`. This is the self-verifying step `FORK-RESYNC.md` §5 relies on.
- **The trigger lists resolve to `[main]` in all five files.** Asserted by reading each `on:` block, not by trusting the `sed` edits:

  | file | `push` | `pull_request` |
  |---|---|---|
  | `ci.yml` | `[main]` | `[main]` |
  | `security.yml` | `[main]` | `[main]` |
  | `draco.yml` | `[main]` + bench paths | `[main]` + bench paths |
  | `examples-packages-smoke.yml` | `[main]` + examples paths | `[main]` + examples paths |
  | `real-tools.yml` | `[main]` | `[main]` |

- **`fork/main` survives only as historical prose.** Every remaining occurrence is inside a sentence that names the rename (e.g. "renamed from `fork/main`"), plus the superseded ADR-280 and its `INDEX.md` row, which are deliberately left as the historical record.
- **No force-push and no history rewrite was used.** The sequence was `branch -m` ×2, `push -u origin main`, `gh repo edit --default-branch`, `push origin --delete fork/main`, `remote prune`. `git push --all` and `git push --tags` were explicitly avoided (ADR-279: upstream's `v*.*.*` tags exist in the clone and `publish.yml` triggers on tags).
- **The working tree was clean before the change and the repo is intact after.** `git status --porcelain` empty pre-flight; `git worktree list` back to a single worktree; HEAD on `main`.

Proposed regression test (repo-level workflow lint — **NOT YET WRITTEN**, and inherited as an open item from ADR-280's Test Contract, which proposed the same lint against the old name):

- **Every trigger list that must fire on the fork's trunk names `main`.** Read `.github/workflows/*.yml` and assert that `ci.yml`, `security.yml`, `draco.yml`, `examples-packages-smoke.yml`, and `real-tools.yml` each name `main` in at least one trigger branch filter. This is the same guard ADR-280 wanted, retargeted: with the lists now byte-identical to upstream's, it stops being a *fork-divergence* check and becomes a plain "the trunk still triggers CI" check — which no longer breaks on re-sync.
- **`real-tools.yml` keeps its `push` trigger.** Assert the `push` block exists and reads `branches: [main]`, pinning Decision 3 so a re-sync cannot silently return it to PR-only and un-guard pushes.
- **No workflow trigger list names a retired branch.** Assert `fork/main` appears in no `branches:` list anywhere under `.github/workflows/`, so a future re-sync cannot reintroduce the old name and re-darken a gate.

## References

- `docs/adrs/ADR-280-fork-ci-triggers-on-fork-main.md` (superseded by this ADR; records the widening this retires, and the Windows-only `icm-optin.test.ts` defect + inherited `audit-deps-aggregate` failure the live gate surfaced)
- `docs/adrs/ADR-279-fork-pin-policy-icm-optin-claudemd-ownership.md` (§1 pin policy, §3 topology, §Consequences "New upstream workflows arrive active")
- `docs/FORK-BASELINE.md` (CI baseline section; now carries the ADR-283 supersession note)
- `FORK-RESYNC.md` (§2 procedure, §3 verification, §5 trigger-list re-verification — all retargeted to `main`)
- `.fork-pin`, `.github/workflows/{ci,security,draco,examples-packages-smoke,real-tools}.yml`
- Push-triggered `CI` on `main`: run `34818086425`; `Security`: run `34818086434` (both `2026-09-14T07:29:23Z`, commit `118130d`)
- Upstream: `ruvnet/metaharness` @ `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`
