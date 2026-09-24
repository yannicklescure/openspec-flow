/**
 * The scenario-drop check: applying a delta must not silently delete a
 * scenario the live capability already carries.
 *
 * A MODIFIED requirement replaces its live counterpart **in full**, so a
 * scenario left out of the delta is deleted rather than left alone — and it
 * disappears without appearing in any diff a reviewer reads, because the delta
 * itself looks complete. Before this check, catching it meant hand-diffing the
 * delta's scenario list against the live spec before every archive.
 *
 * Comparison is by scenario NAME. Rewording a scenario's body is a
 * modification, not a removal, and must not be reported.
 *
 * Pure: the caller supplies parsed specs and markers; `index.mjs` owns the
 * reads (design.md D3).
 */

import { createFailure } from './report.mjs';

/** Only MODIFIED replaces wholesale, so only MODIFIED can drop a scenario. */
const CHECKED_OPERATION = 'MODIFIED';

/**
 * Compare a delta's MODIFIED requirements against the live capability.
 *
 * `markers` are the deliberate-removal markers from the delta's header, each
 * naming one requirement and one scenario (design.md D2).
 *
 * Returns `{what, fix}` failures — never throws on a malformed pairing. A
 * MODIFIED requirement with no live counterpart is its own finding rather than
 * a crash, because that is a real authoring mistake (an ADDED requirement
 * filed under the wrong operation) and the author needs to be told which.
 */
export function checkScenarioDrops({
  capability,
  delta,
  live,
  markers = [],
} = {}) {
  const failures = [];
  const liveByName = new Map(
    (live?.requirements ?? []).map((r) => [r.name, r]),
  );

  for (const requirement of delta?.requirements ?? []) {
    if (requirement.operation !== CHECKED_OPERATION) {
      continue;
    }

    const counterpart = liveByName.get(requirement.name);
    if (!counterpart) {
      failures.push(
        createFailure(
          `${capability}: MODIFIED requirement "${requirement.name}" has no current version in openspec/specs/`,
          'file it under "## ADDED Requirements" if it is new, or correct the name to match the live requirement it modifies',
        ),
      );
      continue;
    }

    const present = new Set(requirement.scenarios);
    const marked = new Set(
      markers
        .filter((m) => m.requirement === requirement.name)
        .map((m) => m.scenario),
    );

    const dropped = counterpart.scenarios.filter(
      (name) => !present.has(name) && !marked.has(name),
    );

    if (dropped.length > 0) {
      const list = dropped.map((name) => `"${name}"`).join(', ');
      failures.push(
        createFailure(
          `${capability}: MODIFIED requirement "${requirement.name}" omits ${dropped.length} scenario(s) the live spec carries: ${list}`,
          'a MODIFIED requirement replaces its counterpart in full, so copy each scenario into the delta — or, if the removal is deliberate, add `<!-- drops-scenario: <Requirement> :: <Scenario> -->` above the first `##` header naming it',
        ),
      );
    }
  }

  return failures;
}
