# 02-tasks-icm-default-on.md

Derived from `02-spec-icm-default-on.md` (flag-removal frame, commit `9af51bf`). Six parent tasks, one per demoable unit, ordered so the capability resolver lands before the flag surface is deleted and before any test premise is retired.

> ## ⚠️ Two verified findings that reshape Phase 3 — read before the sub-tasks
>
> **Both are now resolved IN THE SPEC** (remediation approved 2026-09-16; audit Run 1 R1/R2/F2). The spec is authoritative; this box records *why* the design has the shape it does.
>
> **F1 — `minimal`'s ICM *generation* would have become unreachable under §6 as originally written.** This was a spec defect, not a task gap — **now fixed by spec §6.1.**
>
> §6 says resolution "moves INSIDE `scaffold()`, replacing `opts.icm === true` at `:694`". But **four internal callers pass `icm: true` explicitly** and pass it *to `scaffold()`*:
>
> | Caller | Template | Passes |
> |---|---|---|
> | `examples/vertical-tour/vertical-tour.mjs:116` | `catalog.filter(t => t.icm)` → **incl. `minimal`** | `icm: true` |
> | `__tests__/icm-optin.test.ts:251,260` (`generate:false template` block) | **`minimal`** | `icm: true` |
> | `__tests__/scaffold-e2e.test.ts:153`, `icm-scaffold.test.ts:59`, `onboarding.test.ts:86,166,309` | `vertical:coding` | `icm: true` |
>
> If `scaffold()` *replaces* the incoming boolean with a `generate !== false` capability default, then `minimal` resolves to **false** — and because `minimal` **is** the only `generate:false` template carrying an `icm`/`stages` block (verified: 3 stages, `01-plan`/`02-build`/`03-verify`), its ICM tree becomes **unemittable by any path**. Consequences:
>
> - `vertical-tour.mjs`'s ICM pass asserts stages that are never emitted → **the iter-88 CI gate goes red on every push.**
> - `icm-optin.test.ts`'s `generate:false template (task 2.6)` block — 2 tests — fails.
>
> Q1 decided `minimal` stays ICM-**free by default**. It did not decide that `minimal` loses ICM **generation**. §6 makes the latter happen as a side effect, and §5's disposition table does not list either victim (it lists `minimal` nowhere).
>
> **Resolution adopted (spec §6.1) — capability supplies the DEFAULT, an explicit arg supplies the OVERRIDE:** `useIcm = opts.icm ?? resolveIcmDefault(opts.template)`. Rationale: `walkTemplate`'s `icm` parameter is *already* an internal boolean consumed by two independent callers (`scaffold()` and `upgrade-cmd.ts:93`), so it must survive the flag removal regardless — §3.5 already establishes half of this. Removing it from `scaffold()` too would be a second, unmandated change with two casualties.
>
> This also keeps §1 honest: "there is no **user-facing** escape hatch" refers to a flag, which still dies (the CLI stops passing `icm:` in 2.4). A library param the CLI never sets is not an escape hatch.
>
> **F2 — the resolver already exists.** `upgrade-cmd.ts:49` defines `icmEnabled(manifest)`, deriving ICM-ness from the manifest's recorded file map. It answers a *different* question ("what did this harness emit?") from the capability resolver ("what should this template emit?"), so it is **not** deduplicated (spec §6.2) — but two same-named concepts in one codebase invite a future merge that would break `upgrade`. They must be named apart and cross-referenced.
>
> **Also carried in (from the Phase 2 standards sweep):**
>
> - `src/validate.ts` holds a **second** `not generated with --icm` literal alongside the one Q4 rewords, plus two doc comments — §7 names one of three.
> - `__tests__/validate.test.ts:212` asserts on that string → a **fourth** premise-dies test, outside §5's six-file table (§5 is one file short).
> - `ADR-282`'s body states ADR-279's byte-equality guarantee "still hold[s]" — false post-removal; correctable only via ADR-285's header + `INDEX.md` row, body untouched per `INDEX.md:359`. Likewise `seam-driver.ts:79,480` and `walker.ts:59` carry `--icm` prose.
> - **SC7's number is now deferred to measurement (spec §4.1, audit R2).** The measured overlay holds **8** marker tokens; `vertical:coding` declares **6** questions. SC7 now states the *semantics*; sub-task 5.4 measures and 5.8 pins the measured value. No pre-stated number is a target.
> - **SC9 is now test-backed (audit R3):** sub-task 2.8 adds a `--help` assertion; the repo-wide grep is downgraded to a companion, not the gate.
> - **`validate.test.ts:206-216` is a seventh premise-dies test** (spec §5 now says seven, and marks `icm-optin.test.ts:216-266` as a **preserve**).
> - **§7's `upgrade-cmd` line reference corrected**: the function is `:49` (doc comment `:44-48`); the call is `:93`.
>
> **No remediation edits have been made.** F1 is a spec change; per the phase's gate it waits for approval. It will be raised as a REQUIRED audit finding.

## Relevant Files

| File | Why It Is Relevant |
| --- | --- |
| `packages/create-agent-harness/src/index.ts` | The whole flag surface. Parser branches (`:225-228`), `--answers` implication (`:229-237`), help lines (`:1185-1186`), CLI `icm:` passthrough (`:1244`), and the two consuming sites (`:694` walk, `:855` onboarding gate). `loadCatalog()` (`:134-136`) is the capability source; `emptyManifest(opts.template, …)` (`:892`) is what makes `doctor`'s distinction possible. |
| `packages/create-agent-harness/src/walker.ts` | `icm` option doc (`:59`) and the overlay gate (`:68`). **Must keep its parameter** — `upgrade-cmd.ts:93` drives it independently of `scaffold()`. |
| `packages/create-agent-harness/src/upgrade-cmd.ts` | `icmEnabled(manifest)` (`:49`) — the manifest-derived gate that **must survive** (SC5), and the F2 naming collision. Re-render call at `:93`. |
| `packages/create-agent-harness/src/validate.ts` | `runIcmStructure` (`:248-269`): `isIcm` derived from the manifest file map, SKIP detail `'not generated with --icm'`, and `manifest.template` read at `:271` *after* the early return. A **second** `--icm` literal plus two doc comments live here (Q4 rewords one of the three). |
| `packages/create-agent-harness/src/onboarding.ts` | `scanResiduals` (`:320-338`) matches every `{{SCREAMING_SNAKE}}` / `{{?COND}}` token, so it counts markers rather than unanswered questions. Its doc comment names the walker's `unresolved[]` as the lowercase half's owner — that split must be preserved. |
| `packages/create-agent-harness/src/analyze-repo.ts` | Passes no `icm` (`:426`) — a non-CLI caller whose behaviour changes silently when the default flips. Read-only verification target. |
| `packages/create-agent-harness/src/seam-driver.ts` | `--icm` prose in a doc comment (`:79`) and a thrown error message (`:480`). The error text instructs a user to "scaffold with --icm first" — a flag that will no longer exist. |
| `packages/create-agent-harness/templates/catalog.json` | The capability marker: 20 entries, `icm` block on `minimal` (3 stages, 3 questions, `generate:false`) and `vertical:coding` (5 stages incl. the `references/` row, 6 questions, `generate:true`). **`minimal` is the only `generate:false` entry with an `icm` block.** |
| `packages/create-agent-harness/templates/catalog.def.mjs` | Single source for the generated entries; `:643` and `:684` declare `icm: true`. `minimal`'s `generate:false` is why its overlay is the one place the single-source guarantee does not hold. |
| `packages/create-agent-harness/scripts/gen-templates.mjs` | Emits the `.icm/` overlay (`emitIcmOverlay`, `:359-375`); comments at `:96-97` and `:407` describe the overlay as "skipped unless `--icm` is passed" — prose to reword, behaviour unchanged. |
| `packages/create-agent-harness/__tests__/icm-off.test.ts` | **Repurpose (all 5 tests).** Whole file is the byte-equality contract: header comment cites ADR-279 d2 as a hard constraint (`:3-14`), `scaffoldInto` keys the comparison off `icm: undefined` vs `true` (`:55-67`). Post-flip `undefined` resolves to the capable default — the file would compare ICM against ICM and pass vacuously. |
| `packages/create-agent-harness/__tests__/icm-optin.test.ts` | **Delete `:91`** (flag parse), **invert `:99`** (flagless ⇒ no ICM), **re-scope `:198`** (upgrade plan parity). **Leave `:216-266`** — the `minimal` `generate:false` block passes only if F1's override is preserved; it becomes the F1 regression guard. |
| `packages/create-agent-harness/__tests__/scaffold-e2e.test.ts` | `:184` "byte-identical when the flag is absent" — **delete**, unrepurposable (the flag it would re-point to does not exist). `:153` passes `icm: true` on a capable template; unaffected. |
| `packages/create-agent-harness/__tests__/validate.test.ts` | `:206-216` asserts `SKIP` + `/not generated with --icm/` — the **seventh** premise-dies test (spec §5), retargeted by 4.5. `makeIcmDir()` (`:15`) documents the manifest-based `isIcm` decision. |
| `packages/create-agent-harness/__tests__/help-surface.test.ts` | **New.** Guards that `--help` advertises no `--icm`/`--no-icm` and that `--answers` no longer claims to imply ICM (SC9, audit R3). A test, not a grep — so a future reintroduction fails a gate. |
| `packages/create-agent-harness/__tests__/onboarding.test.ts` | `:220` exercises `--icm` on the CLI; the flag becomes inert so the arg is vestigial — clean it (`:86,166,309` pass `icm: true` and are unaffected). |
| `packages/create-agent-harness/__tests__/generated-templates.test.ts` | Catalog↔emitted-tree conformance (`unresolved == []`). **Untouched** — carries the surviving conformance weight. |
| `packages/create-agent-harness/__tests__/icm-scaffold.test.ts` | Catalog stage-set conformance against the emitted tree (`:59` passes `icm: true`). **Untouched.** |
| `packages/create-agent-harness/__tests__/upgrade.test.ts` | Target for SC5's pre-removal regression guard; the committed fixture's counterpart. |
| `packages/create-agent-harness/__tests__/fixtures/icm-preremoval/` | **New.** A committed pre-removal flagless `vertical:coding` harness + manifest with no ICM paths — the durable baseline that makes "no retro-added files" auditable (mirrors spec 01's `arc-pre-removal-tools.json` precedent). |
| `examples/vertical-tour/vertical-tour.mjs` | **CI gate.** ICM pass filters `catalog.filter(t => t.icm)` (`:194`) → includes `minimal`; scaffolds with an explicit `icm: true` (`:116`). Its separate-pass rationale (`:81-87`, `:192`, `:229`) is written in terms of the byte-equality guarantee. Main pass excludes `minimal` (`:172`), so it has no other CI coverage. |
| `examples/README.md`, `examples/icm-onboarding/answers.example.json` | Document the `--icm` onboarding path (`:`) and describe the tree as `--icm`-gated. Prose only. |
| `docs/adrs/ADR-285-*.md` | **New.** `Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`. |
| `docs/adrs/ADR-279-*.md` | The superseded decision. **Body must NOT be edited** (`INDEX.md:359`) — the Supersedes header on 285 plus an INDEX row carry the supersession. |
| `docs/adrs/ADR-282-*.md` | Body asserts ADR-279's byte-equality guarantee "still hold[s]" — false post-removal, left intact, cross-noted from ADR-285. |
| `docs/adrs/INDEX.md` | ADR-279's row gains the supersession annotation; `:339` is the row-annotation precedent, `:359` the no-body-edit rule. |
| `CHANGELOG.md` | Must **lead** with the breaking default change; version taken as `minor` (spec §4.1). |
| `README.md`, `docs/USERGUIDE.md`, `docs/ARCHITECTURE.md` | Flag references to remove; state that ICM follows the template. The `## Verticals (19 quick-start templates)` count is unaffected. |
| `scripts/healthcheck.mjs` | `catalogCount()` (`:238-258`) cross-checks the catalog's template count across languages. Must stay green; a capacity-source change is a plausible way to perturb it. |

### Notes

- Tests live in `packages/create-agent-harness/__tests__/`, discovered by `vitest` (`packages/*/__tests__/**`).
- Test command is **per-package**: `npm --prefix packages/create-agent-harness test` (i.e. `vitest run`). Single file: `npx vitest run __tests__/<file>.test.ts` from the package dir.
- Typecheck is `npm run lint` (`tsc --noEmit`) inside the package; the ordered root `npm run build` produces workspace declarations first.
- **The repo's own gate order is `build` → `test` → `healthcheck`; `node scripts/preflight.mjs` is the ~30s release gate.** Each task's own tests are the local proof; `healthcheck` + `vertical-tour` are the structural ones.
- Per `CONTRIBUTING.md`: **every load-bearing change requires a new or updated ADR** — that is task 6.3, not optional.
- Do NOT weaken an assertion to make a repurposed test pass. If a guard cannot be re-pointed honestly, **delete it and say so** (that is `scaffold-e2e.test.ts:184`).

## Tasks

### [x] 1.0 Capability-derived ICM resolution replaces the two flag checks

#### 1.0 Proof Artifact(s)

- CLI: `npx metaharness my-bot --template vertical:coding --force && ls my-bot/stages` → `01-plan  02-implement  03-test  04-review` demonstrates a **flagless** capable scaffold emits the tree
- CLI: `npx metaharness my-bot --template vertical:devops --force` → `Files: 18` and **no** `Onboarding:` line demonstrates the non-capable path is unchanged in files *and* stdout (spec §3.3)
- CLI: `npx metaharness validate my-bot` (capable) → `icm-structure PASS` demonstrates the tree satisfies the catalog's declared stage set
- CLI: `node examples/vertical-tour/vertical-tour.mjs` → exit 0 with the ICM pass green demonstrates F1's override design keeps all four internal callers working
- Test: `npx vitest run __tests__/icm-scaffold.test.ts __tests__/generated-templates.test.ts __tests__/icm-optin.test.ts` passes demonstrates conformance and the `minimal` block survive the resolution change
- Diff: one resolver + the `opts.icm ?? resolveIcmDefault(...)` expression at `index.ts:694` and `:855` demonstrates one default, with the override preserved
- CLI/Test: the `vertical-tour` ICM pass still reports both capable templates OK demonstrates the override design keeps `minimal` emittable (spec §6.1, audit R1)

#### 1.0 Tasks

- [x] 1.1 Add `resolveIcmDefault(templateId: string): boolean` beside `loadCatalog()` in `src/index.ts`. Predicate: the catalog entry satisfies `icm?.enabled === true && generate !== false`. **Fail-closed**: a missing/unknown template id returns `false` (matches today's non-capable behaviour). Doc-comment it with the two-conjunct rationale — `generate !== false` encodes Q1's decision as catalog data, so `minimal` stays off *by declaration*, not by a hard-coded exception.
- [x] 1.2 Name it apart from `upgrade-cmd.ts:44`'s `icmEnabled`. Add a one-line cross-reference in each direction, stating the two questions differ: *what should this template emit* (capability) vs *what did this harness emit* (manifest). Do **not** deduplicate them (F2).
- [x] 1.3 In `scaffold()`, resolve once: `const useIcm = opts.icm ?? resolveIcmDefault(opts.template);`. Replace `icm: opts.icm === true` at `:694` with `icm: useIcm`.
- [x] 1.4 Replace `if (opts.icm === true)` at the onboarding gate `:855` with `if (useIcm)` and reuse the same value — no second resolution, so walk and onboarding can never disagree (spec §3.3's `answers` consistency comment).
- [x] 1.5 **Keep `icm?: boolean` in `scaffold()`'s opts type as an internal override.** Its doc comment must say the CLI no longer supplies it, that it exists so `walkTemplate`'s two callers stay independent, and that it is not a user escape hatch. (This is F1's resolution; do not "simplify" it away.)
- [x] 1.6 Leave `walkTemplate`'s `icm` parameter and `walker.ts:68`'s gate untouched — `upgrade-cmd.ts:93` depends on them.
- [x] 1.7 Check `analyze-repo.ts:426` (passes no `icm`): confirm the capability default is the intended behaviour for that caller and record the finding in the task's proof notes. Do not change it silently.
- [x] 1.8 Add the capability-default guard: a flagless capable scaffold emits the tree, a flagless non-capable scaffold does not. Place it so it is CI-visible — the tour's ICM pass uses the explicit override and therefore does **not** exercise the default (see 6.2).
- [x] 1.9 Assert the non-capable stdout case explicitly: `vertical:devops` flagless stdout contains **no** `Onboarding:` line (spec §3.3; SC2).
- [x] 1.10 **Prove the override survives** (spec §6.1, SC11, audit R1): `scaffold({template:'minimal', icm:true})` emits `minimal`'s 3-stage tree, and `scaffold({template:'vertical:coding', icm:false})` emits none. Without the first, `minimal`'s ICM generation is unreachable by any path; without the second, an override that only honours `true` would pass. Both are falsified in 3.14(c).
- [x] 1.11 Re-run `node examples/vertical-tour/vertical-tour.mjs` at the end of this task, not only in 6.1 — the resolver change is the one that can break the iter-88 gate, so it must be checked the moment it lands, not at release time.

#### 1.0 Implementation notes (recorded 2026-09-16)

**Verified before writing code:** every line reference in this task checked against
live source — parser branches `:225-228`, `--answers` `:229-237`, consuming sites
`:694`/`:855`, CLI passthrough `:1244`. All correct.

**Catalog facts confirmed:** 20 entries, **all 20 declare `generate`** (14 `true`,
6 `false`). Both `icm`-carrying entries (`minimal`, `vertical:coding`) declare
`icm.enabled: true`, so `generate !== false` is the conjunct that separates them —
`minimal` stays off *by declaration*. The predicate yields exactly
`{vertical:coding}` as the default-on set. `generate: false` means "hand-authored,
gen-templates.mjs does not own the dir" (6 entries), **not** "carries no ICM".

**Finding — the 1.9 stdout guard needed strengthening to avoid passing for the
wrong reason.** The CLI still passes `icm: args.icm === true` (deleted in 2.4), so
an explicit `false` masks the resolver on every CLI run. Mutation (b)
(resolver→always `true`) left the CLI silent while the *library* correctly reported
`onboarding: "interactive"` for `vertical:devops`. The guard now asserts
`result.onboarding === undefined` at the library level (where the capability
default is live today) and keeps the CLI/stdout assertion as the user-visible
surface. Re-falsified after strengthening. **This also means SC2's stdout
assertion does not gate the resolver until 2.4 lands** — task 3.0/6.2 should not
treat a green 1.9 as resolver coverage.

**Finding — two `icm-off.test.ts` tests now pass vacuously.** Of its 5 tests, only
**3** fail (`:113`, `:134`, `:145`). "yields identical bytes…" and "leaves the
flagless manifest byte-identical…" now compare an ICM scaffold against another ICM
scaffold and pass green. The file's own header warns that this is the vacuous mode.
Task 3.2/3.4 re-point them; **task 3.0's proof must assert they go red if
un-repointed** rather than trusting the current green. This is a seventh-site
class of finding beyond §5's table.

**Task 1.7 verdict:** `analyze-repo` plans reference six templates; only
`vertical:coding` is ICM-capable, so `analyze-repo --scaffold` on mcp-server /
rust-crate / typescript-sdk projects now emits ICM. `minimal` is unreachable from
those plans, so the `generate: false` interaction cannot fire there. **Intended, not
changed.**

**Mutation falsification (ADR-279's own standard):** (a) resolver→`false` → 3 red;
(b) resolver→`true` → 3 red; (c) override dropped → 2 red in `icm-default` + 2 in
`icm-optin`'s `minimal` block + CI tour `1/2 OK` (`minimal` FAIL — *missing
stages/01-plan/CONTEXT.md*). Mutation (c) reproduces F1's predicted CI breakage
exactly.

**Suite state after 1.0:** `654 passed | 7 failed | 2 skipped`. All 7 failures are
premise-dies tests owned by task 3.0 — none is an unexpected regression. Baseline
before this task was 661 passing; 654 + 7 = 661, accounting for all of them.

**Proof artifact:** `02-proofs/02-task-01-proofs.md`.

**Local gates (task 1.0):** `build` ✅ · `lint` ✅ · `healthcheck 7/7` ✅ ·
`vertical-tour 19/19 + 2/2` ✅. **Preflight deferred to 6.8 and currently NOT green
for unrelated pre-existing reasons:** `cargo test` hangs on
`darwin::tests::dynamic_can_match_or_beat_best_static_on_leduc` (>60s, blocked the
run); `version drift` FAIL across 41 packages; `evals-extract` missing README.
This commit changes 0 `package.json` / 0 `README.md` files. Task 6.8 must address
these three explicitly — do not re-run preflight and report red as expected.

**Commit:** `63489a3`.

### [x] 2.0 The flag surface is deleted

#### 2.0 Proof Artifact(s)

- CLI: `npx metaharness my-bot --template vertical:coding --no-icm --force; echo "exit=$?"` → `exit=0`, tree still emitted demonstrates the accepted silent-ignore behaviour (Q3)
- CLI: `npx metaharness my-bot --template vertical:coding --icm --force` → exit 0, output identical to flagless demonstrates the removed flag is inert, not an error
- CLI: `npx metaharness --help | grep -c -- '--icm'` → `0` demonstrates no dead flag reference survives in help
- Grep: `grep -rn -- "--no-icm\|'--icm'" packages/create-agent-harness/src/` → no parser/help hits demonstrates §3.1's table was complete
- Test: `npx vitest run __tests__/help-surface.test.ts` → asserts `--help` output contains no `--icm`/`--no-icm` demonstrates the flag surface is **guarded**, not just grepped once (SC9/R3)
- Diff: the two `icm?: boolean` doc comments show no `--icm`, no "default OFF", no byte-equality claim demonstrates the documented contract matches the code

#### 2.0 Tasks

- [x] 2.1 Delete the `--icm` and `--no-icm` parser branches (`index.ts:225-228`).
- [x] 2.2 Delete `out.icm = true` from the `--answers` branch (`:229-237`) and rewrite its comment. Answers now supply **content**; the template supplies ICM-ness. Verify a flagless `--answers` run still resolves through capability.
- [x] 2.3 Delete the `--icm` help line (`:1185`) and the `(implies --icm; …)` clause from the `--answers` line (`:1186`).
- [x] 2.4 Delete `icm: args.icm === true` from the CLI's `scaffold()` call (`:1244`). The CLI stops supplying the override; it is not deleted from the opts type (1.5).
- [x] 2.5 Rewrite both `icm?: boolean` doc comments (`:186-188`, `:318-320`): drop "default OFF", drop "`--icm` to enable", and **drop the byte-equality claim** — it is retired by 6.3's ADR.
- [x] 2.6 Reword the remaining `--icm` prose: `walker.ts:59`, `gen-templates.mjs:96-97` and `:407`, `seam-driver.ts:79` and its `:480` error message (it currently tells a user to "scaffold with --icm first" — a flag that no longer exists; make it name the template instead).
- [x] 2.7 Verify the silent-ignore contract: `--icm` and `--no-icm` both exit 0 and are ignored. Do **not** add unknown-flag rejection (Q3 explicitly declined it).
- [x] 2.8 **Guard the help surface with a test, not a grep** (SC9 / audit R3). Add `__tests__/help-surface.test.ts`: run the CLI's help path and assert the output contains neither `--icm` nor `--no-icm`, and that the `--answers` line no longer claims to imply ICM. A one-time grep guards nothing — a future commit could reintroduce a flag reference with no failing gate. Do the same for the two doc comments if they are reachable programmatically; otherwise leave the grep as a build-time companion, not the gate.
- [x] 2.9 Confirm the CLI no longer passes `icm:` at all (`grep -n "icm:" src/index.ts` → the only survivor is the opts *type* declaration from 1.5, not a call-site argument). If a call site remains, the CLI still supplies the override and §6.1's "unreachable from the command line" claim is false.

### [x] 3.0 Retire the byte-equality test premise and repurpose its guards

#### 3.0 Proof Artifact(s)

- Test: `npx vitest run __tests__/icm-off.test.ts __tests__/icm-optin.test.ts __tests__/scaffold-e2e.test.ts __tests__/validate.test.ts` passes demonstrates no repurposed guard went silent
- Test (mutation a): resolver forced to `false` → the capable cases in `icm-off.test.ts` **red**; transcript committed demonstrates the repurposed guard actually gates
- Test (mutation b): resolver forced to `true` → the non-capable cases **red**; transcript committed demonstrates the negative half gates too
- Grep: `grep -rn "icm: undefined" __tests__/` → only cases whose subject is genuinely the override demonstrates no test still asserts on a mode that no longer exists
- Diff: `scaffold-e2e.test.ts:184` deleted with a removal note naming *why* it is unrepurposable demonstrates the loss is recorded, not hidden
- Diff: `icm-optin.test.ts:216-266` left substantively intact demonstrates the `minimal` block survived as the override regression guard
- Test: explicit `icm: false` on `vertical:coding` → no tree emitted demonstrates the override wins in **both** directions, not just `true` (SC11)

#### 3.0 Tasks

- [x] 3.1 Rewrite `icm-off.test.ts`'s header comment (`:3-14`): it cites ADR-279 d2 as a *hard* constraint and names byte-equality as the property. Replace with the honest contract — *byte-equality retired, capability-preservation substituted* — and say the file now guards that capability, **not** that nothing changed.
- [x] 3.2 `icm-off.test.ts:90` ("identical bytes for every file the flag does not legitimately rewrite") — re-point. Capable flagless and capable `icm:true` no longer differ by a flag, so the comparison must become **capable vs non-capable** file-set comparison (`vertical:coding` vs `vertical:devops`), keeping the non-vacuous guard (`offFiles.length > 10`). ⚠️ **The prescribed cross-template comparison was measured impossible and was NOT implemented as written.** `coding` and `devops` share only 14 of 31/19 file names and **8 of those 14 differ in content**; a path shared is not a file equal. Substituted: the same-template **override delta** (`icm:false` vs `icm:true`), which isolates the overlay exactly. Capability is guarded by name-set presence instead. See `02-proofs/02-task-03-proofs.md` → *"Task 3.2 / 3.5's prescribed re-point is falsified"*.
- [x] 3.3 `icm-off.test.ts:106` (banner vs router) — re-scope. Post-removal a capable scaffold is *always* the router; the banner case now belongs to non-capable templates. Assert router-on-capable / banner-on-non-capable, keeping the "neither leaks a Mustache var" assertion.
- [x] 3.4 `icm-off.test.ts:121` (manifest determinism across two runs) — keep; retarget to a capable flagless pair so it still proves the default is stable.
- [x] 3.5 `icm-off.test.ts:129` ("adds exactly the ICM paths") — re-point to the **capability delta** (capable minus non-capable file sets equals the capable template's `ICM_PATHS`), since no flag remains to add them. Keep the reverse assertion that nothing is removed. ⚠️ **The prescribed delta is arithmetically false**: `coding`-only names = **17**, `ICM_PATHS` = **10** (and only `minimal`'s flagless output is a subset of coding's). Re-pointed to the override delta on one template — but note that guard is **blind to mutation (b)**, which is structurally unobservable at file level (a non-capable template owns no `.icm/` overlay, so `useIcm=true` changes no file). That direction is covered by `icm-default.test.ts` 1.1/1.9 on stdout. Coverage moved; it was not lost.
- [x] 3.6 `icm-off.test.ts:141` (flagless manifest free of ICM paths) — now false for capable; retarget to non-capable, and pair it with the inverse for capable (manifest **does** record the tree).
- [x] 3.7 `icm-optin.test.ts:91` (flag parse) — **delete**; the flags are gone. **Discharged at 2.1, not here.** Deleting the parser branches (2.1) is what falsifies the old assertions, so the rewrite landed with them — a test may not outlive the surface it asserts on. Replaced by `--icm flags are gone; the parser silently ignores them` (SC3), which asserts the *accepted* contract (`parseArgs` records no opt-in **or** opt-out) rather than the deleted one.
- [x] 3.8 `icm-optin.test.ts:99` ("emits no ICM file at all when the flag is absent") — **invert**: capable flagless **does** emit the tree; keep a companion assertion that a non-capable flagless run emits none.
- [x] 3.9 `icm-optin.test.ts:198` (upgrade plan parity with/without `--icm`) — **re-scope** to the pair that still exists: a **pre-removal** flagless harness vs a **post-removal** one, asserting upgrade reports no ICM drift for either. Preserve the `onRemoved < ICM_PATHS.length` sanity bound.
- [x] 3.10 `icm-optin.test.ts:216-266` (the `minimal` `generate:false` block) — **leave the assertions intact**; add a comment naming it as the F1 guard: it passes only because the explicit override survives. It must fail if a future change lets the capability default override an explicit `icm: true`.
- [x] 3.10b **Add the reverse override case** (SC11): `scaffold({ template: 'vertical:coding', icm: false })` emits **no** ICM tree. The `minimal` block covers `icm: true`; without this, an override-dropping regression that only respects `true` would pass everything. Falsify it in 3.14(c).
- [x] 3.11 `scaffold-e2e.test.ts:184` ("byte-identical when the flag is absent") — **delete** with a comment explaining the premise died and no re-point exists (the flag it would target is gone, and a capable flagless scaffold is now non-trivially different by design).
- [x] 3.12 `onboarding.test.ts:220` — remove the vestigial `--icm` argument; the test's real subject (interactive residue reporting) is unaffected. Confirm the test still passes *because* of the residue assertion, not because the flag was ignored.
- [ ] 3.13 `validate.test.ts:206-216` — retarget off `/not generated with --icm/`; coordinate with 4.2's new message. This is the fourth premise-dies test and is **not** in the spec's §5 table. **DELIBERATELY OPEN — blocked on parent 4.0.** The repoint is not independent: the assertion is `expect(r.detail).toMatch(/not generated with --icm/)`, and 4.2 replaces that single SKIP message with a three-way branch. Repointing now would mean asserting against a string that 4.2 is scheduled to delete. Done in 4.5, under 4.0. No grep-clean claim is made here.
- [x] 3.14 Mutation-falsify per ADR-279's own standard ("three separate mutations each turn the gate red"): (a) resolver → always `false`; (b) resolver → always `true`; (c) override ignored (`opts.icm ??` → capability only, dropping the override). Capture each transcript. (c) must turn **both** the `minimal` `generate:false` block (3.10) **and** 3.10b's `icm:false` case red — that pair is the proof that §6.1's override is honoured in both directions. **Result: (a) 8 red · (b) 3 red · (c) 8 red**, (c) including both required halves. Two findings: (b) reddens **only** `icm-default.test.ts`, never `icm-off.test.ts` (structural — see 3.5 above), and the CLI stdout guard is only trustworthy after `npm run build` because `dist/` is gitignored (`.gitignore:2`) and `icm-default.test.ts:31` spawns `dist/bin.js`. CI builds first (`ci.yml:151-153`), so CI is unaffected; a local bare `vitest run` grades a stale artifact.

**Proof artifact:** `02-proofs/02-task-03-proofs.md`.

**Vacuity falsified before the repoint (task 3.0's own proof requirement):** the
*original* `icm-off.test.ts` (`git show HEAD:…`) run against the new `src/` gives
`3 failed | 2 passed (5)` — the 2 survivors are the pair task 1.0 predicted would
pass for the wrong reason, comparing `icm: undefined` against `icm: true` on a
template where `undefined` now resolves to `true`. Measured, not predicted.

**Local gates (task 3.0):** `npx vitest run` (package) **666 passed | 2 skipped
(668)**, 52 files passed — the 7 premise-dies failures task 1.0 reported are gone,
count up 12 as the repointed/added guards landed. `vertical-tour.mjs` →
`19/19 verticals HEALTHY, 2/2 ICM trees OK`. No `src/` change in this task
(one temporary probe, deleted; `shasum` of `src/index.ts` verified unchanged after
every mutation), so `build`/`lint`/`healthcheck` carry over from 1.0/2.0.

**Deliberately not closed:** 3.13, blocked on 4.0's message rewrite as its own
text specifies. `validate.test.ts:206-216` still asserts on the string 4.2 will
replace.

### [ ] 4.0 `doctor` distinguishes capable-but-tree-less from non-capable

#### 4.0 Proof Artifact(s)

- Test: `npx vitest run __tests__/validate.test.ts` — three cases pass (capable/tree-less → `WARN`; non-capable → `SKIP`; pre-removal → carve-out) demonstrates all branches
- CLI: `npx metaharness validate <capable-tree-less-dir>` → `WARN` (not `FAIL`) and the detail **names the template** demonstrates the new signal is actionable
- Grep: `grep -rn "not generated with --icm" src/` → no hits demonstrates both literals were caught, not just the one Q4 rewords
- Diff: the `manifest.template` read (`:271`) moving above the `:266-269` early return demonstrates the fix is a reorder, not new persisted state

#### 4.0 Tasks

- [ ] 4.1 In `runIcmStructure`, hoist the `manifest` read and `String(manifest.template ?? '')` above the `isIcm` early-return so the catalog entry is reachable before a SKIP is emitted.
- [ ] 4.2 Replace the single SKIP message with three branches: **capable + tree-less** → `WARN`, naming the template; **non-capable** → `SKIP`; **pre-removal** (capable template, no tree, `generatorVersion` below the flip) → `SKIP` with a carve-out detail. Keep `code: 0` for all non-failing branches; do **not** promote to `FAIL` (Q4).
- [ ] 4.3 Define the flip version as a named constant (`FLIP_VERSION`) set to the release cut in 6.6, and read it against `manifest.generatorVersion` (already recorded at scaffold time). Document that an absent/unparseable version takes the **carve-out** path — fail toward silence, not toward a false WARN.
- [ ] 4.4 Reword **both** `--icm` literals in `validate.ts` and the two doc comments (the file's own comment claiming "a flagless harness is unaffected" is now wrong).
- [ ] 4.5 Update `validate.test.ts`: retarget `:206` (non-capable → SKIP) and add the capable-tree-less → WARN case plus the pre-removal carve-out case. Update `makeIcmDir()`'s comment, which explains `isIcm` as "generated with `--icm`".
- [ ] 4.6 Confirm `runIcmStructure` still PASSes a real capable tree (no regression in the happy path) — `icm-optin.test.ts:260` and `icm-scaffold.test.ts` are the existing coverage.

### [ ] 5.0 `upgrade` regression guard and the residual question count

#### 5.0 Proof Artifact(s)

- Test: `npx vitest run __tests__/upgrade.test.ts` — a committed pre-removal flagless `vertical:coding` fixture yields a `removed` count of `0` for ICM paths demonstrates no retro-added files (SC5)
- Test: `scanResiduals` on the capable tree returns the **measured** distinct-question count, not the raw marker-token count demonstrates the number now means "unanswered questions"
- CLI: `npx metaharness validate <dirty-icm-dir>` → residual line reads `N ICM question(s)` where `N` matches the measured count demonstrates the operator-facing string matches the new semantics
- Grep: `grep -n "icmEnabled" src/upgrade-cmd.ts` → unchanged, with its new load-bearing comment demonstrates F2's naming split was applied without collapsing the two resolvers

#### 5.0 Tasks

- [ ] 5.1 Capture the pre-removal baseline: scaffold a flagless `vertical:coding` harness from the **pre-flip** behaviour, strip the timestamp, and commit it under `__tests__/fixtures/icm-preremoval/` with its manifest recording **no** ICM paths. (Precedent: spec 01's `arc-pre-removal-tools.json` — a committed baseline is what makes the claim auditable.)
- [ ] 5.2 Add the SC5 regression test: run `upgradeCmd` against that fixture and assert **zero** ICM files are reported as added *or* removed. State in the test comment that this holds only because `icmEnabled(manifest)` reads the harness, not the CLI.
- [ ] 5.3 Comment `upgrade-cmd.ts:44` as load-bearing: a pre-removal harness has no ICM paths in its manifest, so a capability-derived re-render would add 10 files to a harness the user never opted into. Do **not** change its behaviour.
- [ ] 5.4 **Measure before pinning** (spec §4.1). Run the capable scaffold flagless and count (i) distinct *unanswered* catalog question ids and (ii) raw `scanResiduals` markers. Expected shape: 8 tokens today, 6 questions after the fix — but **record what you measure**, not what the spec predicts. The criterion is the semantics; the number is an output of implementation.
- [ ] 5.5 Give `scanResiduals` an optional known-question-id set (the catalog's `icm.questions`) and count only markers whose id is a **real question**; report `{{?COND}}` / `{{/COND}}` conditional markers through the structural report instead of the question count. Preserve its split from the walker's `unresolved[]` (lowercase Mustache) — the doc comment at `:315-319` explains why folding them would double-report.
- [ ] 5.6 Update the callers in `scaffold()`'s per-file pass to supply the id set; keep the batch entry point working.
- [ ] 5.7 Update the residual message string to say "question(s)" and add tests for `vertical:coding` and `minimal` (different question counts), plus an assertion that a conditional marker is **not** counted as a question.
- [ ] 5.8 Record the measured value in the task proof and in the changelog-facing note. If it differs from what §4.1 anticipates, say so plainly rather than adjusting the measurement to fit — the spec now states semantics and defers the number, so a mismatch is a finding, not a failure.

### [ ] 6.0 CI tour, supersession record, and release

#### 6.0 Proof Artifact(s)

- CLI: `node examples/vertical-tour/vertical-tour.mjs` → exit 0, ICM pass `2/2 OK` demonstrates the CI gate survives the resolution change (`minimal` still emits *under the explicit override*, which is F1's whole point)
- CLI: `node examples/vertical-tour/vertical-tour.mjs` → the capable template's **flagless** default is asserted somewhere in CI demonstrates the new default is not untested (the ICM pass uses the override, so it alone cannot cover this)
- Diff: `docs/adrs/ADR-285-*.md` exists with `Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`; `docs/adrs/INDEX.md` carries the row annotation; `ADR-279` and `ADR-282` bodies are untouched demonstrates supersession by follow-on per `INDEX.md:359`
- CLI: `node scripts/healthcheck.mjs` → PASS, including `catalogCount` cross-language sync demonstrates the structural gate is unaffected
- CLI: `node scripts/preflight.mjs` → PASS demonstrates the repo's own release gate is green
- Diff: `CHANGELOG.md` leads with the breaking default change and the version is `minor` demonstrates the break is stated in words (spec §4.1)

#### 6.0 Tasks

- [ ] 6.1 Re-run the tour's ICM pass and confirm `minimal` and `vertical:coding` both still pass (F1's acceptance test at the CI level). If `minimal` fails, the override was dropped somewhere — fix the code, not the assertion.
- [ ] 6.2 **Close the default-coverage hole.** Add a flagless capable-template assertion to a CI-visible check (the tour's main pass or `healthcheck.mjs`) so the new default is exercised. Without this, every CI assertion about ICM uses the explicit override and the *default* — the entire point of the change — is untested.
- [ ] 6.3 Rewrite the tour's ICM-pass rationale (`:81-87`, `:85`, `:192`, `:229`): it justifies the separate pass by "the flagless path is the byte-equality guarantee". Keep the separate pass (it prevents ambiguous file counts), retire the reason, and state the new one — the override-driven pass proves per-template emission while 6.2 proves the default.
- [ ] 6.4 Write `docs/adrs/ADR-285-<slug>.md` with the `Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand` header. Record: the capability predicate and why two conjuncts; the override's survival and why (`walkTemplate` has two callers); F1 explicitly (that a bare capability default would have made `minimal`'s tree unemittable); and the honest phrase **byte-equality retired, capability-preservation substituted**.
- [ ] 6.5 Add the `INDEX.md` row annotation for ADR-279 following the `:339` precedent. Do **not** edit ADR-279's or ADR-282's body (`:359`); cross-reference ADR-282's now-false "still holds" sentence from ADR-285 instead.
- [ ] 6.6 Bump the package version (`minor`) and write the `CHANGELOG.md` entry, leading with the breaking default change and naming the two affected templates.
- [ ] 6.7 Update `README.md`, `docs/USERGUIDE.md`, `docs/ARCHITECTURE.md`, `examples/README.md`, and `examples/icm-onboarding/answers.example.json` to drop flag references and state that ICM follows the template.
- [ ] 6.8 Run the full local gate in the repo's documented order: `npm run build` → `npm --prefix packages/create-agent-harness test` → `node scripts/healthcheck.mjs` → `node scripts/path-guard.mjs` → `node scripts/check-runner-coverage.mjs` → `node examples/vertical-tour/vertical-tour.mjs` → `node scripts/preflight.mjs`. Capture output as proof.
- [ ] 6.9 Record the residual prose surfaces not covered by code: `docs/specs/01-*/01-spec-*.md` and the historical ADR bodies are **left alone** (historical records). Note them so a later grep does not read them as misses.
