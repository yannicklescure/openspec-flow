# check-specs — what each checker sees, and what it cannot

Four checks, run by `npm run check:specs`. The contract is the
`spec-drift-detection` capability spec.

## The boundary, first

**None of these checks reads application code.** They compare specifications
against specifications. So no check here can tell you whether a requirement is
still _true_ — only whether the files are structurally sound and whether
applying a delta would throw something away.

The worked example is `openspec/specs/git-hooks/spec.md`. Its Purpose states
that squash-merge turns the PR title into the `master` commit message. The
repository rebase-merges, so the title never reaches history — the sentence is
simply wrong, and has been since the merge method changed on 2026-08-02. Every
check in this directory passes on that file, and always will. That class of
drift needs a reader, which is what the mandatory Docs task group in each
change is for.

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
- **Routes are the only inventory derived today.** Env keys are deliberately not
  compared: no capability declares the env set and none should, since `NODE_ENV`
  and `PORT` are infrastructure.
- A declaration naming an inventory nothing derives is its own finding rather
  than a silent pass — a misspelled marker would otherwise leave the claim
  unenforced while looking enforced.
- Routes reuse the consumer's configured deriver, so `check:docs` and
  `check:specs` cannot disagree about what a route is. That is the one place the
  two checker directories are coupled, and it is on purpose.

## `strict` — openspec's own validator

`lib/validate.mjs`

Shells out to `openspec validate --specs --strict` rather than reimplementing
it. Strict validation is the tool's contract and moves with the tool; a local
copy would diverge from whatever it means next month.

- This is the **only** check needing the CLI. The other two are text over files.
  That is why `@fission-ai/openspec` is a pinned devDependency — note the scope:
  the bare `openspec` on npm is an unrelated stub at `0.0.0`.
- A zero exit passes regardless of output. `[INFO]` notices about long
  requirement text are advice, not defects, and must not redden the build.
- A non-zero exit whose output names no failing item still fails, printing the
  tail. A check that goes quiet when it stops recognising its own tool's output
  is worse than one that prints too much.

## Shape

`index.mjs` owns every read and the one subprocess call. Every module here is a
pure function over text, which is why they are unit-tested without fixtures on
disk. Same split as a documentation checker.

Run the tests with `npm run test:specs` — not `node --test check-specs/`,
which fails on this host. See the comment in `run-tests.sh`.
