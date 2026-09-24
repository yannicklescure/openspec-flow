---
name: openspec-change-flow
description: The change flow for an OpenSpec repository with one human gate at merge. Use when running an OpenSpec change end to end — proposing, applying, opening a PR, watching CI, archiving, merging — and whenever deciding whether a step needs the user's approval or whether CI green is the trigger.
version: 0.1.0
---

# The change flow

```
opsx explore -> propose -> apply -> open PR -> watch CI
  on green: archive, then merge on explicit request
  on red:   fix, push, watch again
```

**Merge is the only human gate.** Nothing before it stops to ask.

## Why one gate

This is not laxity. A repository that stopped twice per change — once before
committing, once before archiving — shipped seven changes in a day and *neither
stop ever changed anything*. Reading back what each decision actually caught:

| decision | was it gated? | caught anything |
|---|---|---|
| does this deserve a change? | no | most of the time |
| is the implementation right? | yes | never |
| should this be archived? | yes | never |
| did I prove it or assume it? | no | every time |

Both gates sat on decisions nobody was making. The archive gate could not do
better: its commit applies a delta and moves a folder, so there is nothing in it
for a reader to judge. What it did instead was split one piece of work into two
states — after a change was committed and pushed, *"did you archive?"* had to be
asked, because neither party knew which state the work was in.

So: gate where a decision lives. That is at merge, and at the start, where
"does this deserve a change at all?" is answered out loud.

## Archiving on green

Archive when CI is green, without asking again. **Green means every required
check reported success against the _current head SHA_, confirmed by name.**

```bash
SHA=$(gh pr view <n> --json headRefOid -q .headRefOid)
[ "$SHA" = "$(git rev-parse HEAD)" ] || exit 1   # head moved under you
gh api "repos/<owner>/<repo>/commits/$SHA/check-runs" \
  -q '.check_runs[] | "\(.conclusion // .status)\t\(.name)"' | sort
```

`gh pr checks --watch` **exits 0 when its head is replaced mid-watch**. Under a
manual archive that was a nuisance; with archiving triggered by green it is a
correctness bug — a stale pass would apply a delta against code CI never
accepted. An exit code is not evidence. Resolve the SHA, then check each result
against it.

The same hazard appears one layer up when polling: a poll that catches the API
before it registers runs for a new head sees the *old* head's passes. If checks
arrive all at once on the first poll rather than trickling in, suspect that.

## After archiving

Verify the apply rather than trusting it:

- the requirement is declared **once** (a doubled requirement is what
  hand-editing a main spec produces)
- a `MODIFIED` requirement still carries every scenario it had, plus any added
- for a `skip_specs` change, the specs tree is **byte-identical** — check a
  checksum, do not eyeball it
- `openspec validate --specs --strict` passes, and the capability count is what
  you expected

Then commit the archive and let CI run again. That second cycle is the one that
verifies the only thing the archive commit changed.

## Merging

Merge on explicit request, and verify green by name against the head SHA first —
including after the archive commit, which is a new head. If asked to merge while
checks are still running, say so and hold rather than merging an unverified head;
the instruction is about intent, not timing.

## Staging

Stage **explicit paths**, never `git add <dir>`. A directory add sweeps in
unrelated in-flight change folders, which is easy to do and easy to miss — it
happened, and was caught only by reading the commit's own file list afterwards.
