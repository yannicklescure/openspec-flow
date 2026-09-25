---
name: stop-change
description: Close the OpenSpec change flow for a named change — verify it actually reached its end — or with --abandon give the change up without destroying the work.
---

Close the flow for one named OpenSpec change. Take the name from the argument.

Two modes:

- **no flag** — the change reached its end. Verify that it did, rather than
  taking the request as evidence.
- **`--abandon`** — the change is being given up. Preserve everything first, then
  remove only what is safe to remove.

`--abandon` refuses without an explicit name. Every other step here reads state;
this one discards a proposal, and inferring *which* proposal from `openspec list`
is how the wrong one gets discarded.

Neither mode merges anything. Merge is still the gate, and still the human's.

## Closing a finished change

**1. Refuse while the change is still unarchived.**

```bash
find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive
ls -d openspec/changes/archive/*<name>* 2>/dev/null
```

A directory still under `openspec/changes/` means `openspec archive` never ran.
Report it and stop — `/archive-on-green` is the step that was skipped.

This refusal is the one with a receipt. In the session that produced this
command, a change was merged first and archived afterwards, in a second pull
request needing a second merge. That inverts step 7 of `/archive-on-green`
("stop before merging") and costs exactly the extra gate the one-gate design
exists to remove. Nothing refused it, because nothing was watching the order.

**2. Refuse while anything is still outstanding.**

```bash
git log --oneline @{upstream}..HEAD
gh pr view <n> --json state,mergedAt,mergeCommit
```

Unpushed commits: push, then reopen this. An open pull request: the change has
not reached its end — report what remains (checks running, review outstanding,
merge not requested) and hold. Do not merge to satisfy this command.

**3. Report the close.**

The change name, the archived path, the merge commit, and one line saying the
flow is closed: the order established at `/start-change` no longer binds, and
nothing about this change proceeds on green any more.

## Abandoning a change (`--abandon`)

Abandon means: this change will not ship, and its proposal must stop presenting
itself as in flight. It does **not** mean deleting work.

The ordering is the whole design: **preserve, then remove.** Every step that
loses something comes after the step that makes it recoverable.

**1. Refuse if the work is already merged.**

```bash
git fetch -q origin
git merge-base --is-ancestor HEAD origin/<base> && echo 'already merged'
```

Merged means there is nothing to abandon — the code shipped. Removing the
proposal here would leave live code with no specification, which is spec drift
created deliberately, and no check in this package can see it. Report and stop:
either close it properly (no flag, after archiving) or write a new change that
removes the behaviour.

**2. Make every commit reachable from somewhere other than this machine.**

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{upstream} || echo 'no upstream'
git log --oneline @{upstream}..HEAD
```

No upstream, or commits ahead of it: **push before anything else**, even though
the branch is being abandoned.

This is step 2 rather than an afterthought because of how the failure actually
looks. A spike in the consumer repository survived as six commits on a local
branch and nothing else — no remote, no pull request, no tag — so recovering it
required the machine it was written on. A push costs nothing and is the whole
difference between abandoned and lost.

If pushing is refused or impossible, tag instead:

```bash
git tag abandoned/<name> && git push origin abandoned/<name>
```

If that is impossible too, **say plainly that the work exists only on this
machine**, and name the SHA. Do not continue to step 4 having said it quietly.

**3. Close the pull request. Do not delete the branch.**

```bash
gh pr close <n> --comment 'Abandoned: <reason>. Branch kept at <SHA>.'
```

Closing is reversible and keeps the diff, the review and the CI history
readable, which is most of what the abandoned attempt was worth. Deleting the
branch is not on the list, and `--delete-branch` is never passed: it throws away
the ref that step 2 just worked to create.

**4. Remove the change directory, in a commit of its own.**

```bash
git rm -r openspec/changes/<name>
git commit -m 'chore(openspec): abandon <name>' -- openspec/changes/<name>
```

Do **not** run `openspec archive` on an abandoned change. Archive applies the
delta to `openspec/specs/`, which would publish an accepted requirement for a
change nobody accepted — and a spec describing behaviour no code implements
passes every check in this package, because none of them read application code.
Committing the removal keeps the proposal in history, recoverable by SHA, and
leaves `openspec/specs/` untouched.

**5. Report, plainly.** The abandoned name, the reason, the branch and SHA where
the commits live, the pull request, and the commit that removed the directory.

## Never, in either mode

Force-push. Delete a remote branch. `openspec archive` an abandoned delta. `rm`
an uncommitted file. Abandoning a change is a decision about what happens next;
it is not a licence to edit what already happened.
