#!/bin/sh
# Runs the specification checkers' unit tests.
#
# A script rather than a bare `node --test check-specs/` in
# package.json, for the same reason `scripts/check-docs/run-tests.sh` is one:
# Node versions disagree about what `--test` accepts. Passing a DIRECTORY fails
# on Node 22 (CI runners) and on Node 24 (this host today) with "Cannot find
# module .../check-specs"; passing a GLOB fails on Node 20, whose test
# runner does not expand one. An explicit file list is the only form every
# version accepts, and `find` keeps it robust to new nested test files.
#
# Verified the hard way here too: `node --test check-specs/lib/` fails
# on this host while the same tests pass when listed individually.
set -eu

cd "$(dirname "$0")"

# shellcheck disable=SC2046 # word splitting is the point: one argument per file
set -- $(find . -name '*.test.mjs' | sort)

# An empty list would make `node --test` fall back to discovering tests from the
# working directory, which would run something and report success — the
# rubber-stamp failure mode the checkers themselves guard against.
if [ "$#" -eq 0 ]; then
  echo "run-tests.sh: no *.test.mjs found under scripts/check-specs" >&2
  echo "the tests were moved or deleted; fix this script rather than ignoring it" >&2
  exit 1
fi

exec node --test "$@"
