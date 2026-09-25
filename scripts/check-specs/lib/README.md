# check-specs — what each checker sees, and what it cannot

Four checks, run by the `openspec-check-specs` bin (`../index.mjs`). The design
behind them, with diagrams, is in [`docs/checker.md`](../../../docs/checker.md).

## The boundary, first

**None of these checks reads application code.** They compare specifications
against specifications, plus whatever a consumer's deriver extracts. So no check
here can tell you whether a requirement is still _true_ — only whether the files
are structurally sound, whether applying a delta would throw something away,
and whether a declared inventory still matches what the deriver returns.

The worked example comes from the repository this package was extracted from. A
capability's Purpose stated that squash-merge turns the PR title into the
commit message. The repository had rebase-merged for weeks, so the title never
reached history — the sentence was simply wrong. Every check in this directory
passes on such a file, and always will. That class of drift needs a reader,
which is what the mandatory Docs task group in each change is for.

This is the same boundary a documentation checker states: inventories, never
prose.

## `scenarios` — a delta cannot silently discard a scenario

`lib/scenarios.mjs`

A MODIFIED requirement replaces its live counterpart **in full**, so a scenario
omitted from the delta is deleted. Nothing in the diff shows it: the delta looks
complete on its own, and the deletion only exists relative to a file the
reviewer is not looking at.

- Compares by **scenario name**. Rewording a scenario's body is a modification,
  not a removal, and is not reported.
- Only `MODIFIED` is checked. `ADDED` has no counterpart to lose, and `REMOVED`
  / `RENAMED` do not replace wholesale.
- A `MODIFIED` requirement naming something absent from the live spec is its own
  finding — usually an `ADDED` requirement filed under the wrong header.
- Only **unarchived** changes are inspected. Once archived, the delta has been
  applied and is history.
- Runs **before** the archive, against the live spec, so it fails before the
  destructive operation rather than reporting a scenario already gone. It needs
  no git history.

Deliberate removals are marked, never inferred:

```
<!-- drops-scenario: <Requirement name> :: <Scenario name> -->
```

**Placement is load-bearing.** The marker must sit above the first `##` header.
`openspec archive` applies requirement blocks, so a marker written inside a
requirement is copied into the main spec — a note to a checker, embedded in a
behaviour contract. Markers below that line are ignored, so the check stays red
until the marker is moved. Each marker names one scenario: silencing one
omission cannot silence another in the same requirement.

## `duplicates` — one requirement name per specification

`lib/duplicates.mjs`

Archiving applies a delta **by requirement name**. A name appearing twice means
one was applied on top of a capability that already held it, and the copies
drift as soon as a later delta modifies one of them. The known route in is
hand-editing a main spec instead of letting `openspec archive` apply the delta.

The same name in two different capabilities is fine — capabilities are
independent.

## `inventories` — a declared enumeration is held to the code

`lib/inventories.mjs`

A capability that claims to enumerate something from the code is compared
against it, both directions: an item in the code the list omits, and an item in
the list the code no longer has.

Opt in with a marker **inside the requirement that makes the claim**:

```
<!-- enumerates: routes -->
```

**Placement is the inverse of `drops-scenario`, deliberately.** `openspec
archive` copies a requirement's body into the main spec. A drop marker describes
one change and must not be carried across, so it lives above the first `##`. An
inventory declaration is a permanent property of the capability and has to
survive, so it lives where archive will carry it. What generalises is not
"markers go at the top" — it is whether the marker describes the change or the
capability.

Limits:

- **Only a declared inventory is checked.** A capability mentioning a route in
  passing is not claiming completeness, and treating it as one would make every
  incidental mention a maintenance burden. An inventory nothing declares passes
  silently — deciding it deserves a capability is a judgement, not a defect. So
  this check cannot tell you that something *should* be specced, only that a
  stated claim has stopped being true.
- **This package derives nothing itself.** Every inventory comes from a deriver
  module the consumer configures in `openspec-flow.json`. The module
  default-exports `(root) => string[]` and may export `normalise(item) => string`,
  which is applied to **both** sides — normalising only the derived side reports
  every difference of spelling as drift.
- A deriver that is missing, exports no function, or throws is a finding rather
  than a silent pass — a deriver that cannot run must not read as "nothing
  drifted".
- A declaration naming an inventory nothing derives is its own finding rather
  than a silent pass — a misspelled marker would otherwise leave the claim
  unenforced while looking enforced.
- Listed items are read from the declaring requirement's prose before its first
  scenario, as backticked `METHOD path` entries (`GET|PUT` expands to two). The
  item format is route-shaped today.
- If the repository also has a documentation checker comparing the same
  inventory, point both at the same deriver, so the two cannot disagree about
  what an item is.

## `strict` — openspec's own validator

`lib/validate.mjs`

Shells out to `openspec validate --specs --strict` rather than reimplementing
it. Strict validation is the tool's contract and moves with the tool; a local
copy would diverge from whatever it means next month.

- This is the **only** check needing the CLI. `scenarios` and `duplicates` are
  text over files, and `inventories` adds only the consumer's deriver. That is
  why the consumer repository should pin `@fission-ai/openspec` as a
  devDependency — note the scope: the bare `openspec` on npm is an unrelated
  stub at `0.0.0`.
- The CLI is resolved with `npx --no-install`. A CLI that cannot start is
  reported as a failure (status `127`), never as "validation passed".
- A zero exit passes regardless of output. `[INFO]` notices about long
  requirement text are advice, not defects, and must not redden the build.
- A non-zero exit whose output names no failing item still fails, printing the
  tail. A check that goes quiet when it stops recognising its own tool's output
  is worse than one that prints too much.

## Shape

`index.mjs` owns every read and the one subprocess call. Every module here is a
pure function over text, which is why they are unit-tested without fixtures on
disk. Same split as a documentation checker.

Run the tests with `npm test` — not `node --test scripts/check-specs/`, which
fails on Node 22 and 24 (a glob fails on Node 20). See the comment in
`run-tests.sh`.
