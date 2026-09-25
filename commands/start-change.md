---
name: start-change
description: Open the OpenSpec change flow for a named change — answer whether it deserves a change, verify the tree, base and name, then establish that the documented order binds until /stop-change.
---

Open the flow for one named OpenSpec change. Take the name from the argument and
**refuse without one**. Nothing is inferred here. A flow that can open itself is
the state this command exists to end: a change used to begin because an agent
started behaving as though one had begun, which left no moment at which the
order of the steps was established as binding.

**1. Answer the question out loud: does this deserve a change?**

This is the gate. It is the one decision in the flow that was never gated and
*caught something most of the time* — see `openspec-change-flow`. So it is
answered in words, before any check below runs: what the change is for, and what
would be true when it is done. If the answer is no, say so and stop. The checks
that follow do not decide that; they only refuse to open the flow in a state
where its later steps would measure the wrong thing.

**2. Refuse a dirty tree.**

```bash
git status --porcelain
```

Anything printed is reported, and the flow does not open.

Earns its place because the flow stages explicit paths, never `git add <dir>` —
and that rule is load-bearing only when there is unrelated work in the tree for
a directory add to sweep in. Opening on a clean tree means every path that
appears afterwards belongs to this change, so the commit that closes it can be
read as its own file list. Pre-existing edits, committed or discarded *before*
the flow opens, are a decision someone makes knowingly. Swept into a change
commit, they are a decision nobody made.

**3. Refuse a base that is not the base CI will merge into.**

```bash
git fetch -q origin
git rev-list --count HEAD..origin/<base>
```

A non-zero count means the branch is behind. Merge the base first, then reopen.

Earns its place because delta specs are written against the live specs *as they
are on disk*. If the base has moved, the delta describes a requirement the merge
result will not have, and the `scenarios` check then compares the delta with a
spec nobody will ship: the check runs, passes, and measures the wrong thing.
That is the first kind of empty green in `openspec-evidence`, one layer up —
the comparison happened, against the wrong side.

**4. Refuse a name that has already been through the flow.**

```bash
find openspec/changes -maxdepth 2 -type d -name '*<name>*'
```

A hit under `openspec/changes/archive/` is a refusal: `openspec archive` names
the archived folder after the change, so a reused name makes the archive
ambiguous, and "was this applied?" can no longer be answered by looking.

A hit directly under `openspec/changes/` is **not** a refusal — it is a change
already proposed and not yet archived. Say so, and open the flow on that change
rather than creating a second one. Resuming is the common case after an
interruption, and refusing it would push the work back into the undeclared state
this command exists to remove.

**5. Refuse a second concurrent change, unless told otherwise.**

```bash
find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive
```

Earns its place for two reasons, one mechanical and one historical.
`/archive-on-green` infers the change name from `openspec list` when exactly one
is active, and a second active change silently removes that. And a second open
change reintroduces the defect the archive gate produced: work split across
states nobody can name, so *"which change is this commit for?"* has to be asked.

Overridable on explicit instruction — two changes in flight is sometimes the
right call — but reported either way, and the override is recorded in step 6.

**6. Record the opening.**

Report the change name, the branch, the base and its SHA, and which checks
passed (naming any that were overridden). Then state the order that now binds
until `/stop-change`:

```
propose -> apply -> open PR -> verified green -> archive -> verify the apply
  -> merge on explicit request
```

Archive comes **before** merge, and is not optional afterwards. Merge remains
the only gate inside the flow.

## Checks deliberately not here

- **Green CI on the base.** It would gate this change on someone else's red, at
  the moment least able to fix it, and a red base does not make a proposal wrong.
- **A pushed branch.** There is nothing to push at open. Pushing matters at
  abandon, which is where `/stop-change` checks it.
- **A `check-specs` run.** There is no delta yet, so it would pass with nothing
  to compare — a green that means nothing, which is worse than no check because
  it reads as reassurance.
- **`openspec` resolvable.** A real precondition, but of the repository rather
  than of this change, and it already fails loudly at `propose`.
