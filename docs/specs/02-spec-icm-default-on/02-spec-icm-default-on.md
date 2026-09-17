# Spec 02 — ICM Flag Removal: ICM Becomes Automatic for Capable Templates

**Status:** DRAFT (Phase 1 — round 1 answered; ready for Phase 2)
**Feature:** `create-agent-harness` CLI, ICM generation default
**Supersedes:** ADR-279 §2 (`--icm` opt-in, off by default, byte-equality guarantee)
**Amends:** ADR-279 §3 rationale (single authorship of root `CLAUDE.md`); §1 and §4 stand
**Depends on:** Spec 01 (remove-ui-components) — COMPLETE
**Author:** alfred
**Date:** 2026-09-16

> **Revision note.** This spec was drafted on the premise "promote `--icm` to
> default-on". Round 1 of questions changed the scope: **the flags are to be
> removed entirely** — "there should not be any `--icm` or `--no-icm` flags, that
> is the point of this work." §1–§8 below are rewritten to that frame. The
> answered round is recorded in `02-questions-1-icm-default-on.md`.

---

## 1. Problem Statement

ICM (the five-layer *Intent / Context / Memory* tree) is **opt-in** via a boolean
flag on a CLI whose other flags are per-capability:

```
create-agent-harness my-bot --template vertical:coding            # 20 files, no ICM
create-agent-harness my-bot --template vertical:coding --icm      # 30 files, ICM tree
```

ADR-279 deliberately chose that: emitting a five-layer tree is a *structural*
commitment a first-time user should make knowingly, and opt-in kept the fork's
default output byte-identical to upstream so the merge stayed additive.

**That decision is now spent, and the flag is being removed rather than
defaulted.** Two facts drive it:

1. **The capability marker already exists.** `templates/catalog.json` carries an
   `icm` block per template. "Which templates can emit ICM" is *already declared
   data* — so a flag is a second, redundant way to ask a question the catalog has
   already answered.
2. **The rationale for opt-in expired with the merge.** ADR-279 §2's reasoning was
   explicitly *merge economics* — "the fork's value proposition is a merge, not a
   divergence." ADR-283 and ADR-284 record this repo as **standalone**
   (`isFork: false`). With the upstream merge no longer a live goal, the
   byte-equality guarantee is protecting a destination no longer on the route.

The result is that ICM should not be *requested*; it should follow from the
template. `vertical:coding` can emit an ICM tree, so `vertical:coding` emits one.

### 1.1 The guarantee being abandoned — stated plainly

This is **not** a free reversal, and the cost is recorded here rather than
discovered later:

> ADR-279 Consequences: *"**Byte-equality without `--icm` is a hard constraint**,
> so any fork change that perturbs default output is a defect, even if ICM itself
> is correct."*

Removing the flags **deliberately abandons that constraint for capable
templates.** A `vertical:coding` scaffold changes its default output by design.
The honest framing, to be repeated in the changelog and ADR-285:

**byte-equality retired, capability-preservation substituted.**

The `upstream` remote survives with its push URL `DISABLED`; a future re-pin
would merge against a baseline this fork now knowingly diverges from. That is
accepted, and recorded so a future re-sync is not surprised by it.

## 2. Goal

A user who scaffolds an **ICM-capable** template gets ICM, and there is no flag
to remember. A user scaffolding a **non-capable** template sees no change at all.
**There is no user-facing escape hatch** — the only way to a flat harness is a
template that does not emit one.

**The internal override is a different thing, and it survives.** `scaffold()`
keeps its `icm?: boolean` parameter as a *library* override (§6.1). The CLI stops
supplying it (task 2.4), so it is unreachable from the command line and is not an
escape hatch. It exists because `walkTemplate`'s `icm` parameter has two
independent callers and cannot be removed with the flag (§3.5).

**Non-goals:**

- Making non-capable templates ICM-capable.
- Making `minimal` default-on (see §8 Q1 — `minimal` is capable but stays off).
- Preserving byte-equality with upstream (§1.1 — knowingly retired).

## 3. Verified Current Behaviour

All measured against the source, not recalled.

### 3.1 The complete flag surface to be deleted

| Site | Content |
|---|---|
| `index.ts:225-226` | `} else if (a === '--icm') { out.icm = true; }` |
| `index.ts:227-228` | `} else if (a === '--no-icm') { out.icm = false; }` |
| `index.ts:229-237` | `--answers` sets `out.icm = true` ("supplying answers implies the ICM tree") |
| `index.ts:1185` | help: `--icm  emit the ICM five-layer tree (ADR-279; default: off)` |
| `index.ts:1186` | help: `--answers <path> … (implies --icm; all questions required)` |
| `index.ts:1244` | `icm: args.icm === true, // ADR-279 d2: ICM five-layer tree, default off` |
| `index.ts:186-188` | `scaffold()` opts doc: "default OFF; `--icm` to enable … ADR-279 decision 2" |
| `index.ts:318-320` | second `icm?: boolean` doc: "Default OFF; opt in with `--icm`. Flagless output is byte-identical to upstream-at-pin — a hard constraint, not a preference." |

**Silent-ignore is the existing parser contract.** `parseArgs` has **no**
unknown-flag rejection — unmatched `-` arguments are ignored. §8 Q3 deliberately
declines to add one, so post-removal `--no-icm` exits 0 and is ignored. Recorded
as accepted, and pinned by a test (§4 SC3) so it is deliberate, not accidental.

### 3.2 There is **no capability gate** — this is the central design fact

I expected (and my first draft wrongly assumed) that ICM was gated on the
template's catalog `icm.enabled`. **It is not.** ICM is decided in exactly two
places, both a bare flag check:

```ts
:694   let rendered = await walkTemplate(dir, vars, { strict: false, icm: opts.icm === true });
:855   if (opts.icm === true) {     // headless/interactive onboarding pass
```

`catalog.json`'s `icm.enabled` is consumed only by `validate.ts` (to check an
*already-emitted* tree's stage set). **Nothing in the scaffold path consults it.**

Non-capable templates are no-ops for a *structural* reason, not a declared one:
`walker.ts:116,122` skips `.icm/` when `icm` is false, and when `icm` is true
there is simply **no `.icm/` directory to include** — so the overlay merge
(`walker.ts:69-92`) contributes nothing.

**Consequence:** the capability gate must be *introduced*, not reused. `scaffold()`
reads a raw boolean at `:694`/`:855` and never calls `loadCatalog()`
(`:134-136`), so this is a new import into that path, not a one-line predicate
swap.

### 3.3 What the flag actually does — measured

| Template | Capable? | `--icm` effect on files |
|---|---|---|
| `vertical:coding` | ✅ `.icm/` present | +10 files → `CONTEXT.md`, `references/CONTEXT.md`, `stages/{01-plan,02-implement,03-test,04-review}/CONTEXT.md` + `output/.gitkeep` |
| `minimal` | ✅ `.icm/` present | emits its ICM tree (3-stage: `01-plan`,`02-build`,`03-verify`) |
| other 18 | ❌ | **no file change** |

The 18 non-capable templates are byte-identical for files with and without
`--icm` (differences only the pre-existing nondeterministic `generated_at` stamp,
which varies run-to-run even with *identical* args).

**But `--icm` is not a total no-op on non-capable templates — it changes stdout:**

```
# flagless, vertical:devops        # --icm, vertical:devops
Scaffolded …                        Scaffolded …
Files: 18                           Files: 18
Manifest: …                         Manifest: …
                                    Onboarding: interactive (0 questions)   ← spurious
```

**Post-removal this line disappears on its own**, because the onboarding pass
becomes gated on *capability* rather than a flag, and a non-capable template has
no `icm` block — so the path is unreachable. §4 SC2 pins that rather than
assuming it.

### 3.4 Consequence for `doctor`

`runIcmStructure` (`validate.ts:248-269`) decides ICM-ness from the **manifest's
file list** (`emitted.some(p => … p.startsWith('stages/'))`), not from the flag.
Absent `stages/`, it SKIPs with the detail string `'not generated with --icm'`.
Post-removal that string is actively false — nothing is generated "with `--icm`"
any more.

**The manifest makes the two cases distinguishable for free.** `manifest.template`
is recorded at scaffold time (`emptyManifest(opts.template, …)`, `index.ts:892`),
and is already read at `validate.ts:271` (`const templateId = String(manifest.template ?? '')`)
— it is only read *after* the `isIcm` early-return at `:266-269`, so a reordering
makes the catalog entry reachable before the SKIP is emitted:

| Case | Post-removal meaning | Today's string |
|---|---|---|
| Capable template, no tree | **Anomalous** — the template always emits it now | `SKIP — not generated with --icm` (misleading) |
| Non-capable template, no tree | Normal | same string (conflated) |
| Pre-removal harness, no tree | Legitimate — old scaffold | indistinguishable, and ***not* by version** — see the amendment below |

> **Amendment (2026-09-16, implementation task 4.3 — falsified).** This row
> originally read "indistinguishable, *though* `manifest.generatorVersion` **is**
> recorded", implying the field existed and would separate the pre-removal case
> from a post-removal tree-less one. It does not, on two independent facts:
>
> 1. **The field does not exist.** `HarnessManifest` records `generator`
>    (`manifest.ts:49`). `manifest.generatorVersion` is `undefined` on every
>    scaffold this repository has ever produced.
> 2. **Even under the right name, the value discriminates nothing.** Every code
>    path stamps the hard-coded literal `'0.1.0'` (`index.ts:1313`,
>    `analyze-repo.ts:426`), and no release/build/script step threads the real
>    package version in. A pre-removal harness and a post-removal tree-less one
>    record identical bytes. Because `0.1.0` is *always* below any flip
>    constant, the prescribed predicate would have routed **every**
>    capable-tree-less harness down the silent carve-out, leaving the `WARN` arm
>    unreachable — the opposite of the intent.
>
> **What landed instead:** one honest `WARN` covering both readings, whose detail
> states them rather than guessing which one applies
> (`may be a pre-removal harness or a hand-deleted tree`). The states remain
> distinguishable to the operator and the signal names the template, which is
> SC4's real requirement; the un-computable carve-out is dropped. Evidence:
> `02-proofs/02-task-04-proofs.md` → *"Task 4.3 is falsified"*.

### 3.5 `upgrade` must keep the internal gate — this is a regression guard

`src/upgrade-cmd.ts:49` derives `icmEnabled` from **the harness's own manifest**,
not from the CLI flag. That must **survive** the removal, even though no user can
set the boolean any more.

If the walker were changed to "always include `.icm/` when the directory exists",
then `upgrade` on a **pre-removal harness** would silently retro-add the 10 ICM
files — a harness the user never opted into, mutated. The internal boolean must
remain so a pre-removal harness keeps its shape. **The flag dies; the gate
becomes internal.** §4 SC5 is a regression guard, not a fix.

## 4. Success Criteria

| # | Criterion | Verification |
|---|---|---|
| SC1 | Flagless scaffold of a **capable** template emits the ICM tree: `vertical:coding` → 30 files; `doctor` → `icm-structure PASS` | file-set check + `runIcmStructure` PASS |
| SC2 | All 18 **non-capable** templates are unaffected — files **and stdout** (no `Onboarding:` line) | file-set diff empty; stdout assertion |
| SC3 | `--icm` and `--no-icm` are **accepted and silently ignored**: exit 0, output identical to flagless | pinned by test, so the accepted behaviour is deliberate |
| SC4 | `doctor` distinguishes capable-but-tree-less (`WARN`) from non-capable (`SKIP`); the `manifest.generatorVersion` pre-removal carve-out is **withdrawn as unimplementable** (amended 2026-09-16 — see §3.4) | `runIcmStructure` unit tests, **two** cases (three prescribed; the third is un-computable) |
| SC5 | `upgrade` on a pre-removal flagless harness does **not** retro-add ICM files | `upgrade-cmd` unit test |
| SC6 | **No test left silently vacuous**; repurposed guards are mutation-falsified and the `minimal` guard is preserved (§5) | test-review checklist + red-on-mutation evidence |
| SC7 | Residual note counts **questions**, not marker tokens — the count matches the number of *unanswered* catalog-declared questions | `scanResiduals` unit test against the **measured** value |
| SC8 | **ADR-285** written (`Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`); ADR-279 row annotated in `INDEX.md`; ADR-279 body **not** edited | ADR diff + `INDEX.md:339`-style row |
| SC9 | No flag reference survives in help text, docs, or the two `icm?: boolean` doc comments, **and the help surface is guarded by a test** | `grep -- '--no-icm\|--icm'` clean across `src/`, `README.md`, `docs/` **plus** a `--help` assertion (a one-time grep guards nothing) |
| SC10 | Changelog entry **leads** with the breaking default change; version `minor` | changelog diff |
| SC11 | An explicit `icm: true` **still emits** `minimal`'s 3-stage tree, and an explicit `icm: false` suppresses `vertical:coding`'s | `icm-optin.test.ts` `generate:false` block (preserved) + a new override-honoured case, both mutation-falsified by dropping the override |

### 4.1 On SC7 — the count must be measured, not asserted

The **value** is deliberately not fixed here. Measured facts disagree with the
earlier draft's `4`:

| Measured | Value |
|---|---|
| Marker tokens in `vertical:coding`'s `.icm/` overlay | **8** (4 plain `{{…}}` + 4 `{{?COND}}`/`{{/COND}}`) |
| Questions the catalog declares for `vertical:coding` | **6** |
| What `scanResiduals` (`onboarding.ts:320-338`) counts today | every `{{SCREAMING_SNAKE}}`/`{{?COND}}` token |

So `scanResiduals` can currently return 8, and can return 6 only after the fix
(§7). Task 5.4 measures the post-fix value, and 5.8 pins that measurement — it
**must not** be bent to match a number written here. The criterion is the
semantics; the number is an output of implementation.

### 4.2 On SC10 — the version number

The flag removal **is** a breaking change: a `vertical:coding` user's default
output changes and there is no opt-out. On a pre-1.0 CLI (`0.4.16`) the
conventional reading is that 0.x *minors* already carry breaking changes, so the
release is taken as `minor` with the break **stated in words** in the changelog
rather than signalled through the number. Recorded as a deliberate choice.

## 5. The Sharp Edge — tests whose premise dies

This is the reason this is a spec and not a one-line patch.

**`__tests__/icm-off.test.ts`** exists precisely to prove "no flag ⇒ no ICM". It
builds its flagless case from `icm: undefined` and asserts the result matches a
pinned upstream baseline. After the capability flip, `undefined` resolves to
`true` for `vertical:coding` — the test would compare an ICM scaffold against an
ICM scaffold, still pass, and prove nothing. All 5 tests share this premise.

A vacuous test is worse than a failing one: it reports green while the invariant
it was written to defend has quietly died.

| File / test | Premise | Disposition |
|---|---|---|
| `icm-off.test.ts` — all 5 | flag-on ≡ flag-off byte-equality | **repurpose** → capable ⇒ tree present, non-capable ⇒ absent |
| `icm-optin.test.ts:91` "parses opt in and opt out without changing the default" | `--icm`/`--no-icm` parse | **delete** — flags gone |
| `icm-optin.test.ts:99` "emits no ICM file when the flag is absent" | flagless ⇒ no ICM | **invert** — capable ⇒ always ICM |
| `icm-optin.test.ts:198` "identical upgrade plan with and without `--icm`" | two modes, same plan | **re-scope** → pre-removal vs post-removal harness |
| `icm-optin.test.ts:216-266` "`generate:false` template" (2 tests) | `icm: true` on `minimal` emits its tree | **preserve — do not touch.** Passes only because the override survives (§6.1); it is the regression guard for that rule |
| `scaffold-e2e.test.ts:184` "byte-identical when the flag is absent" | same | **delete** — unrepurposable; the flag it would be re-pointed to does not exist |
| `validate.test.ts:206-216` `SKIP` + `/not generated with --icm/` | non-capable wording | **retarget** — the message changes to a three-way branch (§7); **seventh** premise-dies test |
| `onboarding.test.ts:220` `--icm` without config | exercises the flag | still passes (flag silently ignored on a capable template); arg is now vestigial → clean it |
| `icm-scaffold.test.ts`, `generated-templates.test.ts`, `vertical-tour.mjs:194` | catalog↔emitted-tree conformance | **untouched** — these survive and carry the real conformance weight |

> **§5 names seven files, not six.** `validate.test.ts:206-216` asserts on a string
> §7 rewrites. And one row above is a **preserve**, not a repurpose: the `minimal`
> `generate:false` block is the guard for §6.1's override rule — deleting it would
> remove the only test that catches an override being dropped.

**The substitute is strictly weaker, and must be named as such.** Byte-equality
asserted "we changed nothing by default." That property is gone by design. Its
referent — *the gate actually gates* — survives in capability form.

Repurposed tests must additionally be **mutation-falsified**: flip the resolver to
return `false` always and confirm the capable-template test goes **red**. This is
the repo's own established standard — ADR-279's test contract records the ICM
guards were *"falsified before commit: three separate mutations each turn the gate
red."* A repurposed test that passes for the wrong reason is worse than the
deleted one, so the commit message and ADR-285 must both say **"byte-equality
retired, capability-preservation substituted."**

## 6. Proposed Design

> ICM is resolved from **template capability**, not from user input. There is no
> flag. An explicit `--icm` / `--no-icm` is ignored (§8 Q3).

The capability resolver supplies the **default**. An explicit `opts.icm` — an
internal library call, never the CLI — still wins, because `minimal`'s tree would
otherwise become unemittable (§6.1).

```ts
// index.ts — replace `opts.icm === true` at the two consuming sites (:694 walk,
// :855 onboarding) and stop passing icm: at the CLI call site (:1244).
// Resolution moves INSIDE scaffold() so the library API and the CLI agree.
const useIcm = opts.icm ?? resolveIcmDefault(opts.template);

// resolveIcmDefault(templateId)
const entry = loadCatalog().find(t => t.id === templateId);
return entry?.icm?.enabled === true && entry.generate !== false;   // fail-closed
```

**The resolver lives inside `scaffold()`, not in the CLI.** Resolving at the CLI
would leave `scaffold()` and the CLI semantically different on the same template,
and `analyze-repo.ts:426` — which passes no `icm` — would quietly keep the old
behaviour. One resolver, one meaning, every caller.

**The default predicate has two conjuncts** (`icm.enabled && generate !== false`)
so that §8 Q1 falls out of the catalog as data: `minimal` is `generate: false` →
stays off by default; `vertical:coding` is `generate: true` + `icm.enabled` → on
by default. No hard-coded exception.

### 6.1 The override must survive — and this is why

`opts.icm` is **consulted before the resolver**, not replaced by it. Making the
resolver authoritative would be a silent second change with two casualties:

**Four internal callers pass `icm: true` explicitly to `scaffold()`:**

| Caller | Template | Argument |
|---|---|---|
| `examples/vertical-tour/vertical-tour.mjs:116` | `catalog.filter(t => t.icm)` → **includes `minimal`** | `icm: true` |
| `__tests__/icm-optin.test.ts:251,260` | **`minimal`** | `icm: true` |
| `__tests__/scaffold-e2e.test.ts:153`, `__tests__/icm-scaffold.test.ts:59`, `__tests__/onboarding.test.ts:86,166,309` | `vertical:coding` | `icm: true` |

`minimal` is verified as **the only `generate: false` template carrying an `icm` /
`stages` block** (3 stages: `01-plan`, `02-build`, `03-verify`). So a resolver that
overrode the argument would resolve `minimal` to `false` **by every path** — its
ICM tree would be emittable by nothing. Consequences:

1. `vertical-tour.mjs`'s ICM pass asserts stages that are never emitted → the
   `ci.yml` "vertical-tour" job (iter 88) **fails on every push**.
2. `icm-optin.test.ts`'s `generate:false template` block (2 tests) fails.

Q1 decided `minimal` stays ICM-free **by default**. It did not decide `minimal`
loses ICM **generation**. The override preserves the distinction.

**Why not remove `icm` from `scaffold()` entirely and let the four callers rely on
the default?** Because that would be a wider change than this spec mandates, and
because `walkTemplate`'s `icm` parameter has a second, independent caller —
`upgrade-cmd.ts:93` — which must keep its explicit gate (§3.5). The parameter
cannot be removed with the flag; leaving `scaffold()` able to honour it is the
smallest consistent shape.

### 6.2 Two resolvers, deliberately not merged

`upgrade-cmd.ts:49` already defines `icmEnabled(manifest)` (doc comment `:44-48`), deriving ICM-ness
from **the harness's own recorded file map**. It answers a different question:

| Resolver | Question | Source |
|---|---|---|
| `resolveIcmDefault(templateId)` | *What **should** this template emit?* | `catalog.json` |
| `icmEnabled(manifest)` | *What **did** this harness emit?* | `manifest.files` |

They are **not** deduplicated. Merging them would make `upgrade` re-render from
capability instead of from the harness's own shape — retro-adding 10 files to a
pre-removal harness (§3.5). Both carry cross-reference comments naming the other
and the distinction.

`useIcm` is then threaded to `walkTemplate` (`:694`), the onboarding gate
(`:855`), and the scaffold opts (`:1244`).

### 6.3 Alternatives considered

| Alt | Shape | Why rejected |
|---|---|---|
| **A0 — global flip** | `opts.icm !== false` | Emits the spurious `Onboarding: interactive (0 questions)` line on all 18 non-capable templates (§3.3); breaks SC2 |
| **A1 — keep the flag, default it on** | flag remains, `undefined` ⇒ on | The flag is the thing being removed; a redundant second way to ask what the catalog already declares. Repudiated in round 1 |
| **A2 — env/config opt-out** | `HARNESS_ICM=0` | A second invisible control plane for one boolean, to replace a flag being deleted for being redundant |
| **A3 — capability-derived default, override preserved (chosen)** | `opts.icm ?? (icm.enabled && generate !== false)` | Smallest change; reuses the existing marker; **also fixes** the §3.3 stdout leak |
| **A4 — capability authoritative, arg ignored** | `icm.enabled && generate !== false` | **Rejected: makes `minimal`'s tree unemittable.** `minimal` is the only `generate:false` template with an `icm` block; four internal callers pass `icm:true` to `scaffold()`, and a resolver that overrides them resolves `minimal` to `false` everywhere → the iter-88 CI gate fails and `icm-optin`'s `generate:false` block fails (§6.1) |

## 7. Impact Surface

| File | Change |
|---|---|
| `src/index.ts:225-228` | delete both flag branches |
| `src/index.ts:229-237` | delete `out.icm = true` from `--answers`; answers supply content only |
| `src/index.ts:1185-1186` | delete `--icm` help line; drop "(implies `--icm`)" |
| `src/index.ts:186-188`, `:318-320` | rewrite both `icm?: boolean` docs — no flag, no byte-equality claim |
| `src/index.ts` (resolver) | new capability-derived resolver inside `scaffold()`; thread into `:694`, `:855`, `:1244` |
| `src/validate.ts` | reorder the `manifest.template` read at `:271` above the `:266-269` early-return; three-way message (capable-WARN / non-capable-SKIP / pre-removal carve-out); **`--icm` appears in a second literal plus two doc comments** — reword all three, not just the one carrying the SKIP detail |
| `src/onboarding.ts:320-338` | count only markers whose id is a real catalog question (`icm.questions`) → `6` for `vertical:coding`; report `{{?COND}}` markers through the structural report, not the question count |
| `src/upgrade-cmd.ts` | **behaviourally unchanged, but now load-bearing**: `icmEnabled(manifest)` (`:49`; doc comment `:44-48`) must keep reading the **manifest**, and its re-render call is `:93`. Comment it as the guard against retro-adding ICM files to a pre-removal harness (§3.5, §6.2) |
| `src/walker.ts:59` | reword the `icm` option's doc comment — there is no `--icm` flag; the boolean is an internal override |
| `src/seam-driver.ts:79,480` | reword the `--icm` prose and the thrown error message (it tells a user to "scaffold with --icm first" — a flag that no longer exists) |
| `scripts/gen-templates.mjs:96-97,407` | reword "skipped unless `--icm` is passed" prose; behaviour unchanged |
| `__tests__/icm-off.test.ts` | repurpose all 5 to capability form + mutation-falsify |
| `__tests__/icm-optin.test.ts` | delete `:91`; invert `:99`; re-scope `:198`; **preserve `:216-266`** as the §6.1 override guard |
| `__tests__/scaffold-e2e.test.ts:184` | delete |
| `__tests__/validate.test.ts:206-216` | retarget off `/not generated with --icm/`; add capable-tree-less WARN + pre-removal carve-out cases |
| `__tests__/onboarding.test.ts:220` | clean the vestigial arg |
| `__tests__/fixtures/icm-preremoval/` | **new** — committed pre-removal flagless `vertical:coding` harness, the SC5 baseline |
| `examples/vertical-tour/vertical-tour.mjs` | **CI gate** — the ICM pass (`:194` filters `t.icm`, incl. `minimal`; `:116` passes `icm: true`) must still pass under §6.1; its rationale prose (`:81-87`, `:192`, `:229`) is written in terms of the retired byte-equality guarantee; `minimal` has **no other** CI coverage (main pass excludes it, `:172`) |
| `docs/adrs/ADR-285-*.md` | new; `Supersedes ADR-279 §2; amends §3 rationale` |
| `docs/adrs/ADR-282-*.md` | **body left intact** — it asserts ADR-279's byte-equality guarantee "still hold[s]", now false; corrected by cross-reference from ADR-285, not by editing (`INDEX.md:359`) |
| `docs/adrs/INDEX.md` | annotate ADR-279's row |
| `CHANGELOG.md` | `minor`; lead with the breaking default change |
| `README.md` / `docs/USERGUIDE.md` / `docs/ARCHITECTURE.md` / `examples/README.md` / `examples/icm-onboarding/answers.example.json` | remove flag references; state that ICM follows the template |

## 8. Round 1 Decisions (all answered)

| Q | Decision |
|---|---|
| 1 | **(A)** `vertical:coding` only; `minimal` stays ICM-free |
| 2 | **(B)** `generate !== false && icm.enabled`, resolved **inside `scaffold()`** |
| 3 | **(A)** non-capable templates silently unaffected; removed flags silently ignored, **no error** |
| 4 | **(B)** reword + distinguish capable-but-tree-less via `manifest.template`; pre-removal carve-out; `WARN` not `FAIL` |
| 5 | **(A)** new **ADR-285**, partial supersession — §2 **expired** (merge no longer a live goal), not overruled |
| 6 | **(A)+(B)+(C)** repurpose + mutation-falsify + non-capable silence assertion; **and preserve the `minimal` `generate:false` block** as the §6.1 override guard |
| 7 | **(B)** `minor`, changelog leads, residual note counts **questions** not tokens. **The numeric value is measured by task 5.4, not fixed here** — measurement contradicts the `4` this question's draft assumed (8 marker tokens / 6 declared questions, §4.1) |

**Accepted consequences, recorded so they are not rediscovered as defects:**

1. **Nothing in the CLI advertises ICM.** Discovery is via docs only (Q3). With
   ICM intended as the house style, the docs are now the sole discovery path.
2. **Old scripts carrying `--no-icm` fail silently** — exit 0, ICM emitted, no
   message (Q3). Deliberate.
3. **Byte-equality with upstream is retired** for capable templates (§1.1).
4. **`doctor` gains a `WARN`** where it previously passed, on a condition that can
   legitimately exist in someone's repo (Q4).
5. **`minimal` remains ICM-free by default but keeps ICM *generation* via the
   library override** (§6.1). Its tree is reachable from `scaffold({icm:true})`
   and from the CI tour, and from nothing a user can type.

## 9. Not In Scope

- The three option-C gaps (openclaw `doctor` false-issue; `examples-quickstart`
  deterministic fail; 2 stale `publish.yml` assertions) — tracked separately.
- Making non-capable templates ICM-capable.
- Making `minimal` default-on. Note it **is** capable (`.icm/` overlay present)
  and its ICM content is **hand-authored** (`catalog.def.mjs:643`,
  `generate: false`, *"the one place the single-source guarantee does not hold"*).
  If it is ever to default-on, the honest sequencing is to make it generated
  first — a separate spec.
- `upgrade` / `eject` inference logic — §3.5 already correct; SC5 guards it.
- **Removing the internal `icm` boolean** from `scaffold()` or `walkTemplate`.
  It is not a user-facing flag and cannot be deleted with the flags; two callers
  depend on it (§3.5, §6.1).
- Merging `resolveIcmDefault` with `icmEnabled` (§6.2). They are two questions.
