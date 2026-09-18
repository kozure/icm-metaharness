# list-templates (Codex skill)

Answer "what can I build?" in one command. Prints the canonical template
catalog — **20 templates** with their category, pod shape, and a one-line
description of what each scaffolds.

Where [`create-harness`](../create-harness/) walks the full wizard and
[`example-harness`](../example-harness/) maps a use-case onto a published
`@metaharness/*` wrapper, this skill is pure discovery: it lists, it does
not scaffold.

## What it does

Runs the published CLI's own `--list` surface and prints it verbatim:

```bash
npx --yes metaharness@latest --list
```

Exit 0. Read-only — no prompts, no arguments, no writes. The **dispatch
surface is the CLI itself**, so the command can never go stale. The tables
below are a rendering of that output for readers — if a template is ever
added or retired, `/list-templates` still prints the truth; only this README
lags. (Which is why the tables are labelled with the version they were read
from.)

## Install

```bash
mkdir -p ~/.codex/skills/list-templates
curl -fsSL https://raw.githubusercontent.com/ruvnet/agent-harness-generator/main/.codex/skills/list-templates/skill.toml \
  -o ~/.codex/skills/list-templates/skill.toml
```

No MCP server needed — the CLI runs via `npx`.

## Use

```
/list-templates
```

## The 20 templates

Grouped by the CLI's own category headers, in catalog order. The pod shape
is `agents/skills/commands`. Read from `metaharness@0.4.16`; for the live
list, just run the command.

### Starter

| Template | Pod | What it gives you |
|---|---|---|
| `minimal` | 0a/0s/1c | The bare scaffold — learn the system, then grow into a vertical. |

### Operations · Engineering · Knowledge · Finance · Customer

| Template | Category | Pod | What it gives you |
|---|---|---|---|
| `vertical:devops` | Operations | 4a/0s/1c | 4 on-call agents + alerts & runbook-store MCP servers + guarded kubectl perms. |
| `vertical:coding` | Engineering | 4a/1s/2c | Architect → implement → review → test, with a code-index MCP and push-guarded git perms. |
| `vertical:research` | Knowledge | 6a/0s/1c | Scout → search → grade → synthesize → fact-check → cite, with web-search & dossier MCPs. |
| `vertical:trading` | Finance | 5a/0s/1c | Watch → signal → risk-gate → execute (paper) → postmortem, with circuit-breaker safety. |
| `vertical:support` | Customer | 4a/0s/1c | Triage → KB-search → respond → escalate, with a KB-RAG MCP and abstain-not-hallucinate policy. |

### Professional · Business · Growth

| Template | Category | Pod | What it gives you |
|---|---|---|---|
| `vertical:legal` | Professional | 3a/0s/1c | Redline → citation-check → risk-rate, with a citation-search MCP. Always defers to a licensed human. |
| `vertical:business` | Business | 3a/1s/1c | Analyst → strategist → ops-coordinator, with a metrics MCP for KPI grounding. |
| `vertical:crm` | Customer | 3a/1s/1c | Qualify → manage → watch-churn, with a CRM-store MCP and lifecycle memory. |
| `vertical:marketing` | Growth | 3a/1s/1c | Strategy → content → SEO, with an analytics MCP for grounding claims in real traffic. |
| `vertical:advertising` | Growth | 3a/1s/1c | Media-plan → copy → performance, spanning digital (PPC/social) and traditional (print/OOH/radio). |

### Engineering · Frontier · Knowledge

| Template | Category | Pod | What it gives you |
|---|---|---|---|
| `vertical:ai` | Engineering | 4a/1s/1c | Curate → train → evaluate → deploy, with an experiment-tracking MCP and eval gates. |
| `vertical:agentics` | Frontier | 4a/2s/1c | Orchestrator → planner → workers → critic, with a swarm-bus MCP and shared memory. |
| `vertical:ruview` | Knowledge | 3a/2s/1c | Index → retrieve → review, on a ruvector HNSW store with emergent-time decay. |
| `vertical:health` | Professional | 3a/1s/1c | Intake → triage → coordinate, with a knowledge MCP. Hard-codes "see a clinician" for anything clinical. |
| `vertical:gaming` | Frontier | 4a/2s/2c | Playtest reader → balance critic → economy modeler → narrative keeper over per-build telemetry memory. |
| `vertical:sales` | Customer / Growth | 4a/2s/2c | Prospect → qualify → demo → close with hidden-pain framework + objection-handling memory. |
| `vertical:education` | Knowledge | 4a/2s/2c | Tutor → explain → quiz → grade, over per-learner mastery memory with an abstain-not-hallucinate policy. |
| `vertical:repo-maintainer` | Engineering | 4a/2s/3c | Maintainer triages the diff → benchmarker reports regressions → release drafts the GH release body → security flags risky MCP grants. Drop into any repo and run. |
| `vertical:exotic` | Frontier | 3a/2s/1c | Hypothesizer → experimenter → federator over a witness-signed evolution log (ADR-014). |

## After picking one

```bash
npx --yes metaharness@latest my-bot --template vertical:coding
```

Then, in the new directory:

```bash
npm install
npx harness doctor      # health-check
npx harness validate    # full umbrella gate
```

## ICM overlay

Exactly two templates ship a `.icm/` overlay — the other 18 have none, so
ICM (five-layer context tree) generation is unavailable for them:

| Template | Tree | Emitted by default? |
|---|---|---|
| `minimal` | 3 stages, 3 questions | **No** — `generate: false` |
| `vertical:coding` | 4 stages, 6 questions | Yes |

`minimal` *carries* a real tree but does not emit it (its catalog entry is
`generate: false`); `vertical:coding` is the one template that scaffolds an
ICM tree with no extra flag. This is no longer a per-invocation choice — the
**template's capability governs**, and `--icm` / `--no-icm` were removed
from the CLI (ADR-285: silently ignored, not rejected). "Carries a tree" and
"emits a tree" are deliberately distinct predicates — see `isIcmCapable` vs
`resolveIcmDefault`, and ADR-285 §"Two resolvers".

- [ADR-279 — fork-pin policy, ICM opt-in, CLAUDE.md ownership](../../../docs/adrs/ADR-279-fork-pin-policy-icm-optin-claudemd-ownership.md) — the five-layer reference and the original default-off rationale (d2).
- [ADR-285 — ICM default-on, capability-derived emission](../../../docs/adrs/ADR-285-icm-default-on-capability-derived-emission.md) — why emission follows the template, not a flag.
