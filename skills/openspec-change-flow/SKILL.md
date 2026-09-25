---
name: openspec-change-flow
description: The change flow for an OpenSpec repository — one human gate inside it, at merge, bracketed by an explicit start and stop. Use when running an OpenSpec change end to end — opening the flow, proposing, applying, opening a PR, watching CI, archiving, merging, closing or abandoning — and whenever deciding whether a step needs the user's approval or whether CI green is the trigger.
version: 0.2.0
---

# The change flow

```
/start-change <name>            <- the flow opens here, explicitly
  opsx explore -> propose -> apply -> open PR -> watch CI
    on green: archive, then merge on explicit request
    on red:   fix, push, watch again
/stop-change <name> [--abandon] <- the flow closes here, explicitly
```

**Merge is the only human gate *inside* the flow.** Between `/start-change` and
`/stop-change`, nothing stops to ask except merge.

Start and stop are not gates in that sense. They are **brackets**: they say
whether a change is in flight at all. A gate interrupts work that is under way; a
bracket marks where "under way" begins and ends. The distinction matters because
the argument for one gate was never about a count — see below.

## Why one gate

This is not laxity. A repository that stopped twice per change — once before
committing, once before archiving — shipped a day of changes and *neither
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

So: **gate where a decision lives.** The metric was never how many stops there
are; it was whether a decision lives at each one. Two of the four rows above are
decisions, and only one of them was gated.

## Why start and stop are not a third and fourth gate

Read the table again. The row that caught something most of the time — *does this
deserve a change?* — was never gated, and the row that caught something every
time — *did I prove it or assume it?* — is what `openspec-evidence` exists for.
`/start-change` puts the first of those where it belongs. It is the missing gate
the table already named, not a new one.

`/stop-change` is the opposite kind of thing. It adds no decision; it ends the
ambiguity the archive gate created. The archive gate's real defect was leaving
work in a state nobody could name, so *"did you archive?"* had to be asked. A
stop that refuses to close an unarchived change answers that question by
construction rather than by asking it.

Both are cheap in the currency that matters. The two removed gates cost a stop
**per change in flight**, twice each. Start and stop cost one call each at the
edges, and the steps between them never pause.

And the gap they close is real. With nothing marking the open, a change began
because an agent started behaving as though one had begun, and ended the same
way. In one session that produced a concrete error: the change was **merged
first and archived afterwards**, in a second pull request needing a second merge
— inverting step 7 of `/archive-on-green` ("stop before merging") and costing
exactly the extra gate the one-gate design exists to remove. The order was never
established as binding, because the flow was never explicitly opened.

## Opening the flow

`/start-change <name>` — see the command for the full procedure. It answers
"does this deserve a change?" out loud, then refuses to open on a dirty tree, on
a base that has moved, on a name already in `changes/archive/`, or alongside a
second active change. Each refusal exists because the step that comes later
would otherwise measure the wrong thing; the command says which step, for each.

A name already under `openspec/changes/` and not yet archived is a **resume**,
not a refusal.

From the open until the stop, the order below binds. It is not advice, and the
archive is not optional afterwards.

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

## Closing the flow

`/stop-change <name>` closes a change that reached its end, and **refuses while
the change is still unarchived** — that refusal is the inversion above, caught by
construction.

`/stop-change <name> --abandon` gives a change up. Abandoning is ordered
**preserve, then remove**: every commit reaches a remote (or a pushed tag) before
anything is deleted, the pull request is closed rather than the branch deleted,
and the change directory is removed in a commit of its own rather than archived —
archiving would publish an accepted spec for a change nobody accepted.

Why that order is written down at all: a spike in the consumer repository
survived as six commits on a local branch and nothing else — no remote, no pull
request, no tag — so recovering it needed the machine it was written on.
Abandoning a change must not be able to produce that state.

Already-merged work cannot be abandoned. There is nothing to give up; the code
shipped, and removing its proposal would leave live behaviour unspecified.

## Staging

Stage **explicit paths**, never `git add <dir>`. A directory add sweeps in
unrelated in-flight change folders, which is easy to do and easy to miss — it
happened, and was caught only by reading the commit's own file list afterwards.
