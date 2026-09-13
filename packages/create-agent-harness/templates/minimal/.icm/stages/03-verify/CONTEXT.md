# Stage 03: Verify

Prove the build does what the plan said it would.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Previous stage | `../02-build/output/[topic-slug]-implementation.md` | Full file | What was built |
| Earlier stage | `../01-plan/output/[topic-slug]-plan.md` | "Goal" and "Interface" sections | The acceptance criteria |
| Project | `{{TEST_COMMAND}}` | Full value | How to run the suite |

## Process

1. Read the change summary and the acceptance criteria from the plan
2. Write or extend a test for the happy path
3. Add a boundary case and the one failure most likely to regress
4. Run the test command above
5. Run the audit checks below. If any fail, revise before saving
6. Save to output/

## Audit

| Check | Pass Condition |
|-------|---------------|
| Suite green | The test command exits zero |
| Can fail | Every new test fails when its assertion is inverted |
| Boundary covered | At least one boundary case is asserted, not assumed |
| Behaviour, not shape | Tests assert observable behaviour, not internal structure |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Verification report | `output/[topic-slug]-test-report.md` | Command run, result, cases added |
