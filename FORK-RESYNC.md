# Fork re-sync procedure

**This is a named manual procedure. Automation is deliberately out of scope**
(resolves Open Question 2: *manual procedure, documented*).

The fork is `kozure/icm-metaharness`. `main` is a clone of upstream
`ruvnet/metaharness` with **shared history**, so upstream commits are ancestors
and a re-sync is always a plain fast-forwardable `git merge` — never a rebase,
never a fresh clone.

---

## 1. The re-sync criterion

> **Re-sync when upstream has a commit whose published package version equals
> npm's current `latest` — and `.fork-pin` names a commit that does not.**

Not a tag. Upstream **publishes npm releases without cutting git tags**
(for example the currently pinned baseline is npm `0.4.16`, yet the newest
upstream tag is `v0.4.5`). A tag-based criterion would therefore never fire.
The version is the truth; the tag is not.

The published package is **`packages/create-agent-harness`** (npm name
`metaharness`). Its `version` field is the one that matters.

### What is *not* a re-sync trigger

**Upstream `main` sitting ahead of the pin is not itself a trigger.** Upstream
`main` routinely carries unreleased dream-cycle / research / docs commits whose
package version is unchanged (this is exactly how the previous pin went stale:
`42f568b` → `d5833dc`, +4/−0 commits, package version `0.4.16` at both ends).
Re-sync only when the *version* moves. Otherwise stay pinned.

---

## 2. Procedure

Run from the repo root.

```bash
# 0. Current pin, and what it claims.
cat .fork-pin

# 1. Fetch upstream. (upstream push URL is DISABLED; this only fetches.)
git fetch upstream

# 2. npm's current latest for the published package.
NPM_LATEST=$(npm view metaharness version)
echo "npm latest: $NPM_LATEST"

# 3. Find the newest upstream commit whose package.json version == $NPM_LATEST.
#    Walk upstream/main newest-first; first match wins.
CANDIDATE=""
for sha in $(git rev-list upstream/main); do
  v=$(git show "$sha:packages/create-agent-harness/package.json" 2>/dev/null \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch(e){console.log("")}})')
  if [ "$v" = "$NPM_LATEST" ]; then CANDIDATE="$sha"; break; fi
done
echo "candidate: $CANDIDATE"

# 4. Decide.
if [ "$CANDIDATE" = "$(cat .fork-pin)" ] || [ -z "$CANDIDATE" ]; then
  echo "No re-sync: pin already matches the current npm latest (or none found)."
  exit 0
fi

# 5. Re-sync. Merge the candidate into main.
git checkout main
git merge "$CANDIDATE" --ff-only || git merge "$CANDIDATE" -m "fork: re-sync to $CANDIDATE (npm $NPM_LATEST)"

# 6. Re-pin.
printf '%s\n' "$CANDIDATE" > .fork-pin
git add .fork-pin
git commit -m "fork: re-pin to $CANDIDATE (npm $NPM_LATEST)"
git push origin main
```

Notes:

- Step 5 uses `--ff-only` first: with shared history the merge should
  fast-forward whenever the fork has no local commits ahead. If it does not
  fast-forward, the fallback merge commit is expected and correct.
- **Never** `git push --tags` and **never** `git push --all`. Upstream's
  `v*.*.*` tags exist in this clone; pushing them would fire `publish.yml`.
  Push `main` by explicit name.
- After re-syncing, re-check the workflow disposition: a re-sync may add new
  upstream workflows, which arrive **active** and unregistered until a push
  touches their path. See §4.

---

## 3. Post-re-sync verification

```bash
echo "pin:        $(cat .fork-pin)"
echo "fork head:  $(git log -1 --format=%H main)"
echo "merge-base: $(git merge-base main upstream/main)"   # must equal the pin
git rev-list --left-right --count main...upstream/main    # expect "N  0"
```

`merge-base main upstream/main` must equal `.fork-pin` immediately after a
re-sync.

---

## 4. Re-verify the Actions disposition after every re-sync

Task 1.7's disposition must hold after a re-sync. New upstream workflows arrive
**active** (and unregistered until a push touches them), so re-run:

```bash
gh api repos/kozure/icm-metaharness/actions/workflows \
  --jq '.workflows[] | "\(.path)  [\(.state)]"'
```

Expected steady state:

| workflow | state |
|---|---|
| `ci.yml` | active |
| `security.yml` | active |
| `real-tools.yml` | active |
| `examples-packages-smoke.yml` | active |
| `draco.yml` | active (**scheduled** cadence must stay removed) |
| `publish.yml` | disabled_manually |
| `pages.yml` | disabled_manually |
| `proxy-pin-drift.yml` | disabled_manually |
| `published-smoke.yml` | disabled_manually |
| `pages-monitor.yml` | disabled_manually |

If a re-sync reintroduces a `schedule:` block into `draco.yml`, remove it again
(it spends real OpenRouter credits). Each workflow file carries a disposition
header block at the top (`Fork disposition (task 1.7)`) recording its intended
state — that block is the durable ledger, and it survives even while repo-wide
Actions is disabled.

---

## 5. Re-verify the trigger lists after every re-sync

**ADR-283 (supersedes ADR-280).** ADR-280 existed because the fork's only
long-lived branch was named `fork/main`, while upstream's workflows all trigger
on `branches: [main]`. The fork therefore had to *widen* every trigger list to
`[main, fork/main]` — a fork-local divergence — and that divergence created a
hazard: **a re-sync touching an `on:` block would conflict and could silently
revert the fork to upstream's `[main]`, at which point CI goes dark on every
push *without any error*.**

That hazard is now **retired**. The fork's branch was renamed to `main`, so the
trigger lists match upstream's exactly and there is no fork-local divergence
left to lose in a conflict. Expected steady state — **identical to upstream**:

| workflow | `push` | `pull_request` |
|---|---|---|
| `ci.yml` | `[main]` | `[main]` |
| `security.yml` | `[main]` | `[main]` |
| `draco.yml` | `[main]` (+ bench paths) | `[main]` (+ bench paths) |
| `examples-packages-smoke.yml` | `[main]` (+ examples paths) | `[main]` (+ examples paths) |
| `real-tools.yml` | `[main]` | `[main]` |

One deliberate divergence **remains**, and it is a trigger *block*, not a branch
name: `real-tools.yml` carries a `push` trigger, where upstream is PR-only. Its
original purpose was to stay inert on upstream-bound PRs — a distinction that
was expressible only while the fork's branch had its own name. That purpose is
moot here: this repository is **standalone** (`gh api repos/kozure/icm-metaharness
--jq .fork` → `false`, `.parent` → `null`), so no upstream-bound PRs exist and
the `push` trigger can no longer cross into anything it should not. On a re-sync,
**keep the `push` block**; if upstream ever drops or reshapes it, resolve toward
keeping it.

Verify after a re-sync:

```bash
# Every one of these must read branches: [main].
for f in ci.yml security.yml draco.yml examples-packages-smoke.yml real-tools.yml; do
  printf '%-32s push=%s\n' "$f" \
    "$(sed -n '/^on:/,/^permissions:/p' .github/workflows/$f | grep -m1 'branches:' | tr -d ' ')"
done
```

Then confirm the gate is actually live — the first push after a re-sync must
produce a run **without** a manual dispatch:

```bash
gh run list --repo kozure/icm-metaharness -L 5
```

Note the ordering consequence: push the re-sync by explicit name
(`git push origin main`), and since that push touches the workflows, the
`ci.yml` run it triggers is itself the verification.

