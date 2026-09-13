# Stage 01: Plan

Turn a request into a reviewable plan before any code is written.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| User | (conversation) | The requested change | The starting point |
| Project | `{{PROJECT_GOAL}}` | Full value | Scope and success criteria |
| Reference | `../references/CONTEXT.md` | "What to Load" | Where the build conventions live |

## Process

1. Restate the goal in one sentence, using the project goal above as the scope boundary
2. List the files to touch and why each one changes
3. Name the smallest interface that satisfies the goal
4. Flag anything that ripples beyond three files or widens a permission
5. Run the audit checks below. If any fail, revise before saving
6. Save to output/

{{?SUBAGENT_HANDOFF}}
## Subagent Handoff

| Agent | Receives | Returns |
|-------|----------|---------|
| `architect` | The request and this stage inputs | The plan written above |

Hand the plan on. Do not write code in this stage.
{{/SUBAGENT_HANDOFF}}

## Checkpoints

| After Step | Agent Presents | Human Decides |
|------------|---------------|---------------|
| 4 | The plan: files, interface, ripple flags | Approve, amend, or redirect before code is written |

## Audit

| Check | Pass Condition |
|-------|---------------|
| Single sentence | The goal is restated in one sentence with no hedging |
| File list | Every file named has a stated reason |
| Smallest interface | The interface is the smallest one that satisfies the goal |
| Ripple flag | Any change beyond three files is called out explicitly |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Implementation plan | `output/[topic-slug]-plan.md` | Goal, files, interface, ripple flags |

The plan in `output/` is the human edit surface. Amend it there; the next stage reads the file, not this contract.
