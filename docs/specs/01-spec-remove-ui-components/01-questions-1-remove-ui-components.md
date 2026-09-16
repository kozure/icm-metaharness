# 01 Questions Round 1 — remove all UI components from icm-metaharness

Please answer each question below (select one or more options, or add your own notes). Feel free to add additional context under any question.

> **Why this round exists.** The request is small in words and large in blast radius. Assessment found that the UI is **entirely upstream-owned code** — and this fork has **never removed a single upstream file** (0 deletions vs pin `d5833dc`). So "remove the UI" is simultaneously a deletion task, a policy departure, a test-contract change, and a published-contract change. Those are materially different specs, and the choice of one inverts the non-goals and proof artifacts.

> **Context found during assessment** (evidence, not memory):
>
> - **The UI is upstream code, not fork code.** `apps/web-ui/` has **50 tracked files at pin `d5833dc` and 50 now — 0 fork-added, 0 fork-deleted**. Every file is upstream-owned.
> - **The fork has never deleted an upstream file.** `comm` against the pin returns **0** removed paths across the entire fork history. This request is unprecedented here.
> - **Deploy is already disabled.** Both `.github/workflows/pages.yml` and `pages-monitor.yml` carry fork headers: *"Fork disposition (task 1.7): DISABLED. GitHub Pages deploy; this fork does not deploy Pages."* So no live deployment needs shutting off.
> - **A build script writes INTO the UI tree.** `packages/create-agent-harness/scripts/gen-templates.mjs:24,478` writes `apps/web-ui/src/generated/catalog.ts` (1313 LOC) as a generated artifact. Deleting the UI without handling this leaves the generator emitting into a dead path.
> - **A published type literal names the UI.** `packages/create-agent-harness/src/manifest.ts:16` declares `surface?: 'cli' | 'web-ui'`, documented as telling operators which surface to debug. Several files and tests reason about `surface='web-ui'`.
> - **Three test files assert UI presence, at least two without escape.** `sbom.test.ts:134-147` hard-fails if `jszip`/`react` are absent from the SBOM (they come from the UI lockfile, no `existsSync` guard). `path-handling.test.ts:95-110` asserts `SCAN_DIRS` includes `'apps'`. `audit-deps.test.ts:70,96` **does** guard with `existsSync` and will self-skip.
> - **Six root scripts reference the UI.** `path-guard.mjs`, `sbom.mjs`, `audit-deps.mjs` (all use `apps/web-ui` as the canonical *non-workspace* scan target), plus `check-runner-coverage.mjs`, `pareto-from-firestore.mjs`, `nightly-sota-review.mjs` (last two read `apps/web-ui/public/assets/swe-pareto.json`).
> - **22 ADRs reference the UI**, incl. ADR-020/021/022/023/024 (the Studio's design set), ADR-027 (CLI+Web UI integration), ADR-171 (webui darwin config), ADR-179 (cost-pareto leaderboard).
> - **The root README sells the UI as the headline.** `README.md:7,11,17` link the upstream-hosted Studio (`https://ruvnet.github.io/metaharness/`) and embed `docs/web-ui/screenshot-desktop.png`; `docs/web-ui/` holds **2.8 MB** of screenshots referenced from README, ADR-024, and the UI README.
> - **Preflight/release do NOT gate on the UI** — no reference in `preflight.mjs`, `release.mjs`, or `publish-dryrun.mjs`.

---

## 1. Scope — what exactly counts as a "UI component"?

"All UI components" resolves to several distinct artifact classes. They are independently removable and have different owners.

- [ ] (A) **The Studio SPA only.** `apps/web-ui/` — 50 files / ~6,200 LOC: the React app, its 10 `.tsx` components, the 11-file browser generator, e2e specs, build config, its own lockfile.
- [ ] (B) **The SPA + its supporting surfaces.** `(A)` plus `docs/web-ui/` (2.8 MB screenshots), the `pages.yml` / `pages-monitor.yml` workflows, and the root README's Studio links/badges.
- [ ] (C) **Everything UI-shaped repo-wide.** `(B)` plus `packages/arc-agi-3-chatgpt/public/arc-widget.html` (228 LOC, a self-contained HTML widget) and `__tests__/browser-smoke/fixture.html` + its README.
- [ ] (D) **The UI *capability*, not the files.** Remove the browser generator's logic and the `web-ui` surface concept wherever it appears (including `manifest.surface: 'web-ui'` and the generator's write into the UI tree), regardless of whether every file is deleted.
- [ ] (E) Other (describe).

**Recommended answer(s):** [(B)]

**Why these are recommended:**

- `(B)` matches the obvious reading of the request while capturing the surfaces that would otherwise be left dangling and broken — a deleted SPA with a README linking to it, or screenshots of a product that no longer exists, is an inconsistency a reviewer will flag.
- `(C)` risks over-reach: `arc-widget.html` and the browser-smoke fixture are **unrelated to the Studio** — one is a ChatGPT-side ARC-AGI-3 widget, the other is a test fixture that `README.md` describes as a manual browser check. Removing them is a different decision, and folding it in makes the spec's non-goals muddy.
- `(A)` is defensible if you want the most surgical change, but it leaves 2.8 MB of stale screenshots and README links pointing at a deleted product.
- `(D)` is the deeper read and is **required** if you want the repo to actually build clean — the generator writing into `apps/web-ui/src/generated/` must be addressed under *any* option, so `(D)` is partly unavoidable rather than purely optional. Selecting `(D)` makes that explicit and in-scope.

---

## 2. The deletion itself — this fork has never removed upstream code

ADR-279's whole pin design exists so fork deltas stay attributable to the fork. Deleting 50 upstream-owned files is the largest departure from that principle the fork would have ever made. How should the removal be expressed?

- [ ] (A) **Hard delete.** `git rm` the UI tree and every supporting file. Cleanest end state; the diff-vs-upstream becomes 50 deletions, and every future upstream resync must re-apply that deletion (or it comes back).
- [ ] (B) **Delete + record the deletion as policy.** `(A)`, plus an ADR stating that the fork permanently drops the UI and that upstream resyncs must not reinstate it, with the resync procedure (`FORK-RESYNC.md`) updated to enforce it.
- [ ] (C) **Delete locally, keep it out of the fork's published surface only.** e.g. remove from CI/build/publish but leave files in-tree, or keep them on a side branch.
- [ ] (D) **Unprefixed delete — remove the files and accept that upstream merge is no longer a goal** (which ADR-279 decision 1 was written to preserve).
- [ ] (E) Other (describe).

**Recommended answer(s):** [(B)]

**Why these are recommended:**

- `(B)` is the only option that keeps the fork's own discipline intact. ADR-279 chose the pin *specifically* so deltas are attributable; a silent 50-file deletion destroys exactly that property and the next person cannot tell intent from drift.
- `(B)` also closes the real operational risk in `(A)`: upstream resync would happily restore the UI, and without a recorded rule the deletion would silently regress — the kind of thing that is invisible until someone diffs.
- `(C)` is the most conservative and preserves merge-friendliness, but it leaves the repo in a state where the code exists and the tooling pretends it doesn't — which tends to rot. Choose it only if you want the option to restore the UI cheaply.
- `(D)` is honest about the tradeoff and may be correct, but **say so explicitly** — it devalues `FORK-BASELINE.md`, `.fork-pin`, and ADR-279 decisions 1–3, and the spec should then include formally retiring or demoting them rather than leaving dead ceremony behind.

---

## 3. The two couplings that must be cut — generator write path and the `web-ui` surface type

These are the cases where "delete the folder" is insufficient; the code *behaves* around the UI.

- [ ] (A) **Cut both.** Stop `gen-templates.mjs` writing `apps/web-ui/src/generated/catalog.ts`, and narrow `manifest.surface` from `'cli' | 'web-ui'` to `'cli'` only. Fully removes the UI concept from code.
- [ ] (B) **Cut the write path, keep the type.** Stop generating into the UI tree, but leave `surface?: 'cli' | 'web-ui'` as-is so already-generated manifests stay readable and the field remains forward-compatible.
- [ ] (C) **Cut both, but treat `surface` as a published contract.** Narrow it only with a documented compatibility note, since `manifest.meta.surface` is read by `diag.ts` / `subcommands.ts` and is part of the manifest schema consumers can inspect.
- [ ] (D) Other (describe).

**Recommended answer(s):** [(C)]

**Why these are recommended:**

- The generator write **should be cut regardless** — leaving it means every `gen-templates` run writes into a directory that no longer exists (or recreates a phantom tree), which is a latent failure. Under `(A)`/`(C)` this is explicit work; state it either way.
- `(C)` is preferred over `(A)` for the type because `surface` is a **recorded field in emitted artifacts**, not merely an internal enum. Manifests already written by the UI path may carry `'web-ui'`; silently narrowing the type makes those values unrepresentable and can break readers. A compatibility note costs one paragraph and prevents that.
- `(B)` is the lowest-risk option if you simply want the UI gone and are willing to leave a vestigial union member. Perfectly reasonable — but it does mean the repo still talks about a `web-ui` surface that cannot exist, which a future reader will find confusing unless the ADR explains it.

---

## 4. The test contract — what happens to the three tests that assert the UI exists?

- [ ] (A) **Update the tests to assert absence.** Invert them: SBOM must *not* contain UI-only deps, `path-guard` no longer needs `apps/`, extra-scan targets drop the UI. Deletion is guarded by tests, so a resync that restores the UI fails CI.
- [ ] (B) **Delete the UI-specific tests.** Remove the assertions that only existed to cover the UI, keep everything else.
- [ ] (C) **Relax to self-skip.** Make them conditional the way `audit-deps.test.ts` already is (`existsSync` guard → return early), so the suite passes whether or not the UI is present.
- [ ] (D) Other (describe).

**Recommended answer(s):** [(A)]

**Why these are recommended:**

- `(A)` turns the removal from a one-time edit into an **enforced property**, which is exactly the failure mode in question 2 — an upstream resync silently restoring 50 files. A test asserting absence makes that regression loud instead of invisible.
- `(A)` is also the smaller conceptual change than it looks: `sbom.test.ts:134-147` and `path-handling.test.ts:103-110` assert UI presence today, so they *must* change under any option; the only question is whether the new assertion is "absent" or "nothing".
- `(C)` is the weakest choice here: it makes the suite pass in both states, which means it can never catch a regression in either direction. Fine as a short-lived bridge, poor as a destination.
- `(B)` is acceptable and simplest if you consider the UI a temporary artifact rather than a property worth defending — but then the ADR is the only thing preventing silent restoration.

---

## 5. Capability loss — the UI does two things the CLI also does, and some it may not

Deleting the Studio removes the browser **Repo → Harness** importer (`generator/repo.ts`, 378 LOC) and the in-browser **Verify** panel (`generator/verify.ts`, 163 LOC). CLI counterparts exist (`analyze-repo.ts`, `validate.ts`).

- [ ] (A) **Accept the loss.** The CLI equivalents are the supported path; the UI was a convenience. No porting.
- [ ] (B) **Accept the loss, but verify parity first.** Confirm the CLI genuinely covers each capability before deleting, and record any gap in the spec (or an ADR) so it is a known, deliberate loss.
- [ ] (C) **Port a specific capability to the CLI** as part of this work (describe which).
- [ ] (D) Other (describe).

**Recommended answer(s):** [(B)]

**Why these are recommended:**

- `(B)` costs little and converts an assumption into a checked fact. The UI's importer and the CLI's `analyze-repo.ts` are *duplicated implementations* — `analyze-repo.ts:94` even says it "mirrors `apps/web-ui/src/generator/repo.ts`" — so parity is plausible but should be confirmed rather than assumed.
- `(B)` produces a better proof artifact: a short parity table is concrete evidence that removal loses nothing the repo still promises, which is the kind of thing a reviewer asks for.
- `(C)` is only warranted if the parity check in `(B)` finds a real gap you care about. Do not pre-commit to porting before knowing — that is how a removal spec becomes a feature spec.
- `(A)` is fine if you already know the CLI is strictly superior; just don't leave the parity question unanswered in the spec's Open Questions either.

---

## 6. Documentation, ADRs, and the repo's public story

The UI is the README's headline and has 22 ADRs plus 2.8 MB of screenshots.

- [ ] (A) **Full clean-up.** Supersede the UI ADRs with one new ADR recording the removal, delete `docs/web-ui/` screenshots, remove README Studio links/badges, and drop the two UI workflows entirely.
- [ ] (B) **Supersede the ADRs, keep the screenshots.** ADRs are historical record and `INDEX.md`'s convention is that ratified ADRs are amended by a follow-on ADR, never edited in place — but images can stay for the record.
- [ ] (C) **Minimal.** Remove the code and README links; leave ADRs and workflow files untouched (the workflows are already DISABLED, so they are inert).
- [ ] (D) Other (describe).

**Recommended answer(s):** [(B)] plus the README clean-up from `(A)`

**Why these are recommended:**

- `INDEX.md` states explicitly that *"a ratified ADR (`Status: Accepted`) is amended by a follow-on ADR (`Status: Supersedes ADR-NNN`) and never edited in place."* So the correct ADR action is **one new superseding ADR**, not editing 22 files — cheap, and consistent with the repo's own rule.
- The **README must change** under every option: `README.md:7,11,17` currently link a hosted Studio and embed a screenshot. If the UI is gone, leaving the headline pointing at it is the most visible inconsistency in the repo. This is not optional.
- Keeping screenshots `(B)` is a reasonable archival choice — they are historical documentation of a removed surface. Deleting them `(A)` is equally defensible and saves 2.8 MB. Either is fine; what matters is that the ADR says which.
- `(C)` is risky for the workflows: they are DISABLED today, but a *disabled* workflow referencing a deleted path is a trap for the next person, and `check-runner-coverage.mjs` reasons about `pages.yml` specifically (it uses `working-directory: apps/web-ui` as its example of a sub-project suite). Deleting them removes a stale special case.

---

## 7. Verification — how do we prove the UI is really gone?

- [ ] (A) **Tree + grep absence.** `git ls-files apps/web-ui` is empty, no repo-wide reference to `apps/web-ui` survives outside historical docs, and the full gate set still passes.
- [ ] (B) **`(A)` plus the repo's own gates.** Run `npm run build`, `npm test`, `npm run lint`, `node scripts/path-guard.mjs`, `node scripts/sbom.mjs`, `node scripts/healthcheck.mjs`, and the vertical-tour gate, all green on the post-removal tree.
- [ ] (C) **`(B)` plus a falsifiability check.** Deliberately reintroduce a UI file (or a stale reference) and confirm the new absence-asserting tests fail — proving the guard actually fires rather than merely passing.
- [ ] (D) Other (describe).

**Recommended answer(s):** [(C)]

**Why these are recommended:**

- The fork's established practice for new guards is to **falsify them by mutation** before committing — the ICM work did exactly this (three mutations, each producing the expected drift failure). `(C)` applies the repo's own standard rather than inventing a new one.
- `(B)` alone cannot distinguish "the guard works" from "the guard never runs", which is the specific risk for a suite whose UI tests used to be conditional.
- `(A)` alone is necessary but not sufficient — a clean tree with a broken build is not a finished removal, and the generator write path (question 3) means a green tree is quite possible while `gen-templates` still targets the dead directory.

---

**Anything else?** Add notes under any question. Free-form direction is welcome — in particular, it would help to know **why** you want the UI gone. A policy reason (this fork is CLI-only) points at `(B)` in question 2 and a permanent-removal ADR; a cost reason (maintenance drag) points at option `(C)` in question 2 and a restorable side branch. That single fact changes the spec's shape more than any other.
