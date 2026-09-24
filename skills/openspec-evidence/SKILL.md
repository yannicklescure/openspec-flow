---
name: openspec-evidence
description: Watch a check fail before trusting it. Use when adding a test, guard, linter rule or CI check, when writing acceptance criteria for a task, or whenever about to record that something passed.
version: 0.1.0
---

# Watch it fail first

A check that has never been observed failing is a check whose passing means
nothing. Before recording that a guard works, make it red on purpose and read
what it says.

This is not ceremony. Every real finding in the session that produced this
plugin came from it:

- A `fetch` stub that threw on any call left **the entire suite green**. Every call
  site was a TanStack Query `queryFn`, and Query caught the rejection into an
  error state that a loading-state assertion never inspects. Throwing changed
  nothing anything could see. The fix was to *record* the attempted URL and
  assert in `afterEach` — a different design, reached only because the obvious
  one was watched and found silent.
- A `pre-push` hook addition appeared not to work: the push succeeded while the
  hook body, run directly, exited 1. In a git worktree `core.hooksPath` resolves
  to the **main** checkout, so the edited hook was never the one git ran. Test a
  hook change with `git -c core.hooksPath=.husky push` to a local bare repo,
  scoping the override to one command.
- A sweep reported a CI job as having `fetch-depth: 0`. It did not — the string
  appeared inside that job's own comment explaining its absence. Parse structure,
  do not grep prose.

## How to watch

- Break exactly one thing, and confirm the report names **that** thing and
  nothing else. A check that reports collateral findings gets ignored.
- Probe the boundary in both directions: the case that must fail, and the
  adjacent case that must pass. A guard that fires on everything is as useless
  as one that fires on nothing.
- Restore, and confirm green again. State the restore; a probe left behind is a
  defect shipped.
- Prefer an existing test to a new probe. Looking for coverage before writing
  one found a test already named "fails fast when X is missing" — better evidence
  than any probe, and it revealed that the behaviour was tested, documented, and
  specified nowhere.

## Green that means nothing

Three ways a passing check can be vacuous:

1. **Nothing declared it.** A comparison against a declared inventory passes
   trivially while the declaration sits in an unarchived delta the checker cannot
   see. It only has teeth once applied.
2. **The tool never ran.** A subprocess that fails to launch returns a null
   status. Treat that as a failure, loudly — never as "validation passed".
3. **The output format changed.** A checker that stops recognising its own tool's
   output should print the tail and fail, not go quiet. Silence looks identical
   to success.

Write acceptance criteria as observations, not assertions: "the linted set is
enumerated, not assumed", "a ratio, not an assertion", "three observed outcomes".
