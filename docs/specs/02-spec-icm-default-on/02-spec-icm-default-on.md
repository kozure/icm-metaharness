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
**There is no escape hatch** — the only way to a flat harness is a template that
does not emit one.

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
| Pre-removal harness, no tree | Legitimate — old scaffold | indistinguishable, though `manifest.generatorVersion` is recorded |

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
| SC4 | `doctor` distinguishes capable-but-tree-less (`WARN`) from non-capable (`SKIP`), with a `manifest.generatorVersion` pre-removal carve-out | `runIcmStructure` unit tests, three cases |
| SC5 | `upgrade` on a pre-removal flagless harness does **not** retro-add ICM files | `upgrade-cmd` unit test |
| SC6 | **No test left silently vacuous**; repurposed guards are mutation-falsified (§5) | test-review checklist + red-on-mutation evidence |
| SC7 | Residual note counts **questions**, not placeholder tokens: `4 ICM placeholder(s)` for `vertical:coding` | `scanResiduals` unit test |
| SC8 | **ADR-285** written (`Supersedes ADR-279 §2; amends §3 rationale; §1 and §4 stand`); ADR-279 row annotated in `INDEX.md`; ADR-279 body **not** edited | ADR diff + `INDEX.md:339`-style row |
| SC9 | No flag reference survives in help text, docs, or the two `icm?: boolean` doc comments | `grep -- '--no-icm\|--icm'` clean across `src/`, `README.md`, `docs/` |
| SC10 | Changelog entry **leads** with the breaking default change; version `minor` | changelog diff |

### 4.1 On SC10 — the version number

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
| `scaffold-e2e.test.ts:184` "byte-identical when the flag is absent" | same | **delete** — unrepurposable; the flag it would be re-pointed to does not exist |
| `onboarding.test.ts:220` `--icm` without config | exercises the flag | still passes (flag silently ignored on a capable template); arg is now vestigial → clean it |
| `icm-scaffold.test.ts`, `generated-templates.test.ts`, `vertical-tour.mjs:194` | catalog↔emitted-tree conformance | **untouched** — these survive and carry the real conformance weight |

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

```ts
// index.ts — replace the bare `args.icm === true` at :1244 and the two sites
// that consume it (:694 walk, :855 onboarding). Resolution moves INSIDE
// scaffold() so the library API and the CLI agree on the same template.
const capable = loadCatalog().find(t => t.id === opts.template)?.icm?.enabled === true;
const useIcm  = capable && catalogEntry.generate !== false;
```

**The resolver lives inside `scaffold()`, not in the CLI.** Resolving at the CLI
would leave `scaffold()` and the CLI semantically different on the same template,
and `analyze-repo.ts:426` — which passes no `icm` — would quietly keep the old
behaviour. One resolver, one meaning, every caller.

**The predicate has two conjuncts** (`generate !== false && icm.enabled`) so that
§8 Q1 falls out of the catalog as data: `minimal` is `generate: false` → stays
off; `vertical:coding` is `generate: true` + `icm.enabled` → on. No hard-coded
exception. `loadCatalog()` already exists (`:134-136`), so this is a lookup plus a
conjunction — but it is a **new import into the scaffold path**, not a one-line
swap.

`useIcm` is then threaded to `walkTemplate` (`:694`), the onboarding gate
(`:855`), and the scaffold opts (`:1244`).

### 6.1 Alternatives considered

| Alt | Shape | Why rejected |
|---|---|---|
| **A0 — global flip** | `opts.icm !== false` | Emits the spurious `Onboarding: interactive (0 questions)` line on all 18 non-capable templates (§3.3); breaks SC2 |
| **A1 — keep the flag, default it on** | flag remains, `undefined` ⇒ on | The flag is the thing being removed; a redundant second way to ask what the catalog already declares. Repudiated in round 1 |
| **A2 — env/config opt-out** | `HARNESS_ICM=0` | A second invisible control plane for one boolean, to replace a flag being deleted for being redundant |
| **A3 — capability-derived, no flag (chosen)** | follows `icm.enabled` + `generate` | Smallest change; reuses the existing marker; **also fixes** the §3.3 stdout leak |

## 7. Impact Surface

| File | Change |
|---|---|
| `src/index.ts:225-228` | delete both flag branches |
| `src/index.ts:229-237` | delete `out.icm = true` from `--answers`; answers supply content only |
| `src/index.ts:1185-1186` | delete `--icm` help line; drop "(implies `--icm`)" |
| `src/index.ts:186-188`, `:318-320` | rewrite both `icm?: boolean` docs — no flag, no byte-equality claim |
| `src/index.ts` (resolver) | new capability-derived resolver inside `scaffold()`; thread into `:694`, `:855`, `:1244` |
| `src/validate.ts:266-271` | reorder manifest read; three-way message (capable-WARN / non-capable-SKIP / pre-removal carve-out) |
| `src/onboarding.ts:320-338` | count only names matching a real question id (`icm.questions`) → `4`; conditionals stay in the structural report |
| `src/upgrade-cmd.ts:49` | **unchanged** — but its internal-gate dependency is now load-bearing (SC5) |
| `__tests__/icm-off.test.ts` | repurpose to capability form + mutation-falsify |
| `__tests__/icm-optin.test.ts` | delete `:91`; invert `:99`; re-scope `:198` |
| `__tests__/scaffold-e2e.test.ts:184` | delete |
| `__tests__/onboarding.test.ts:220` | clean the vestigial arg |
| `docs/adrs/ADR-285-*.md` | new; `Supersedes ADR-279 §2; amends §3 rationale` |
| `docs/adrs/INDEX.md` | annotate ADR-279's row |
| `CHANGELOG.md` | `minor`; lead with the breaking default change |
| `README.md` / docs | remove flag references; state that ICM follows the template |

## 8. Round 1 Decisions (all answered)

| Q | Decision |
|---|---|
| 1 | **(A)** `vertical:coding` only; `minimal` stays ICM-free |
| 2 | **(B)** `generate !== false && icm.enabled`, resolved **inside `scaffold()`** |
| 3 | **(A)** non-capable templates silently unaffected; removed flags silently ignored, **no error** |
| 4 | **(B)** reword + distinguish capable-but-tree-less via `manifest.template`; pre-removal carve-out; `WARN` not `FAIL` |
| 5 | **(A)** new **ADR-285**, partial supersession — §2 **expired** (merge no longer a live goal), not overruled |
| 6 | **(A)+(B)+(C)** repurpose + mutation-falsify + non-capable silence assertion |
| 7 | **(B)** `minor`, changelog leads, residual note counts questions not tokens |

**Accepted consequences, recorded so they are not rediscovered as defects:**

1. **Nothing in the CLI advertises ICM.** Discovery is via docs only (Q3). With
   ICM intended as the house style, the docs are now the sole discovery path.
2. **Old scripts carrying `--no-icm` fail silently** — exit 0, ICM emitted, no
   message (Q3). Deliberate.
3. **Byte-equality with upstream is retired** for capable templates (§1.1).
4. **`doctor` gains a `WARN`** where it previously passed, on a condition that can
   legitimately exist in someone's repo (Q4).

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
