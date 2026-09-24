---
name: openspec-spec-drift
description: How an OpenSpec specification drifts from the code and what catches it. Use when writing or reviewing a delta, when a MODIFIED requirement is involved, when deciding where a marker goes, or when a capability claims to enumerate something derived from code.
version: 0.1.0
---

# Specification drift

## The failure a MODIFIED delta hides

A `MODIFIED` requirement **replaces its live counterpart in full**. A scenario
omitted from the delta is therefore deleted — and nothing in the diff shows it.
The delta looks complete on its own; the deletion only exists relative to a file
the reviewer is not reading.

So when writing a `MODIFIED` delta, carry **every** scenario the live requirement
has. `check-specs` enforces it, comparing by scenario **name** — rewording a
body is a modification, not a removal.

A deliberate removal is stated, never inferred:

```
<!-- drops-scenario: <Requirement name> :: <Scenario name> -->
```

## Marker placement — two rules, opposite directions

`openspec archive` **copies a requirement's body into the main spec.** That one
fact decides both placements, read in opposite directions:

| marker | describes | must survive archive? | placement |
|---|---|---|---|
| `drops-scenario` | one change | no | **above** the first `##` |
| `enumerates` | the capability | **yes** | **inside** the requirement |

A drop marker is a note to a checker about one change. Copied into the main spec
it would sit inside a behaviour contract forever, so it lives above the first
`##`, where archive cannot reach it.

An inventory declaration is a permanent property of the capability and *must*
survive, so it lives where archive will carry it.

**What generalises is not "markers go at the top."** It is whether the marker
describes the change or the capability. Getting that backwards fails silently in
one direction and loudly in the other.

## The asymmetry that lets a spec rot

Where a fact is enumerated in **both** a document and a specification, and only
the document is mechanically compared against the code, the document stays right
and the specification rots. Observed: a capability declaring "this list is the
whole surface — a route that exists but is absent here is a spec defect", with a
scenario asserting the comparison holds, missing five of twenty-three routes for
six weeks. The prose documentation was correct throughout, because a docs checker
compared it and nothing compared the spec.

A capability opts in to being held to its claim:

```
<!-- enumerates: routes -->
```

Only a **declared** inventory is checked. A capability mentioning a route in
passing is not claiming completeness, and treating it as one would make every
incidental mention a maintenance burden. An inventory nothing declares passes —
deciding it deserves a capability is a judgement, not a defect.

## What no checker can tell you

None of these checks reads application code. They compare specifications against
specifications, plus whatever a configured deriver extracts. So none can say
whether a requirement is still **true**.

The worked example: a capability whose Purpose explained that squash-merge turns
the PR title into the commit message, in a repository that had rebase-merged for
seven weeks. Structurally perfect, every check green, the stated *reason* simply
false. That class needs a reader — which is what a mandatory Docs task group in
each change is for.

Two faults of that kind, found by reading and not by any tool:

- a stated reason that stopped being true (the squash/rebase one)
- something real that the capability never mentioned — a `pre-push` hook
  scanning for credentials, absent from the capability describing the hooks
