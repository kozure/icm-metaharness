# ADR-284: The UI is removed — this fork is CLI-only

- **Status**: Accepted — implemented and verified (60 tracked paths removed across six UI paths; eight absence guards added, six proven falsifiable by individual mutation; gate set green except a pre-existing root-suite failure set proven unchanged against the pin).
- **Date**: 2026-09-16
- **Deciders**: Chris (kozure) — fork owner.
- **Tags**: fork, ui, removal, cli, upstream-drift, security, process
- **Supersedes**: ADR-020 (Web Generator UI), ADR-021 (Client-Side Packaging + GitHub Pages Deploy), ADR-024 (Agent Harness Studio + in-browser Verify), ADR-027 (CLI and Web-UI Integration), ADR-171 (Web-UI — Darwin capabilities + model-tier configuration)
- **Extends**: ADR-279 (fork design — pin policy), §pin discipline
- **Related**: ADR-179 (cost-Pareto leaderboard — *not* superseded; see §6), ADR-280 (security remediation — becomes moot, see §7), `FORK-RESYNC.md`, `docs/FORK-BASELINE.md`, `.fork-pin`, upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: the fork supports one surface — the CLI — and was carrying a complete browser UI inherited from upstream that it does not build, deploy, or support.

---

## Context

This repository is pinned to upstream `d5833dc` and carries a deliberate, attributable set of divergences (ADR-279). Among the upstream code it inherited was a complete browser-based UI:

- the **Agent Harness Studio** single-page app at `apps/web-ui/` — 50 tracked files: a React app, 10 `.tsx` components, an 11-file in-browser generator, Playwright e2e specs, build config, and its own `package-lock.json`;
- its visual record at `docs/web-ui/` — 5 files, ~2.8 MB of screenshots;
- a ChatGPT-side ARC widget (`packages/arc-agi-3-chatgpt/public/arc-widget.html`, 228 LOC) registered as an MCP Apps resource;
- a manual browser-smoke fixture at `__tests__/browser-smoke/`;
- two GitHub Pages workflows, `pages.yml` and `pages-monitor.yml`.

Beyond the artifacts, surviving code *behaved around* the UI: a template generator wrote into the UI tree, the harness manifest could declare a `web-ui` surface, an MCP capability declaration advertised a rendered canvas, and three root scan scripts named `apps/web-ui` as their canonical non-workspace target.

None of it is supported here. `pages.yml` retained a live `push` trigger on `apps/web-ui/**`, and the healthcheck's Studio probe fetched `https://ruvnet.github.io/metaharness/` — a third-party origin this fork neither owns nor deploys. The UI was not merely unused; it was actively wired to surfaces the fork does not control.

Leaving it carried a standing cost: every upstream re-sync would re-merge 60 files nobody here maintains, the repository's README and user guide advertised a product that could not be reached, and the only high-severity advisories in the repository lived in the UI tree's lockfile.

---

## Decision

### 1. The fork is CLI-only

The supported surface of this repository is the existing CLI. There is no browser UI, no TUI, no dashboard, and no replacement interface. The UI artifacts and the UI *capability* are permanently removed.

### 2. The artifacts are deleted, not disabled

All **60 tracked paths** the six UI paths held at pin `d5833dc` are removed from the fork: 59 deleted outright and 1 relocated (§5). `git diff --stat d5833dc..HEAD -- apps/web-ui` reports 50 files changed, 0 additions.

Deletion rather than disablement is deliberate. Both Pages workflows were observed `disabled_manually` at the GitHub level at spec time, but that state is external to the repository and cannot be re-confirmed by a reader from the working tree. The in-repo facts are what this rests on: `pages.yml` retained a live `push` trigger, and its "DISABLED" string was only a fork header comment. Deletion is what makes the removal permanent and readable from the tree alone.

### 3. Upstream re-syncs must not reinstate the UI

A re-sync that restores any UI artifact is a **policy violation**, not a feature. This is enforced three ways:

- `FORK-RESYNC.md`'s workflow disposition table now records `pages.yml`, `pages-monitor.yml` and `apps/` as **delete**, not *disable*, and its "remove it again if reintroduced" paragraph names all three alongside the existing `draco.yml` precedent.
- Eight tests assert absence rather than presence (§4).
- `__tests__/no-ui-artifacts.test.ts` asserts directly, from `git ls-files`, that no tracked path matches a UI artifact pattern — and names the offending paths when it fails, so a re-sync reads the violation rather than hunting for it.

### 4. The test contract is inverted, not deleted

Seven files that asserted the UI exists now assert it does not; one new invariant guard was added. **No test file was deleted to achieve this** — the only test files gone are the nine that lived inside the removed UI tree and tested the UI itself.

Six mutations were run individually, each with the guard green before and after, to prove the guards fire rather than merely pass. One of those six exists because the original `audit-deps.test.ts` pair opened with `if (!existsSync(join(ROOT, 'apps', 'web-ui', 'package-lock.json'))) return;` — once the tree was deleted they returned immediately and **reported green while asserting nothing**. Their replacements carry no existence guard at all, and the extra mutation (re-creating the UI lockfile and restoring the discovery entry) proves they go red when a UI tree reappears. An inert guard is worse than no guard.

### 5. Two consequences for surviving code

**`manifest.surface` is narrowed, not removed.** `packages/create-agent-harness/src/manifest.ts` declares `surface?: 'cli'` where it previously declared `surface?: 'cli' | 'web-ui'`. No code path ever *emitted* `'web-ui'`, and the four readers (`diag.ts`, `subcommands.ts`, `score.ts`, `compare-cmd.ts`) already handle the field being absent or `'cli'`, so no compatibility shim was needed.

**Operators reading `meta.surface` in existing manifests should note:** manifests generated before this change may still carry other values on disk. Nothing validates the field against the union at read time, so such manifests remain readable; they simply describe a surface this fork no longer produces.

Because widening a union back is backward-compatible — and therefore invisible to `tsc --noEmit` — the narrowing is held by a **source-text assertion** in `packages/create-agent-harness/__tests__/generated-templates.test.ts`, not by the type checker. That was verified: under a re-widened union the guard fails and `npm run lint` still exits 0.

**The non-CLI capabilities are retired, and the gaps are recorded rather than closed.** Two UI-only capabilities had no CLI twin:

| Retired capability | CLI-side reality |
| --- | --- |
| In-browser `.zip` download of a generated harness | `npm pack` produces the equivalent artifact |
| Optional in-browser MiniLM embeddings via `@huggingface/transformers` | The CLI uses keyword/archetype scoring |

Per Non-Goal 1 of the governing spec, parity was **verified and recorded, not closed**. Neither is ported. If the embeddings capability turns out to matter, that is a separate decision, not a scope addition here.

### 6. `swe-pareto.json` is relocated, and ADR-179 is not superseded

`apps/web-ui/public/assets/swe-pareto.json` (28 KB) is *research data*, not UI code, and two root scripts read it. It moved by `git mv` to **`docs/research/swe-pareto.json`**, with all consumers repointed: `scripts/nightly-sota-review.mjs`, `scripts/pareto-from-firestore.mjs`, and `SUBMISSIONS.md`'s "Add your row" instruction — the last being a live instruction that would otherwise have directed every future submitter at a deleted path.

`__tests__/research-asset-paths.test.ts` guards this by **resolving** each declared path and asserting the file exists, not merely by matching the string — a constant repointed at a dead path would satisfy a string match.

**The Cost-Pareto leaderboard's hosting is retired; its data is not.** `cost-pareto.html` and its `og.png` were served only by the deleted SPA tree, so the live URL the README and `SUBMISSIONS.md` pointed at is retired. The leaderboard's substantive content — the results table, the Wilson confidence intervals, the caveats, and the `SUBMISSIONS.md` contribution path — is preserved. ADR-179 mentions the UI only as the leaderboard's former host, so it is **left as history and is not superseded**. That distinction is the rule applied throughout: the ADRs this one supersedes are the ones that *define* the UI; the roughly two dozen that merely reference it in passing stand as records of what the repository once did.

### 7. `@modelcontextprotocol/ext-apps` is removed (Open Question 3 — primary branch taken)

The spec made this conditional: remove the dependency **if and only if** no import remained. The clean-import check was run after the widget plumbing came out — `grep -rn "ext-apps" packages/arc-agi-3-chatgpt/src packages/arc-agi-3-chatgpt/__tests__` returned nothing — so the **primary branch was taken**: `@modelcontextprotocol/ext-apps` is removed from `packages/arc-agi-3-chatgpt/package.json` and the lockfile. The fallback branch (retain the dependency and record why) was not needed and was not taken.

`arc_render` survives the widget removal as a **plain `server.registerTool`**, matching its sibling `arc_*` tools, and continues to return authoritative JSON in `structuredContent`. Only its MCP Apps link is gone. The tool list lost nothing: a pre-removal baseline was captured from the built server *before* `resource.ts` was deleted — the only moment at which it was recoverable — and is committed at `packages/arc-agi-3-chatgpt/__tests__/fixtures/arc-pre-removal-tools.json`, where `no-ui-surface.test.ts` asserts the current registered set equals it exactly. The `ui://metaharness/arc-agi-3/canvas` entry is removed from `.harness/mcp-capabilities.json`, whose `resources` key remains present as an empty array so the declaration keeps its schema shape.

### 8. The dead Studio probe is removed (Open Question 1 — default applied)

The `pages()` healthcheck, `STUDIO_URL`, the `--probe-pages` flag, `preflight.mjs`'s opt-in step, and `release.mjs`'s pass-through are all removed. After the workflow deletions they pointed at an origin this fork does not deploy and could only ever `SKIP`.

The security-relevant half: the probe made an **outbound network call to a third-party origin** (`ruvnet.github.io`) from this repository's tooling. Removing it removes that call. `healthcheck` now reports 7 checks instead of 8, and `release.mjs`'s "preflight clean (incl. live Studio probe)" log line is reworded.

---

## Consequences

**Accepted.**

- **Historical documentation links are knowingly broken.** The ADR corpus, `docs/specs/**`, `CHANGELOG.md`, and the `DONE` completion records in `docs/PRIME_AGENT_LOOP.md` keep their references to now-deleted paths. This is deliberate: those are records of work performed, and rewriting them would be falsifying history. Only *live guidance* was scrubbed. A reader following a link in ADR-024 to `apps/web-ui/` will not find it, and should read this ADR.
- **`docs/PRIME_AGENT_LOOP.md` keeps a live/historical split.** Its setup step was repointed at the CLI install path; its `DONE` records were left intact. The split is recorded here so a reviewer reads the intent rather than inferring it.
- **`healthcheck`'s printed check set shrinks by one**, and any operator script parsing its `8 checks` banner must be updated.
- **The root `__tests__/` suite has no CI runner** (upstream gap #194) — so the eight guards this work adds are, like the other 46 root tests, unreached by `npm test`. `npm test` is `npm run -ws --if-present test`, and `-ws` excludes the root package. This is recorded rather than fixed: it is pre-existing and out of scope here. The guards carry allowlist entries in `scripts/runner-coverage-allowlist.json` with reasons, which is what makes their unreachability a recorded decision rather than silent rot. **Anyone verifying these guards must run root `npx vitest run`, not `npm test`.**

**Gained.**

- **The removal closes an inherited security failure by deletion.** The only high-severity advisories in this repository lived in the UI tree's lockfile, reached through `@huggingface/transformers`' node-only optional dependencies. ADR-280's remediation bumped `adm-zip` `^0.6.0`→`^0.6.1` and `sharp` `^0.35.3`→`^0.35.4` via the UI package's `overrides` block. **That remediation becomes moot by deletion**: the `overrides` block lived in the UI package and is deleted with the tree, and no surviving package depends on either library. Nothing survives to carry forward or revert. `node scripts/audit-deps.mjs` reports `ALL CLEAN at high+` with `extra-scans=none`. Removal is a stronger outcome than suppression — and `scripts/audit-deps.mjs` has no waiver mechanism, so suppression was never available.
- **The repository's granted permission surface shrinks.** The deleted Pages workflows declared `pages: write` and `id-token: write`.
- **The repository's public story matches what it contains.** README, `SUBMISSIONS.md`, `docs/USERGUIDE.md`, `docs/PRIME_AGENT_LOOP.md`, and `docs/dream-cycle/PROMPT.md` no longer advertise a surface that cannot be reached.
- **Re-sync is cheaper and safer.** 60 files nobody here maintains will not be re-merged, and the three mechanisms in §3 make an attempt to restore them fail loudly.

**Precedent set.**

This is the fork's **first deletion of upstream-owned files** (verified: 0 upstream paths removed in all prior fork history). ADR-279 exists so fork deltas stay attributable; this ADR and the `FORK-RESYNC.md` entry are what keep a deletion of this size attributable rather than drifting into an unexplained divergence.

---

## Alternatives Considered

1. **Leave the UI in place, unbuilt.** Rejected. It was not inert: `pages.yml` had a live `push` trigger, the healthcheck probed a third-party origin, the generator wrote into the tree, and the tree's lockfile carried the repository's only high-severity advisories. "Unused" and "harmless" were not the same thing here.
2. **Disable rather than delete.** Rejected. The workflows' disabled state is external to the repository and unverifiable from the tree; a fork header comment reading "DISABLED" is not a mechanism. Deletion is readable from the tree and enforced by tests.
3. **Port the two UI-only capabilities to the CLI first.** Rejected as scope inversion — it turns a removal into a feature. The gaps are recorded in §5 instead; either can become its own decision later.
4. **Retire `swe-pareto.json` along with its host directory.** Rejected. It is research data with two live consumers and an ADR-179 lineage. Relocation preserves the capability; deletion would have silently broken two scripts' inputs.
5. **Edit the UI-defining ADRs in place.** Not available — `docs/adrs/INDEX.md` states that a ratified ADR is amended by a follow-on and never edited in place. Hence this ADR.

---

## Test Contract

| Guard | Asserts | Falsified by |
| --- | --- | --- |
| `__tests__/no-ui-artifacts.test.ts` *(new)* | no tracked path matches any UI artifact pattern; `git ls-files` returned a non-empty list first, so it cannot pass vacuously | re-creating `apps/web-ui/package.json` |
| `__tests__/path-handling.test.ts` | `SCAN_DIRS` excludes `'apps'`; path-guard runs green and its scan list omits `apps` | re-adding `'apps'` to `SCAN_DIRS` |
| `__tests__/sbom.test.ts` | `jszip` and `react` are absent from the SBOM | a restored UI lockfile in `EXTRA_LOCK_DIRS` |
| `__tests__/workflows.test.ts` | `pages.yml` and `pages-monitor.yml` do not exist | restoring `pages.yml` from the pin |
| `__tests__/audit-deps.test.ts` | extra-scan discovery reports `extra-scans=none`; no `apps/web-ui` in output — **no existence guard**, so it cannot go inert | re-creating the UI lockfile + restoring the `known` entry |
| `__tests__/healthcheck.test.ts` | 7 checks, no `pages`; `--check=pages` takes the unknown-check path; `--probe-pages` is inert | re-adding the `pages` check |
| `__tests__/release.test.ts` | `--probe-pages` appears in neither `release.mjs` nor `preflight.mjs` | restoring the preflight flag read |
| `__tests__/research-asset-paths.test.ts` *(new)* | the relocated asset is tracked and both consumers **resolve** a live path | repointing a consumer at `apps/`, or at any non-existent path |
| `packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts` *(new)* | the **built** server registers no `ui://` resource on any lane in either arm; `arc_render` still returns `structuredContent`; the tool set equals both the capability declaration and the pre-removal fixture | — |
| `packages/arc-agi-3-chatgpt/__tests__/package.test.ts` | the tarball excludes `public/arc-widget.html` and ships no `public/` tree; `.harness/` policy files still present | restoring the widget and its `files` entry |
| `packages/create-agent-harness/__tests__/generated-templates.test.ts` | a real generator run writes no path under `apps/`; `manifest.surface` admits only `'cli'` (source assertion — `tsc` cannot catch a re-widened union) | re-adding the generator write; re-widening the union |

**Verification command:** root `npx vitest run` — **not** `npm test`, which reaches only the ARC package's guard.

**Known non-green, and explicitly not caused by this work:** the root suite carries a pre-existing failure set — including two `workflows.test.ts` assertions that pin `publish.yml`'s pre-`87b6c51` shape (`npm publish --provenance` and six `host-*` names moved into `scripts/publish-workspace.mjs`; the workflow is correct and the assertions are stale). A full root run at the pin `f1eadbc`, freshly built, produces an identical failing set. Those failures are latent precisely because of gap #194, and fixing them is not UI work.
