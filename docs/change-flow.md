# The change flow

The flow is the path one OpenSpec change takes from idea to merged code. The
source of truth is the `openspec-change-flow` skill; this page draws it.

## The sequence

```mermaid
flowchart TD
  start(["Idea"]) --> explore["opsx explore"]
  explore --> deserve{"Does this deserve<br/>a change?"}
  deserve -- no --> drop(["No change"])
  deserve -- yes --> propose["propose<br/>proposal, design, tasks, delta specs"]
  propose --> apply["apply<br/>implement the tasks"]
  apply --> pr["open PR"]
  pr --> ci1["watch CI"]
  ci1 --> green1{"Green against<br/>the current head SHA,<br/>by name?"}
  green1 -- "red" --> fix["fix and push"]
  fix --> ci1
  green1 -- "green" --> archive["archive<br/>/archive-on-green"]
  archive --> verify["verify the apply"]
  verify --> commit["commit the archive<br/>explicit paths only"]
  commit --> ci2["watch CI again<br/>on the new head"]
  ci2 --> green2{"Green against<br/>the new head?"}
  green2 -- red --> fix2["fix and push"]
  fix2 --> ci2
  green2 -- green --> gate[["HUMAN GATE<br/>merge on explicit request"]]
  gate --> merged(["Merged"])

  classDef human fill:#fde68a,stroke:#b45309,color:#1f2937;
  classDef question fill:#e0e7ff,stroke:#4338ca,color:#1f2937;
  class gate human;
  class deserve question;
```

Two points need a person:

- **At the start**, "does this deserve a change at all?" is answered out loud.
  This is a judgement, and it is the decision that most often changes the
  outcome.
- **At merge**, the change goes in only when someone asks for it.

Nothing between these two points stops to ask.

## Why one gate

This is not laxity. A repository that stopped twice per change — once before
committing, once before archiving — shipped a day of changes, and neither stop
ever changed anything. Reading back what each decision caught:

| decision | was it gated? | caught anything |
|---|---|---|
| does this deserve a change? | no | most of the time |
| is the implementation right? | yes | never |
| should this be archived? | yes | never |
| did I prove it or assume it? | no | every time |

The gates sat on decisions nobody was making. The archive gate could not do
better: an archive commit applies a delta and moves a folder, so it contains
nothing for a reader to judge. What the gate did instead was split one piece of
work into two states. After a push, "did you archive?" had to be asked, because
neither party knew which state the work was in.

The rule that comes out of it: **put a gate where a decision lives.**

Removing the archive gate moves the risk onto the automatic steps. The checker
and the definition of green below are what carry that risk.

## What "green" means

Archive runs when CI is green, without asking. So "green" has to be exact:

> Every required check reported `success` against the **current head SHA**,
> confirmed **by name**.

An exit code is not evidence. `gh pr checks --watch` exits 0 when the PR head is
replaced during the watch:

```mermaid
sequenceDiagram
  autonumber
  participant A as Agent
  participant W as gh pr checks --watch
  participant GH as GitHub
  participant CI as CI

  A->>W: watch PR checks
  W->>GH: poll checks for head A1
  GH-->>W: in_progress
  Note over A,GH: A new commit is pushed. Head is now B2.
  CI->>GH: head A1 checks finish: success
  W->>GH: poll
  GH-->>W: all success, for A1
  W-->>A: exit 0
  Note over A: "Green", but B2 was never tested.<br/>An archive now applies a delta<br/>against code CI never accepted.
```

With a manual archive this was a nuisance. With archive triggered by green, it is
a correctness bug. The same hazard appears one layer up when polling: a poll
that reaches the API before it has registered runs for a new head sees the old
head's passes. If all checks arrive at once on the first poll, instead of one by
one, suspect this.

The procedure that replaces the exit code (`/verify-green`):

```bash
SHA=$(gh pr view <n> --json headRefOid -q .headRefOid)
[ "$SHA" = "$(git rev-parse HEAD)" ] || exit 1   # head moved under you
gh api "repos/<owner>/<repo>/commits/$SHA/check-runs" \
  -q '.check_runs[] | "\(.conclusion // .status)\t\(.name)"' | sort
gh pr view <n> --json mergeable,mergeStateStatus
```

Read the result as follows:

- Every check reads `success`, and the SHA matches local `HEAD`: green.
- Any check reads `in_progress` or `queued`: hold. Do not proceed.
- `mergeStateStatus: UNSTABLE`: checks are pending. Wait for `CLEAN`.

## Archive on green

`/archive-on-green` is the procedure for the archive step. Each step exists
because skipping it once caused a problem.

```mermaid
flowchart TD
  a1["1. Pin the head<br/>PR headRefOid equals git rev-parse HEAD"] --> a1q{"match?"}
  a1q -- no --> stopA(["Stop: head moved"])
  a1q -- yes --> a2["2. Confirm each required check<br/>by name, against that SHA"]
  a2 --> a2q{"all success?"}
  a2q -- "any in_progress" --> hold(["Hold"])
  a2q -- "any failure" --> stopB(["Stop: not green"])
  a2q -- yes --> a3["3. Snapshot<br/>scenario counts, declared-once,<br/>specs checksum for skip_specs"]
  a3 --> a4["4. openspec archive name --yes"]
  a4 --> a5["5. Verify the apply<br/>against the snapshot"]
  a5 --> a5q{"all hold?"}
  a5q -- no --> stopC(["Stop: report the difference"])
  a5q -- yes --> a6["6. Commit with explicit paths"]
  a6 --> a7(["7. Stop before merge<br/>merge is the human gate"])
```

### Verify the apply, do not trust it

After `openspec archive`, check that:

- each requirement is declared **once**. Hand-editing a main spec produces a
  doubled requirement.
- a `MODIFIED` requirement still carries every scenario it had, plus the new
  ones.
- for a `skip_specs` change, the specs tree is **byte-identical**. Compare a
  checksum. Do not compare by eye.
- `openspec validate --specs --strict` passes, and the capability count is the
  expected one.
- the project's own `check-specs` run passes.

Then commit the archive and let CI run again. That second CI cycle verifies the
only thing the archive commit changed.

### Stage explicit paths

Never `git add <dir>`. A directory add sweeps in unrelated in-flight change
folders. This happened once, and was caught only by reading the commit's file
list afterwards.

## Merge

Merge only on explicit request. Before merging, verify green by name against the
head SHA again — the archive commit is a new head. If the request comes while
checks are still running, say so and hold. The request is about intent, not
timing.

## Where each state lives

```mermaid
stateDiagram-v2
  [*] --> Proposed: propose
  Proposed --> Applied: apply
  Applied --> InReview: open PR
  InReview --> InReview: red, fix, push
  InReview --> Archived: verified green, archive, verify apply
  Archived --> Archived: red, fix, push
  Archived --> Merged: verified green AND explicit request
  Merged --> [*]

  note right of Proposed
    openspec/changes/name/
    delta specs not yet applied
  end note
  note right of Archived
    delta applied to openspec/specs/
    change moved to changes/archive/
  end note
```

`check-specs` inspects only **unarchived** changes. Before archive, the
`scenarios` check compares each delta with the live spec. After archive, the
delta is history, and the `duplicates` and `strict` checks cover the applied
result.
