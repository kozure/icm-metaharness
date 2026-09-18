---
name: list-templates
description: List the available harness templates and what each one ships with. Use when the user asks "what templates are available", "what verticals does the harness generator support", or "show me what I can scaffold".
---

# list-templates

> Codex skill: the 20-template catalog, read straight from the published CLI.

## What it does

Lists every harness template `create-agent-harness` can scaffold from.

```bash
npx --yes metaharness@latest --list
```

Exit 0. Read-only — no prompts, no arguments, no writes. The **dispatch
surface is the CLI itself**, so this stays correct as the catalog grows; the
tables below are a rendering of that output, read from `metaharness@0.4.16`.

## The 20 templates

Grouped by the CLI's own category headers, in catalog order. Pod shape is
`agents/skills/commands`.

| Template | Category | Pod | What it gives you |
|---|---|---|---|
| `minimal` | Starter | 0a/0s/1c | The bare scaffold — learn the system, then grow into a vertical. |
| `vertical:devops` | Operations | 4a/0s/1c | 4 on-call agents + alerts & runbook-store MCP servers + guarded kubectl perms. |
| `vertical:coding` | Engineering | 4a/1s/2c | Architect → implement → review → test, with a code-index MCP and push-guarded git perms. |
| `vertical:research` | Knowledge | 6a/0s/1c | Scout → search → grade → synthesize → fact-check → cite, with web-search & dossier MCPs. |
| `vertical:trading` | Finance | 5a/0s/1c | Watch → signal → risk-gate → execute (paper) → postmortem, with circuit-breaker safety. |
| `vertical:support` | Customer | 4a/0s/1c | Triage → KB-search → respond → escalate, with a KB-RAG MCP and abstain-not-hallucinate policy. |
| `vertical:legal` | Professional | 3a/0s/1c | Redline → citation-check → risk-rate, with a citation-search MCP. Always defers to a licensed human. |
| `vertical:business` | Business | 3a/1s/1c | Analyst → strategist → ops-coordinator, with a metrics MCP for KPI grounding. |
| `vertical:crm` | Customer | 3a/1s/1c | Qualify → manage → watch-churn, with a CRM-store MCP and lifecycle memory. |
| `vertical:marketing` | Growth | 3a/1s/1c | Strategy → content → SEO, with an analytics MCP for grounding claims in real traffic. |
| `vertical:advertising` | Growth | 3a/1s/1c | Media-plan → copy → performance, spanning digital (PPC/social) and traditional (print/OOH/radio). |
| `vertical:ai` | Engineering | 4a/1s/1c | Curate → train → evaluate → deploy, with an experiment-tracking MCP and eval gates. |
| `vertical:agentics` | Frontier | 4a/2s/1c | Orchestrator → planner → workers → critic, with a swarm-bus MCP and shared memory. |
| `vertical:ruview` | Knowledge | 3a/2s/1c | Index → retrieve → review, on a ruvector HNSW store with emergent-time decay. |
| `vertical:health` | Professional | 3a/1s/1c | Intake → triage → coordinate, with a knowledge MCP. Hard-codes "see a clinician" for anything clinical. |
| `vertical:gaming` | Frontier | 4a/2s/2c | Playtest reader → balance critic → economy modeler → narrative keeper over per-build telemetry memory. |
| `vertical:sales` | Customer / Growth | 4a/2s/2c | Prospect → qualify → demo → close with hidden-pain framework + objection-handling memory. |
| `vertical:education` | Knowledge | 4a/2s/2c | Tutor → explain → quiz → grade, over per-learner mastery memory with an abstain-not-hallucinate policy. |
| `vertical:repo-maintainer` | Engineering | 4a/2s/3c | Maintainer triages the diff → benchmarker reports regressions → release drafts the GH release body → security flags risky MCP grants. |
| `vertical:exotic` | Frontier | 3a/2s/1c | Hypothesizer → experimenter → federator over a witness-signed evolution log (ADR-014). |

## Hosts

Host support is **orthogonal to template** — every template scaffolds for
all 10 host adapters:

`claude-code` · `codex` · `pi-dev` · `hermes` · `openclaw` · `rvm` ·
`copilot` · `opencode` · `github-actions` · `prime-agent`

Selected with `--host <id>` (default `claude-code`). There is no
per-template host restriction.

## ICM overlay

Exactly two templates ship a `.icm/` overlay — the other 18 have none, so
ICM (five-layer context tree) generation is unavailable for them:

| Template | Tree | Emitted by default? |
|---|---|---|
| `minimal` | 3 stages, 3 questions | **No** — `generate: false` |
| `vertical:coding` | 4 stages, 6 questions | Yes |

`minimal` *carries* a real tree but does not emit it; `vertical:coding` is
the one template that scaffolds an ICM tree with no extra flag. The
template's capability governs — `--icm` / `--no-icm` are not accepted
(ADR-285: silently ignored, not rejected). See ADR-279 d2 for the
five-layer reference and the original default-off rationale.

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

## Related packages

`@metaharness/vertical-base` and `@metaharness/vertical-trading` ship as
standalone npm packages today, so a pack can be owned by a domain expert.
[ADR-013](../../../docs/adrs/ADR-013-vertical-packs-publishing.md) defines
the publishing pattern for the rest.

## See also

- [ADR-013 — vertical packs publishing](../../../docs/adrs/ADR-013-vertical-packs-publishing.md)
- [ADR-016 — migration for ruflo users](../../../docs/adrs/ADR-016-migration-for-ruflo-users.md)
- [ADR-279 — fork-pin policy, ICM opt-in, CLAUDE.md ownership](../../../docs/adrs/ADR-279-fork-pin-policy-icm-optin-claudemd-ownership.md)
- [ADR-285 — ICM default-on, capability-derived emission](../../../docs/adrs/ADR-285-icm-default-on-capability-derived-emission.md)
