# Task Routing

Where to go for each kind of work. Read this on entry, then load only the stage contract you need.

## Task Routing

| Task Type | Go To | Description |
|-----------|-------|-------------|
| Plan | `stages/01-plan/CONTEXT.md` | Plan the work for this stage. |
| Build | `stages/02-build/CONTEXT.md` | Build the work for this stage. |
| Verify | `stages/03-verify/CONTEXT.md` | Verify the work for this stage. |

## Shared Resources

| Resource | Location | Contains |
|----------|----------|----------|
| Reference navigation | `references/CONTEXT.md` | What to load from Layer 3, and when |
| Stage handoffs | `stages/*/output/` | Per-run working artifacts |
| Bundled skills | `.claude/skills/*/SKILL.md` | Domain knowledge shipped with this harness |

Each stage contract owns its own scope. Start at the stage you are running and do not read ahead.
