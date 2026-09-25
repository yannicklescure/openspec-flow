#!/bin/sh
# Watches the `/start-change` and `/stop-change` gates refuse.
#
# Why this script exists
# ----------------------
# The two gates are prose instructions to an agent, not executable checks, so
# "watch it fail first" (`openspec-evidence`) cannot mean running them and
# seeing red. What it can mean — and what a prose gate is worth without it —
# is this: every refusal a gate claims to make must rest on a condition that is
# **observable by a command**, and that command must actually say something
# different in the refusing state than in the adjacent permitting one.
#
# A gate whose refusal condition cannot be observed is not a gate. It is a
# sentence. This script builds each refusing state in a throwaway repository,
# runs the exact detection command the command file names, and reports both
# directions of the boundary — because a condition that is "true" in every state
# refuses everything and would be dropped within a week.
#
# It needs no network, no `gh`, no `openspec` and no fixtures on disk: every
# refusal covered here is decidable from git and the filesystem alone. The ones
# that are not are listed at the end of the run, out loud, rather than being
# quietly counted as covered.
#
# Run it from anywhere: sh scripts/gates/refusal-cases.sh
set -eu

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM

FAILURES=0
BASE=main

# Reports an observation and remembers a miss rather than exiting, so one run
# tells you everything that is wrong instead of only the first thing. Same
# contract as `scripts/check-specs/smoke-bin.sh`.
observe() {
  if [ "$1" = 'ok' ]; then
    printf 'ok   %s\n' "$2"
  else
    printf 'FAIL %s\n' "$2" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

if ! git init -q -b "$BASE" "$WORK/.probe" 2>/dev/null; then
  # `git init -b` landed in 2.28. Rather than branching the whole script on the
  # default branch name, say what is missing: a silently skipped harness is the
  # rubber stamp this repository refuses everywhere else.
  # shellcheck disable=SC2016 # the backticks are prose, not a command substitution
  printf 'FAIL %s\n' 'git is too old for `git init -b`; this harness needs git >= 2.28' >&2
  exit 1
fi
rm -rf "$WORK/.probe"

# A consumer-shaped repository with a real remote, one commit, an `openspec`
# tree and one unrelated file to dirty. Prints the working clone's path.
new_repo() {
  root="$WORK/$1"
  mkdir -p "$root"
  git init -q --bare "$root/origin.git"
  # The bare repository's HEAD follows `init.defaultBranch`, which is the host's
  # setting and not ours. Left alone, a clone of it checks out nothing and the
  # second-clone helpers below fail on a missing working tree — with a warning,
  # not an error, which is how this went unnoticed for one run.
  git -C "$root/origin.git" symbolic-ref HEAD "refs/heads/$BASE"
  git init -q -b "$BASE" "$root/work"
  git -C "$root/work" config user.email 'gates@example.invalid'
  git -C "$root/work" config user.name 'Gate Harness'
  mkdir -p "$root/work/openspec/specs" "$root/work/openspec/changes/archive" "$root/work/src"
  printf 'one\n' >"$root/work/src/app.txt"
  # git tracks files, not directories, and `openspec/changes/archive/` has to
  # exist for the maxdepth searches below to mean what they mean.
  : >"$root/work/openspec/changes/archive/.gitkeep"
  git -C "$root/work" add -A
  git -C "$root/work" commit -qm 'chore: initial commit'
  git -C "$root/work" remote add origin "$root/origin.git"
  git -C "$root/work" push -q -u origin "$BASE" 2>/dev/null
  printf '%s\n' "$root/work"
}

# Pushes a commit to origin/$BASE from a second clone, so a working repository
# can genuinely fall behind its base.
move_base() {
  root=$(dirname "$1")
  git clone -q "$root/origin.git" "$root/other"
  git -C "$root/other" config user.email 'other@example.invalid'
  git -C "$root/other" config user.name 'Someone Else'
  printf 'base moved\n' >>"$root/other/src/app.txt"
  git -C "$root/other" commit -qam 'feat: something else landed on the base'
  git -C "$root/other" push -q origin "$BASE" 2>/dev/null
}

propose() { mkdir -p "$1/openspec/changes/$2/specs/widgets"; }
archived() { mkdir -p "$1/openspec/changes/archive/$2/specs/widgets"; }

# The detection commands, written once so the harness cannot drift from the
# command files by paraphrasing them differently in each case.
detect_dirty() { git -C "$1" status --porcelain; }
detect_behind() { git -C "$1" rev-list --count "HEAD..origin/$BASE"; }
detect_name() { (cd "$1" && find openspec/changes -maxdepth 2 -type d -name "*$2*"); }
detect_open() { (cd "$1" && find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive); }
detect_unpushed() { git -C "$1" log --oneline '@{upstream}..HEAD' 2>/dev/null; }
detect_upstream() { git -C "$1" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null; }
detect_merged() { git -C "$1" merge-base --is-ancestor HEAD "origin/$BASE"; }

printf '\n# /start-change\n\n'

# --- 1. a dirty tree -------------------------------------------------------

R=$(new_repo dirty)
printf 'uncommitted edit\n' >>"$R/src/app.txt"
if [ -n "$(detect_dirty "$R")" ]; then
  observe ok 'start refuses a dirty tree: git status --porcelain names the path'
else
  observe fail 'start should refuse a dirty tree, but git status --porcelain printed nothing'
fi

git -C "$R" checkout -q -- src/app.txt
if [ -z "$(detect_dirty "$R")" ]; then
  observe ok 'start permits the same repository once the edit is committed or discarded'
else
  observe fail "a restored tree should be clean; git status --porcelain still prints: $(detect_dirty "$R")"
fi

# --- 2. a base that has moved ----------------------------------------------
#
# The refusing state is not exotic: it is any branch cut before someone else
# merged. A delta written here compares against a spec the merge result does not
# have, which the `scenarios` check will happily pass.

R=$(new_repo behind)
move_base "$R"
git -C "$R" fetch -q origin
if [ "$(detect_behind "$R")" -gt 0 ]; then
  observe ok "start refuses a stale base: rev-list --count HEAD..origin/$BASE reports $(detect_behind "$R")"
else
  observe fail 'start should refuse a stale base, but the behind-count was 0'
fi

git -C "$R" merge -q --ff-only "origin/$BASE"
if [ "$(detect_behind "$R")" -eq 0 ]; then
  observe ok 'start permits the same branch once the base is merged in'
else
  observe fail 'after merging the base the behind-count should be 0'
fi

# --- 3. a name that already went through the flow ---------------------------

R=$(new_repo namecollision)
archived "$R" '2026-01-02-widget-caching'
if [ -n "$(detect_name "$R" 'widget-caching')" ]; then
  observe ok 'start refuses a reused name: the find hits the archived folder'
else
  observe fail 'start should refuse a name already in changes/archive, but the find hit nothing'
fi

if [ -z "$(detect_name "$R" 'widget-pagination')" ]; then
  observe ok 'start permits an unused name in the same repository'
else
  observe fail "an unused name should hit nothing; the find printed: $(detect_name "$R" 'widget-pagination')"
fi

# The third state this check has to tell apart, and the one that must NOT be a
# refusal: a change already proposed and not yet archived is resumed, not
# rejected. The two states differ by path, which is why the search is run with
# maxdepth 2 over the whole tree rather than against one directory.
R=$(new_repo nameresume)
propose "$R" '2026-01-03-widget-caching'
HIT=$(detect_name "$R" 'widget-caching')
case "$HIT" in
  *changes/archive/*) observe fail "a proposed-but-unarchived change must not read as archived; got: $HIT" ;;
  openspec/changes/*) observe ok 'start distinguishes resume from reuse: the hit is outside changes/archive/' ;;
  *) observe fail "a proposed change should be found; the find printed: $HIT" ;;
esac

# --- 4. a second concurrent change ------------------------------------------

R=$(new_repo concurrent)
propose "$R" '2026-01-04-already-open'
if [ -n "$(detect_open "$R")" ]; then
  observe ok 'start refuses a second concurrent change: an active change folder is already there'
else
  observe fail 'start should refuse a second change, but no active change folder was found'
fi

rm -rf "$R/openspec/changes/2026-01-04-already-open"
if [ -z "$(detect_open "$R")" ]; then
  observe ok 'start permits the first change: with none active the search prints nothing'
else
  observe fail "with no active change the search should print nothing; got: $(detect_open "$R")"
fi

printf '\n# /stop-change\n\n'

# --- 5. closing a change that was never archived ----------------------------
#
# This is the inversion that produced the command: merged first, archived after.

R=$(new_repo unarchived)
propose "$R" '2026-01-05-widget-limits'
if [ -n "$(detect_open "$R")" ]; then
  observe ok 'stop refuses a change still sitting in openspec/changes: archive never ran'
else
  observe fail 'stop should refuse an unarchived change, but no active change folder was found'
fi

rm -rf "$R/openspec/changes/2026-01-05-widget-limits"
archived "$R" '2026-01-05-widget-limits'
if [ -z "$(detect_open "$R")" ] && [ -n "$(detect_name "$R" '2026-01-05-widget-limits')" ]; then
  observe ok 'stop permits the same change once it has moved under changes/archive/'
else
  observe fail 'after archiving, the change should be found under changes/archive/ and nowhere else'
fi

# --- 6. abandoning work that exists only on this machine --------------------
#
# The `rescue/full-spike-work` failure mode: six commits, no remote, no PR, no
# tag. Both shapes of it are covered — a branch with no upstream at all, and one
# whose upstream is behind — because the first makes `@{upstream}` fail rather
# than print, and a check that reads only the second's output would miss it.

R=$(new_repo unpushed)
git -C "$R" checkout -q -b spike/full-work
printf 'spike\n' >>"$R/src/app.txt"
git -C "$R" commit -qam 'feat: spike work nobody else can see'

if [ -z "$(detect_upstream "$R")" ]; then
  observe ok 'abandon refuses a branch with no upstream: @{upstream} does not resolve'
else
  observe fail "a fresh local branch should have no upstream; got: $(detect_upstream "$R")"
fi

git -C "$R" push -q -u origin spike/full-work 2>/dev/null
printf 'more spike\n' >>"$R/src/app.txt"
git -C "$R" commit -qam 'feat: a commit made after the push'
if [ -n "$(detect_unpushed "$R")" ]; then
  observe ok 'abandon refuses a branch ahead of its upstream: the commit is named'
else
  observe fail 'abandon should refuse unpushed commits, but the ahead-list was empty'
fi

git -C "$R" push -q origin spike/full-work 2>/dev/null
if [ -z "$(detect_unpushed "$R")" ] && [ -n "$(detect_upstream "$R")" ]; then
  observe ok 'abandon permits removal once every commit is on the remote'
else
  observe fail 'after pushing, the branch should have an upstream and nothing ahead of it'
fi

# --- 7. abandoning work that already shipped --------------------------------

R=$(new_repo alreadymerged)
git -C "$R" checkout -q -b feat/shipped
printf 'shipped\n' >>"$R/src/app.txt"
git -C "$R" commit -qam 'feat: shipped behaviour'
git -C "$R" push -q -u origin feat/shipped 2>/dev/null
if detect_merged "$R"; then
  observe fail 'an unmerged branch must not read as merged into the base'
else
  observe ok 'abandon permits an unmerged branch: HEAD is not an ancestor of the base'
fi

ROOT=$(dirname "$R")
git clone -q "$ROOT/origin.git" "$ROOT/merger"
git -C "$ROOT/merger" config user.email 'merger@example.invalid'
git -C "$ROOT/merger" config user.name 'Merge Button'
git -C "$ROOT/merger" merge -q --no-ff -m 'Merge pull request #1' origin/feat/shipped
git -C "$ROOT/merger" push -q origin "$BASE" 2>/dev/null
git -C "$R" fetch -q origin
if detect_merged "$R"; then
  observe ok 'abandon refuses work already merged into the base: HEAD is an ancestor of it'
else
  observe fail 'merged work should read as an ancestor of the base, but the check said no'
fi

# --- what this harness does not demonstrate ---------------------------------
#
# Stated in the run itself, not only in the docs, so nobody reads 16 passing
# observations as "the gates are verified".

cat <<'NOTE'

# not demonstrated here, and not claimed:
#   - "does this deserve a change?" — a judgement. No command decides it, so the
#     start gate's own substance cannot be shown refusing anything. It is a
#     prompt to a person, and it is worth exactly what that person answers.
#   - the pull-request states (open PR at close, gh pr close at abandon). They
#     need a live GitHub; `/verify-green` already covers reading check state.
#   - that an agent obeys a refusal. Observability is necessary, not sufficient.
NOTE

printf '\n'
if [ "$FAILURES" -ne 0 ]; then
  printf '%s refusal observation(s) failed\n' "$FAILURES" >&2
  exit 1
fi
printf 'gate refusals: every observation held\n'
