#!/bin/sh
# Smoke-tests the published `openspec-check-specs` bin the way a consumer gets
# it: packed, installed into a fresh project, and invoked through the symlink
# npm puts in `node_modules/.bin`.
#
# Why this exists, and why the 37 unit tests do not cover it: until commit
# e1567a4 the bin's entry guard compared `process.argv[1]` with
# `import.meta.url` directly. Through the npm symlink those two are different
# paths, so `main` never ran — the module loaded, printed nothing, and exited
# 0. Every unit test stayed green, because each one imports a `lib/` module
# directly and never goes near the entry point. A CI job that only called the
# bin and checked its exit code would have been green forever while checking
# nothing at all.
#
# Watched failing before being trusted: reintroducing the pre-e1567a4 guard in
# an installed copy makes observations A and C below both report exit 0 with no
# output, which is what this script now refuses to accept.
#
# The four observations, in the order they run:
#
#   A  --help exits 0 AND prints its usage      the bin's main() ran at all
#   B  no openspec CLI  -> exit 1 naming strict  a tool that never ran is not a pass
#   C  seeded fault     -> exit 1 naming it      the checker has teeth
#   D  fault repaired   -> exit 0                and does not fire on everything
#
# C and D are the same fixture, one scenario apart. A guard that fires on
# everything is as useless as one that fires on nothing, so both directions of
# the boundary are probed.
#
# Run it from anywhere: sh scripts/check-specs/smoke-bin.sh
set -eu

# Pinned, not floating. This is the only network dependency in the whole
# repository and an upstream release must not be able to redden a build that
# changed nothing here. Note the scope: the unscoped `openspec` on npm is an
# unrelated package whose only published version is 0.0.0.
OPENSPEC_VERSION='@fission-ai/openspec@1.13.2'

REPO=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM

BIN="$WORK/consumer/node_modules/.bin/openspec-check-specs"
FAILURES=0

# Reports an observation and remembers a miss rather than exiting, so one run
# tells you everything that is wrong instead of only the first thing.
observe() {
  if [ "$1" = 'ok' ]; then
    printf 'ok   %s\n' "$2"
  else
    printf 'FAIL %s\n' "$2" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

# --- pack and install exactly what a consumer would receive -----------------

printf '\n# packing %s\n' "$REPO"
(cd "$REPO" && npm pack --silent --pack-destination "$WORK" >/dev/null)

# Found on disk rather than read from npm's stdout, which has carried a notice
# block, a bare filename and (under --silent) nothing at all across versions.
TARBALL=$(ls "$WORK"/*.tgz 2>/dev/null | head -n 1)
if [ -z "$TARBALL" ]; then
  printf 'FAIL %s\n' 'npm pack produced no tarball' >&2
  exit 1
fi

mkdir -p "$WORK/consumer"
cat >"$WORK/consumer/package.json" <<'JSON'
{
  "name": "openspec-flow-smoke-consumer",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
JSON

printf '# installing the tarball into a fresh consumer\n'
(cd "$WORK/consumer" && npm install --silent --no-audit --no-fund "$TARBALL")

if [ ! -L "$BIN" ]; then
  # Not a symlink means npm changed how it installs a bin, and this script is
  # no longer testing the thing it was written to test. Say so rather than
  # passing.
  printf 'FAIL %s\n' "expected $BIN to be a symlink; npm's bin layout changed and this script no longer exercises the symlink path" >&2
  exit 1
fi
printf '# bin installed as a symlink -> %s\n\n' "$(readlink "$BIN")"

# --- the fixture ------------------------------------------------------------
#
# A live spec carrying two scenarios, and an unarchived MODIFIED delta. The
# delta starts out carrying only one of them, which is the seeded fault.
#
# The Purpose section is deliberately over 50 characters: openspec's own strict
# validation warns below that, and observation D needs a fixture that genuinely
# passes all four checks rather than one that passes three.

mkdir -p "$WORK/consumer/openspec/specs/web-dashboard"
mkdir -p "$WORK/consumer/openspec/changes/2026-01-01-smoke/specs/web-dashboard"

cat >"$WORK/consumer/openspec/specs/web-dashboard/spec.md" <<'MD'
# web-dashboard Specification

## Purpose

The dashboard surface a signed-in owner uses to inspect and revoke their own
active sessions.

## Requirements

### Requirement: Sessions are revocable

The detail page SHALL let the owner revoke a session.

#### Scenario: Editing a setting

- **WHEN** the owner edits a setting
- **THEN** the change is persisted

#### Scenario: Fixed bindings are not offered as inputs

- **WHEN** a binding is fixed
- **THEN** it is rendered read-only
MD

DELTA="$WORK/consumer/openspec/changes/2026-01-01-smoke/specs/web-dashboard/spec.md"

# The seeded fault: "Fixed bindings are not offered as inputs" is missing, and
# no drops-scenario marker excuses it.
cat >"$DELTA" <<'MD'
## MODIFIED Requirements

### Requirement: Sessions are revocable

Reworded prose.

#### Scenario: Editing a setting

- **WHEN** the owner edits a setting
- **THEN** the change is persisted
MD

# Runs the bin, capturing output and status without tripping `set -e`.
run_bin() {
  set +e
  OUT=$(cd "$WORK/consumer" && "$BIN" "$@" 2>&1)
  STATUS=$?
  set -e
}

# --- A: the bin runs at all through its symlink ------------------------------
#
# The exit code alone proves nothing here: the silent-symlink bug exited 0 too.
# What distinguishes a working bin from that one is that main() produced
# output.

run_bin --help
if [ "$STATUS" -eq 0 ] && printf '%s' "$OUT" | grep -q 'Usage: check-specs'; then
  observe ok '--help exits 0 and prints its usage through the bin symlink'
else
  observe fail "--help should exit 0 printing its usage; got status $STATUS and output: $OUT"
fi

# --- B: a CLI that never ran is not a passing check --------------------------
#
# `openspec` is not installed in the consumer yet, so the strict check's
# subprocess cannot launch. That must read as a failure naming `strict`, never
# as "validation passed".
#
# Skipped when the CLI turns out to be resolvable anyway, which on a developer
# machine it usually is. The skip test resolves it the same way the code under
# test does — `npx --no-install` — and not with `command -v`: npx also searches
# npm's global prefix, so a global install stays reachable with PATH stripped
# down to node alone. Using `command -v` here made this observation report a
# failure against a checker that was behaving correctly. CI runners have no
# global openspec, so the observation does run where it matters.

if (cd "$WORK/consumer" && npx --no-install openspec --version >/dev/null 2>&1); then
  printf 'skip B: openspec resolves here anyway (npx --no-install finds it), so the CLI is not absent\n'
else
  run_bin --root .
  if [ "$STATUS" -ne 0 ] && printf '%s' "$OUT" | grep -q '^strict:'; then
    observe ok 'a missing openspec CLI fails the strict check loudly'
  else
    observe fail "a missing openspec CLI should fail naming strict; got status $STATUS and output: $OUT"
  fi
fi

printf '# installing %s into the consumer\n' "$OPENSPEC_VERSION"
(cd "$WORK/consumer" && npm install --silent --no-audit --no-fund "$OPENSPEC_VERSION")

# --- C: the seeded fault is caught, and named ---------------------------------
#
# A non-zero exit on its own would also be satisfied by a bin that is red for
# every input, so the report has to name the dropped scenario.

run_bin --root .
if [ "$STATUS" -ne 0 ] &&
  printf '%s' "$OUT" | grep -q '^scenarios:' &&
  printf '%s' "$OUT" | grep -q 'Fixed bindings are not offered as inputs'; then
  observe ok 'a dropped scenario fails the run and is named in the report'
else
  observe fail "a dropped scenario should fail naming it; got status $STATUS and output: $OUT"
fi

# --- D: and the repaired fixture passes --------------------------------------

cat >"$DELTA" <<'MD'
## MODIFIED Requirements

### Requirement: Sessions are revocable

Reworded prose.

#### Scenario: Editing a setting

- **WHEN** the owner edits a setting
- **THEN** the change is persisted

#### Scenario: Fixed bindings are not offered as inputs

- **WHEN** a binding is fixed
- **THEN** it is rendered read-only
MD

run_bin --root .
if [ "$STATUS" -eq 0 ] && printf '%s' "$OUT" | grep -q 'specification checks passed (4)'; then
  observe ok 'restoring the scenario makes all four checks pass'
else
  observe fail "the repaired fixture should exit 0 with all four checks passing; got status $STATUS and output: $OUT"
fi

printf '\n'
if [ "$FAILURES" -ne 0 ]; then
  printf '%s smoke observation(s) failed\n' "$FAILURES" >&2
  exit 1
fi
printf 'bin smoke: every observation held\n'
