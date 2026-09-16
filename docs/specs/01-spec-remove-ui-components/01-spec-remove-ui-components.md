# 01-spec-remove-ui-components.md

## Introduction/Overview

This repository is a fork pinned to upstream commit `d5833dc` that carries a deliberate, attributable set of divergences. Among the upstream code it inherits is a complete browser-based UI: the **Agent Harness Studio** single-page app (`apps/web-ui/`), a ChatGPT-side ARC widget, a manual browser-smoke fixture, two GitHub Pages workflows, and roughly 2.8 MB of screenshots — plus the code that *behaves* around that UI (a template generator that writes into the UI tree, a manifest field that names the UI as a source "surface", and an MCP capability declaration for the widget).

The fork does not want a UI. This specification defines the complete, verifiable removal of every UI component and every UI capability from the fork, the inversion of the tests that currently assert the UI exists so that its reappearance fails CI, and the recorded policy that keeps a future upstream re-sync from silently restoring it.

The primary goal: **after this work, nothing in the repository builds, packages, documents, or claims a user interface — and the repository's own gates prove it.**

## Goals

- Remove all UI artifacts (the Studio SPA, its screenshots, the browser-smoke fixture, the ARC widget, and both Pages workflows) — **60 tracked files** in total — from the fork.
- Remove the UI *capability* from surviving code: no generator writes into a UI tree, no manifest can declare a `web-ui` surface, and no MCP capability declaration or tool advertises a rendered UI.
- Invert the **4 tests that currently hard-fail** on UI absence into tests that assert UI absence, so a re-sync that restores the UI goes red rather than sliding in.
- Record the removal as explicit fork policy in a new superseding ADR and enforce it in `FORK-RESYNC.md`, so the intent is machine- and human-checkable at the next re-sync.
- Leave the surviving repository green: `npm run build`, `npm test`, `npm run lint`, `path-guard`, `sbom`, `healthcheck`, and the vertical-tour gate all pass on the post-removal tree.

## User Stories

- **As the fork's maintainer**, I want the UI removed from the fork entirely, so that the fork carries only the surface I actually support and the CLI is the single, honest entry point.
- **As the fork's maintainer**, I want the removal recorded as policy and enforced by `FORK-RESYNC.md`, so that the next upstream re-sync cannot silently restore 50 files I deliberately dropped.
- **As the fork's maintainer**, I want the tests that assert the UI exists inverted into tests that assert it is absent, so that the guard is mechanical and a regression fails CI instead of surprising me in a diff.
- **As an operator or auditor reading this repository**, I want the README, user guides, and package composition to stop advertising a UI that cannot exist, so that what the repository promises matches what it contains.
- **As a future contributor**, I want one ADR that explains the removal and its consequences, so that I do not have to reverse-engineer intent from 60 deletions.

## Demoable Units of Work

### Unit 1: Stop the code from behaving around the UI

**Purpose:** Sever the couplings where surviving code *acts on* the UI. This must land before or with the deletion, because leaving any of them makes the removal a latent failure rather than a complete one.

**Functional Requirements:**

- The system shall stop generating `apps/web-ui/src/generated/catalog.ts`; `packages/create-agent-harness/scripts/gen-templates.mjs` shall no longer compute or write into a UI path (currently `uiGenDir` at line 24, write + log at lines 478/354).
- The system shall narrow the manifest surface type: `packages/create-agent-harness/src/manifest.ts` shall declare `surface?: 'cli'` (currently `'cli' | 'web-ui'` at line 16), and the stale comment at `index.ts:891` describing a "web-UI port" shall be removed.
- The system shall no longer register an MCP App resource for the ARC widget: `registerArcWidgetResource` shall be removed from `packages/arc-agi-3-chatgpt/src/server.ts` (call site line 350) and the `ui://metaharness/arc-agi-3/canvas` entry shall be removed from the tracked declaration `packages/arc-agi-3-chatgpt/.harness/mcp-capabilities.json` (lines 17–18).
- The system shall keep `arc_render` functional without a rendered surface: the tool shall continue to return authoritative JSON in `structuredContent` and shall no longer link an MCP Apps resource via `registerAppTool` (`tools.ts:586`), reverting to the plain tool registration used by its sibling `arc_*` tools.
- The system shall remove the now-unused widget plumbing: `packages/arc-agi-3-chatgpt/src/resource.ts` (43 LOC, the widget's resource + loader) and the `widgetHtml` option threaded through `server.ts:329,376,493` and `types.ts:108`.
- The system shall remove the `@modelcontextprotocol/ext-apps` dependency from `packages/arc-agi-3-chatgpt/package.json` **if and only if** no remaining import exists (today only `resource.ts:6` and `tools.ts:5` use it).

**Proof Artifacts:**

- CLI: `node packages/create-agent-harness/scripts/gen-templates.mjs` (or its `npm` entry point) runs and writes **no** path under `apps/`, and its log does not mention `apps/web-ui` — demonstrates the generator no longer targets a dead tree.
- CLI: `grep -rn "web-ui" packages/create-agent-harness/src/manifest.ts` returns no type-literal match — demonstrates the surface union is narrowed.
- CLI: `node -e` against the **built** `packages/arc-agi-3-chatgpt` server asserts the registered tool list equals the pre-removal baseline **minus zero entries** (i.e. `arc_render` is still registered), that no `ui://metaharness/arc-agi-3/canvas` resource is registered, and that `arc_render`'s result still carries authoritative JSON in `structuredContent` — demonstrates the tool survives while its visual surface does not. Concrete failing condition: a tool-list diff of anything other than empty, or any registered `ui://` resource, fails this proof.
- Test: the ARC package's own test suite passes after the widget removal — demonstrates nothing else depended on the resource.

### Unit 2: Delete the UI artifacts

**Purpose:** Remove the artifacts themselves — the SPA, its record, its workflow wiring, and the two non-Studio UI-shaped surfaces selected in scope — and retire the root scripts that existed to scan them.

**Functional Requirements:**

- The system shall remove the Studio SPA: all **50** tracked files under `apps/web-ui/` (the React app, its 10 `.tsx` components, the 11-file browser generator, e2e specs, build config, and its own `package-lock.json`).
- The system shall remove the UI's visual record: all **5** tracked files under `docs/web-ui/` (2.8 MB of screenshots referenced by the root README and ADR-024).
- The system shall remove the two UI-shaped non-Studio surfaces: `packages/arc-agi-3-chatgpt/public/arc-widget.html` (228 LOC) and `__tests__/browser-smoke/` (2 files: `README.md`, `fixture.html`).
- The system shall delete both GitHub Pages workflows: `.github/workflows/pages.yml` and `.github/workflows/pages-monitor.yml`.
- The system shall retire the UI from the root scan scripts, which today use `apps/web-ui` as their canonical non-workspace target: `scripts/path-guard.mjs:32` (`SCAN_DIRS`), `scripts/sbom.mjs:61` (`EXTRA_LOCK_DIRS`), `scripts/audit-deps.mjs:63` (`known`), and the `pages.yml`/`apps/web-ui` special case in `scripts/check-runner-coverage.mjs:104-109`.
- The system shall remove the dead Studio probe and its callers, which point at an upstream-hosted URL this fork does not deploy: the `pages()` check and `STUDIO_URL` in `scripts/healthcheck.mjs` (lines 35, 295–320), the `--probe-pages` step in `scripts/preflight.mjs:149-160`, and the `--probe-pages` argument in `scripts/release.mjs:117-118`.
- The system shall relocate rather than delete the one non-UI data asset that lives inside the UI tree: `apps/web-ui/public/assets/swe-pareto.json` (28 KB) shall move to `docs/research/` and its two root consumers (`scripts/nightly-sota-review.mjs:33,291`, `scripts/pareto-from-firestore.mjs:16`) shall be repointed.
- The system shall remove the `apps/` top-level directory entirely, since `apps/web-ui` is its only content.

**Proof Artifacts:**

- CLI: `git ls-files apps docs/web-ui __tests__/browser-smoke packages/arc-agi-3-chatgpt/public/arc-widget.html` prints **zero paths** — demonstrates the artifacts are gone, not merely untracked.
- CLI: `ls apps .github/workflows/` shows no `apps/` directory and neither `pages.yml` nor `pages-monitor.yml` — demonstrates the top-level surface and workflow wiring are clean.
- CLI: `git diff --stat d5833dc..HEAD -- apps/web-ui` reports 50 deletions and 0 additions — demonstrates the fork's delta versus pin is an explicit, attributable removal.
- CLI: `git ls-files docs/research/swe-pareto.json` returns the relocated asset and both root scripts resolve it — demonstrates the research data survived the removal of its former host directory.
- CLI: `node scripts/path-guard.mjs` prints `clean (scanned packages, crates, scripts …)` with `apps` no longer in the list, and exits 0 — demonstrates the scanner tolerates the shrunken directory set.
- CLI: `grep -lniE "apps/|pages" .github/workflows/*.yml` returns **zero** surviving workflow files — demonstrates no remaining workflow references the deleted tree or either deleted workflow. (Verified today: only the two doomed files match, at 22 and 7 hits; all 8 surviving workflows score 0. This proof locks that in.)

### Unit 3: Invert the test contract to assert absence

**Purpose:** Convert the tests that currently assert the UI exists into tests that assert it does not, so the removal is enforced property rather than a one-time edit.

**Functional Requirements:**

- The system shall invert `__tests__/path-handling.test.ts:95-112` so `SCAN_DIRS` is asserted **not** to include `'apps'`, and the guard is asserted to run green on the live repo.
- The system shall invert `__tests__/sbom.test.ts:134-147` so the SBOM is asserted **not** to contain the UI-only packages (`jszip`, `react`), replacing the two presence assertions.
- The system shall invert `__tests__/workflows.test.ts:97-135` so the absence of `pages.yml` and `pages-monitor.yml` is asserted, replacing the four assertions that currently read them.
- The system shall invert `packages/arc-agi-3-chatgpt/__tests__/package.test.ts:38` so the packaged tarball is asserted **not** to contain `public/arc-widget.html`, and to still contain the `.harness/` policy files.
- The system shall invert `__tests__/audit-deps.test.ts:68-96` so the extra-scan discovery is asserted to find **no** UI target, replacing the two tests that assert `apps/web-ui` is discovered and audited.
- The system shall add at least one test that asserts the removal's central invariant directly: no tracked path matches a UI artifact pattern (`apps/web-ui/**`, `docs/web-ui/**`, `__tests__/browser-smoke/**`, `**/arc-widget.html`, `.github/workflows/pages*.yml`).
- Each inverted test shall be **falsifiable**: deliberately reintroducing the artifact or reference it guards against shall make that test fail.

**Proof Artifacts:**

- Test: the full suite passes on the post-removal tree (`npm test`) — demonstrates the new contract holds in the new state.
- Test: re-creating a single UI file (e.g. `apps/web-ui/package.json`) makes the new invariant test fail with a clear message; removing it restores green — demonstrates the guard actually fires rather than merely passing.
- Test: restoring `.github/workflows/pages.yml` fails the inverted `workflows.test.ts` assertions — demonstrates the workflow guard is mechanical.
- CLI: `npm test` output showing the previously hard-failing test names now passing in their inverted form — demonstrates each of the 4 hard-fail sites was addressed, not deleted.
- Test (required, named mutations): **three** mutation demonstrations, each run individually with the unmutated suite green before and after — (a) re-create `apps/web-ui/package.json` → the new invariant test fails; (b) restore `.github/workflows/pages.yml` → the inverted `workflows.test.ts` assertions fail; (c) restore the `'apps'` entry in `scripts/path-guard.mjs` `SCAN_DIRS` → the inverted `path-handling.test.ts` assertion fails. This matches the fork's existing ICM standard of three mutations and supersedes the weaker "≥ 2" phrasing in Success Metrics.
- CLI: the three mutations are reverted and `npm test` returns to fully green — demonstrates the guards are the only thing standing between the repo and silent UI restoration.

### Unit 4: Record the policy and scrub the repository's public story

**Purpose:** Make the removal a documented fork decision that survives re-sync, and stop the repository from advertising a UI it no longer has.

**Functional Requirements:**

- The system shall record the removal in a new ADR (**next free number: ADR-284**) with `Status: Accepted`, following the repository's supersede convention so the previously ratified UI ADRs are amended by reference rather than edited in place.
- The new ADR shall state, at minimum: the fork is CLI-only; the UI artifacts and capabilities are permanently removed; upstream re-syncs must not reinstate them; and the two consequences — narrowed `manifest.surface`, and the retired non-CLI capabilities.
- The system shall update `FORK-RESYNC.md` so the deletion is enforced at the next re-sync. Mechanically: in the workflow disposition table (~`FORK-RESYNC.md:131`, which already lists `pages.yml` and `pages-monitor.yml` as `disabled_manually`), the two entries change disposition from *disable* to **delete**, joined by a new `apps/` row; and a sentence is added to the existing "remove it again if reintroduced" paragraph (~`:136`) naming `pages.yml` / `pages-monitor.yml` / `apps/` alongside the `draco.yml` schedule precedent. That paragraph is already the durable ledger for fork dispositions, so the removal inherits its enforcement rather than needing a new mechanism.
- The system shall scrub UI references from **live documentation** — `README.md` (10 matching lines, including the headline Studio link at line 7 and the badge at line 11), `docs/USERGUIDE.md` (9), `docs/PRIME_AGENT_LOOP.md` (6), and `docs/dream-cycle/PROMPT.md` (1).
- The system shall **leave historical records intact**: `CHANGELOG.md`, the 16 `docs/dream-cycle/*gist*` files, and the ADR corpus (30 ADRs mention the Studio or `web-ui` in their content; 32 if filename matches are included) remain as records of what the repository once did.
- The system shall scope every repository-wide `web-ui` grep used as a proof artifact away from this spec's own files — `docs/specs/**` necessarily contains the word many times (this spec and the questions file), so a bare `grep -rn web-ui .` would report a false "live reference" hit. Use an explicit file list or an exclusion pathspec (`':(exclude)docs/specs'` / `grep -v docs/specs`).
- The system shall ensure the README's remaining badges and links resolve to artifacts that still exist (no broken screenshot embed, no link to a deleted product surface).

**Proof Artifacts:**

- File: `docs/adrs/ADR-284-*.md` exists with `Status: Accepted` and an explicit non-reinstatement clause — demonstrates the decision is recorded per repository convention.
- File: `FORK-RESYNC.md` contains the UI-removal enforcement step, visibly alongside the existing re-sync re-verification sections — demonstrates re-sync will not silently restore the UI.
- CLI: `grep -nE "studio|web-ui|ruvnet\.github\.io" README.md docs/USERGUIDE.md docs/PRIME_AGENT_LOOP.md docs/dream-cycle/PROMPT.md` returns no live-product references — demonstrates live docs no longer advertise the removed surface.
- CLI: `grep -rn "web-ui" docs/adrs/ | wc -l` is non-zero, and `CHANGELOG.md` still contains its 45 historical mentions — demonstrates history was preserved rather than rewritten.

## Non-Goals (Out of Scope)

1. **Porting UI-only capabilities to the CLI.** The removal accepts the loss of the two capabilities with no CLI twin — the in-browser `.zip` download (CLI-native equivalent: `npm pack`) and optional in-browser MiniLM embeddings via `@huggingface/transformers` (CLI uses keyword/archetype scoring). Parity is *verified and recorded*, not closed. Turning a removal into a feature is explicitly out of scope.
2. **Building any replacement interface.** No TUI, no CLI dashboard, no new web surface. The supported surface after this work is the existing CLI.
3. **Reverting the fork's other divergences.** The ICM/`--icm` work, the seam driver, the headless onboarding pass, and the ADR-280 security remediation are untouched.
4. **Upstreaming the removal.** The fork does not propose this change upstream, open a PR against upstream, or publish the removal in any form. The work stays on the fork's `main`.
5. **Rewriting history.** No ADR is edited in place, no `CHANGELOG.md` or dream-cycle gist is rewritten, and no force-push is used. The removal is a forward commit.
6. **Removing UI-shaped surfaces beyond the agreed scope.** Scope was explicitly settled to include the Studio SPA, its screenshots, the Pages workflows, the ARC widget, and the browser-smoke fixture. Anything else UI-adjacent found during implementation is reported, not removed.
7. **Fixing the pre-existing `cargo-audit` gap.** `scripts/audit-deps.mjs` reports `SKIP: cargo — cargo-audit not installed`. That is unrelated to this work and remains as-is.
8. **Non-UI UI-*language* cleanup.** Comments across `packages/` that mention `web-ui` only as historical rationale ("mirrors `apps/web-ui/src/generator/repo.ts`") are corrected where they would mislead, but a repo-wide prose audit is not in scope.

## Design Considerations

No specific design requirements identified. This work removes a user interface rather than creating one; no visual, layout, or interaction design is involved. The only "design" obligation is editorial consistency: the repository's public story (README, user guide) must stop describing a surface that no longer exists.

## Repository Standards

- **ADR convention (mandatory).** `docs/adrs/INDEX.md:358` states: *"A ratified ADR (`Status: Accepted`) is amended by a follow-on ADR (`Status: Supersedes ADR-NNN`) and never edited in place."* One new ADR (ADR-284); no in-place edits to the 30 ADRs that mention the UI.
- **Fork pin discipline (ADR-279).** ADR-279 exists so fork deltas stay attributable. This removal is the fork's first-ever deletion of upstream-owned files (verified: 0 upstream paths removed in all prior fork history), so it sets the precedent. The ADR and `FORK-RESYNC.md` entry are what keep it attributable rather than drifting.
- **Pin metadata.** `.fork-pin` holds `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`; `docs/FORK-BASELINE.md` and `FORK-RESYNC.md` (191 lines) are the baseline artifacts. A deletion of this size is a baseline change and must be reflected there.
- **Falsifiability standard.** New guards are proven by mutation before commit — the ICM work applied three mutations that each produced the expected failure with the unmutated run green. Unit 3 inherits this standard.
- **Test convention.** Vitest under `__tests__/` (root) and `packages/*/__tests__/`; root `npm test` fans out via workspaces (`npm run -ws --if-present test`) with a `pretest` build.
- **Gate set.** `npm run build` (`scripts/build-ordered.mjs`), `npm test`, `npm run lint` (`tsc --noEmit` per workspace), `node scripts/path-guard.mjs`, `node scripts/sbom.mjs`, `node scripts/audit-deps.mjs`, `node scripts/healthcheck.mjs`, `node examples/vertical-tour/vertical-tour.mjs`.
- **Commit convention.** Conventional-commit prefixes already in use in this fork (`fix(security):`, `docs(adr-279):`, `ci(fork):`). The removal should read as one or more scoped commits, not a single opaque drop.

## Technical Considerations

- **Deletion order matters.** Unit 1 (couplings) must land before or with Unit 2 (deletion): `gen-templates.mjs` writes into `apps/web-ui/src/generated/`, so deleting the tree first leaves a generator that recreates a phantom directory or fails.
- **`apps/web-ui` is not an npm workspace.** Root `package.json` declares `workspaces: ['packages/*']`, so the SPA sits outside workspace tooling and outside `scripts/build-ordered.mjs`. This is why removal is cleaner than it looks — but it is also why three root scripts name it explicitly as an *extra* scan target, and those names must be retired rather than left dangling.
- **The scan scripts tolerate an empty target list (verified).** `scripts/path-guard.mjs:115-118` guards each `SCAN_DIR` with a `statSync` try/catch, and both `sbom.mjs` and `audit-deps.mjs` `existsSync`-filter their known-target lists. So removal cannot crash them — but leaving the names in place would leave dead configuration implying scan coverage that no longer exists. Retiring the entries is a correctness-of-intent change, not a crash fix.
- **`manifest.surface` is a narrowing, not a removal.** Verified: no code path ever *emits* `surface: 'web-ui'` — `manifest.ts:86` emits `'cli'`, and the only traces of `'web-ui'` are a stale comment (`index.ts:891`) and doc comments. Four readers (`diag.ts:215`, `subcommands.ts:127-130`, `score.ts:108`, `compare-cmd.ts:89-90`) handle the field being absent or `'cli'`. Narrowing the union is therefore safe and needs no compatibility shim — but the ADR should note the narrowing for operators who read `meta.surface` in existing manifests.
- **Do not mistake `packages/avo/src/operator.ts` for a `manifest.surface` reader.** Its `assertSurface` (`operator.ts:303`, called at `:314` and `:338`) guards `EVOLVABLE_SURFACES` (`operator.ts:187`) — an **agent-action** surface enum, a different concept that shares only the word "surface". That file mentions `manifest` zero times. Editing the manifest type does not touch it, and it must not be listed as a coupling.
- **`arc_render` keeps working; only its link goes.** The tool returns authoritative JSON in `structuredContent` (`tools.ts:217-224`) independent of the resource. Removing the MCP Apps link means the tool becomes a plain `registerTool`, matching its sibling `arc_*` tools, and the `@modelcontextprotocol/ext-apps` dependency becomes removable (used today only at `resource.ts:6` and `tools.ts:5`) — gated on a clean import check before removal.
- **`.harness/mcp-capabilities.json` is tracked, not generated.** No script generates it (verified), so the resource entry is edited directly. It is also asserted present in the npm tarball by `package.test.ts`, so that assertion must keep passing after the edit.
- **`audit-deps` extra-scan retirement interacts with the ADR-280 security fix.** Commit `2bca97d` (an ancestor of HEAD) lifted two inherited high advisories by bumping `adm-zip` `^0.6.0`→`^0.6.1` and `sharp` `^0.35.3`→`^0.35.4` via the UI package's `overrides` block. Verified: those advisory paths exist **only** in the UI lockfile (`adm-zip`/`sharp` appear 0 times in the root lock, 1 time in the UI lock; no root-workspace package depends on them), reached via `@huggingface/transformers`' node-only optional deps. Deleting the UI tree removes the only vulnerable surface and makes the overrides moot. **Current state verified green:** `node scripts/audit-deps.mjs --level=high` reports `ALL CLEAN at high+` (was `FAIL` at the pin). The removal therefore closes the earlier inherited-failure question outright; the ADR should record that, and the UI package block is deleted with the tree.
- **One data asset lives inside the UI tree.** `apps/web-ui/public/assets/swe-pareto.json` (28 KB, `updated: 2026-06-28`) is *research data*, not UI code, and two root scripts read it (`nightly-sota-review.mjs`, `pareto-from-firestore.mjs`); ADR-179's leaderboard documents it. Deleting the tree without relocating it silently breaks those scripts' inputs. It is relocated to `docs/research/` with its consumers repointed.
- **Two workflows are `disabled_manually` at the GitHub level, not inert in-file.** Observed via the Actions API at spec time (`pages: disabled_manually`, `pages-monitor: disabled_manually`), and `kozure/icm-metaharness` reported `has_pages: false`. *Note: that state is external to the repository and cannot be re-confirmed by a reader from the working tree — treat it as observed, not as a durable property, and do not let the plan depend on it.* The in-repo facts are what the removal rests on: `pages.yml` retains a live `push` trigger on `apps/web-ui/**`, and the "DISABLED" string is only a fork header comment — so deletion, not reliance on the disabled state, is what makes this permanent.
- **`ext-apps` and dependency removal are gated, not assumed.** Removing a dependency is only safe after confirming zero remaining imports; the spec requires that check rather than a blind edit.
- **Node/toolchain baseline:** Node `v26.7.0`; `npm run lint` runs `tsc --noEmit`.
- **Latest-standards research:** none required. This work is a removal inside one repository, governed entirely by the repository's own conventions (ADR-279 pin policy, the `INDEX.md` supersede rule, the existing gate set). No external technology choice, framework selection, or version decision is in play. Stating this explicitly rather than padding the spec with generic refactoring guidance.

## Security Considerations

- **The removal has a net-positive security effect, and the spec must not obscure it.** The only high-severity advisories in this repository live in the UI tree's lockfile and were inherited from upstream at the pin. Removing the tree removes the surface rather than suppressing the advisory — and no waiver mechanism exists in `scripts/audit-deps.mjs`, so removal is the stronger outcome. The ADR shall record that the ADR-280 remediation becomes moot by deletion: the `overrides` block pinning `adm-zip` `^0.6.1` / `sharp` `^0.35.4` lives in the UI package and is deleted with the tree. Nothing survives to carry forward or revert — no surviving package depends on either library, so the correction is retired along with the only lockfile that needed it.
- **No credentials or secrets are involved.** No API keys, tokens, or service credentials are introduced, rotated, or removed by this work. The deleted Pages workflows declare `pages: write` and `id-token: write` permissions; deleting them reduces the repository's granted permission surface.
- **The deleted workflows never ran on this fork.** Observed via the Actions API at spec time: 0 runs for either workflow. *As above, this is an external observation a reader cannot re-confirm from the tree — it is context, not load-bearing.* The reason the probe must go is in-repo and durable: it fetches upstream's `https://ruvnet.github.io/metaharness/` — a third-party origin this fork does not own or deploy. Removing the probe removes an outbound network call to a third-party origin from this repository's tooling. That is the correct disposition and should be stated in the ADR rather than left implicit.
- **No publish or release path is crossed.** Verified: `preflight.mjs`, `release.mjs`, and `publish-dryrun.mjs` contain no `apps/web-ui` reference, and the root `publish.yml` triggers on `v*.*.*` tags; this work creates no tag and triggers no publish.
- **Proof-artifact hygiene.** The evidence produced for this work is CLI output and file listings. Nothing produced requires committing build output, `dist/` directories, `node_modules`, or any generated bundle. The 2.8 MB of screenshots are deleted, not archived into the repository.
- **No publicly-visible write.** The removal is committed to the fork's own `main`. It is not pushed upstream, not published to npm, and not announced. Any external-facing action remains a separate, explicitly authorized step.

## Success Metrics

1. **Zero UI artifacts remain:** `git ls-files` returns 0 paths matching `apps/web-ui/**`, `docs/web-ui/**`, `__tests__/browser-smoke/**`, `**/arc-widget.html`, or `.github/workflows/pages*.yml` — and the fork's diff versus pin `d5833dc` reports **60 deletions** across those paths with 0 unrelated changes.
2. **Zero UI capability remains:** no code path writes into a UI tree, `manifest.surface` admits only `'cli'`, and no MCP capability declaration or tool advertises a rendered surface — verified by the inverted tests plus a direct grep for the removed identifiers.
3. **The guard is falsifiable, not merely passing:** the three named mutations in Unit 3 — one re-created artifact, one restored workflow, one restored `SCAN_DIRS` entry — each produce the expected failure with the unmutated suite green, and all three revert cleanly — **3 mutations demonstrated**, matching the fork's existing ICM standard.
4. **The full gate set is green post-removal:** `npm run build`, `npm test`, `npm run lint`, `path-guard`, `sbom`, `audit-deps`, `healthcheck`, and the vertical-tour gate all pass — with no test deleted to achieve it (all 4 hard-failing sites inverted, not removed).
5. **The removal is recorded and re-sync-proof:** one new ADR (ADR-284) with `Status: Accepted`, and `FORK-RESYNC.md` carries an enforcement step — such that a future re-sync that restores the UI is a documented policy violation and a CI failure, not a silent regression.

## Open Questions

*All items below are non-blocking and explicitly defaulted, and the defaults are applied as written. They change **no** Demoable Unit, no scope boundary, and — with one stated exception — no acceptance criterion. The exception is OQ#3: because it is conditional ("remove `ext-apps` *if* unused"), its fallback path alters one Functional Requirement and its Proof Artifact inside Unit 1 (the dependency stays, and the ADR records why) rather than silently passing. That contingency is pre-specified in Unit 1 itself, so it is a branch of the plan, not a deviation from it. All items are flagged because they were either unanswered in the questions round or surfaced by the agreed scope, and any can be overridden at implementation time by editing that item alone — none requires re-deriving the spec's shape.*

1. **Dead Studio probe disposition — defaulted to REMOVE.** This was the unanswered trailing sub-question in the questions round. Default applied: remove the dead code rather than leave it, because after the workflow deletions the `pages()` check, the `STUDIO_URL` constant, the `--probe-pages` step, and `release.mjs`'s pass-through all point at an origin this fork does not deploy and can never be exercised. Leaving them would preserve a gate that can only ever `SKIP`. Consequence to accept: `healthcheck`'s printed check set shrinks by one, and `release.mjs`'s "preflight clean (incl. live Studio probe)" log line changes wording. Flagged for visibility in case the maintainer prefers to keep the probe as a dormant capability.
2. **Embeddings capability — defaulted to RETIRE, recorded as a known gap.** The questions round selected "accept the loss, but verify parity first and record gaps." Default applied: the parity check is performed and the gaps are recorded (the in-browser `.zip` download and in-browser MiniLM embeddings), and neither is ported — consistent with Non-Goal 1. If the embeddings capability turns out to matter, that is a separate spec, not a scope addition here.
3. **`@modelcontextprotocol/ext-apps` dependency removal — defaulted to REMOVE IF UNUSED.** The spec requires a clean-import check first (non-blocking, since the only imports are in the two files being deleted: `resource.ts:6`, `tools.ts:5`). **This is the one conditional item** — the only Open Question with a live fallback branch. If the check is clean: the dependency is removed from `packages/arc-agi-3-chatgpt/package.json` and Unit 1's sixth requirement and proof artifact hold as written. If any import survives (it should not, both importing files being deleted): the dependency **stays**, the requirement is satisfied by recording why in ADR-284, and the proof artifact becomes "the dependency remains and no import is left dangling" instead of "the dependency is gone." Either branch is a pass; neither is a silent skip. Recorded here so the implementing engineer takes the branch deliberately rather than treating a failed check as a defect.
4. **`swe-pareto.json` relocation target — defaulted to `docs/research/`.** The asset is research data whose only home was the UI tree's public directory. `docs/research/` already exists and matches its nature. An alternative is retiring the asset and its two consumers together; the default preserves the research capability rather than discarding it, and the ADR records whichever is chosen.
5. **Comment-level `web-ui` references in surviving packages — defaulted to CORRECT WHERE MISLEADING.** `analyze-repo.ts:94,172`, `host-config.ts:10`, `mcp-scan.ts:126`, and `diag.ts:7` cite the removed tree as the origin of mirrored logic. The default is to reword these to describe the behavior rather than point at a deleted path, without a repo-wide prose audit (see Non-Goal 8).
6. **Which ADRs the new ADR formally supersedes — defaulted to the UI-defining set only.** 30 ADRs mention the UI, but only the small set that *defines* it is genuinely superseded (notably ADR-020 web generator UI, ADR-021 client-side packaging and Pages deploy, ADR-024 Studio and verify, ADR-027 CLI↔Web UI integration, ADR-171 webui darwin config). ADRs that merely reference the UI in passing (e.g. ADR-179's leaderboard) are left as history and are not listed as superseded. The exact list is settled at implementation time and recorded in ADR-284.
