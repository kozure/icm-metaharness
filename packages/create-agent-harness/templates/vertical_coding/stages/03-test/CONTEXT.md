# Stage 03: Test

Prove the change does what the plan said it would, and cannot silently stop doing it.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Previous stage | `../02-implement/output/[topic-slug]-implementation.md` | Full file | The change under test |
| Earlier stage | `../01-plan/output/[topic-slug]-plan.md` | "Goal" and "Interface" sections | The acceptance criteria |
| Project | `{{TEST_COMMAND}}` | Full value | How to run the suite |

## Process

1. Read the implementation summary and the acceptance criteria from the plan
2. Write the test the change needs: the happy path, the boundary, and the one failure most likely to regress
3. Mirror the project existing test style and runner
4. Run the test command above
5. Run the audit checks below. If any fail, revise before saving
6. Save to output/

{{?FIX_LOOP}}
## Fix Loop

| Outcome | Next |
|---------|------|
| Suite green | Continue to the audit below |
| Suite red | Return to the implement stage contract with the failing case named |
| Case ambiguous | Present the case to the human before changing code |
{{/FIX_LOOP}}

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
| Test report | `output/[topic-slug]-test-report.md` | Command run, result, cases added |
