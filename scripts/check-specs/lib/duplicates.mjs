/**
 * The duplicate-requirement check: one specification must not declare the same
 * requirement name twice.
 *
 * Archiving applies a delta BY REQUIREMENT NAME. A name appearing twice means
 * a requirement was applied on top of a capability that already held it, and
 * the two copies then drift: a later MODIFIED delta updates one of them and
 * leaves the other stating the old behaviour. The known route into this state
 * is hand-editing a main spec instead of letting `openspec archive` apply the
 * delta.
 *
 * The same name in two different capabilities is not a defect. Capabilities are
 * independent, and "Hooks install automatically" could legitimately appear in
 * more than one.
 *
 * Pure: the caller supplies parsed specs; `index.mjs` owns the reads.
 */

import { createFailure } from './report.mjs';

/**
 * Report every requirement name declared more than once within a single spec.
 *
 * `specs` is `[{ capability, path, parsed }]`. Each duplicated name yields one
 * failure naming the file and the count, not one failure per extra copy.
 */
export function checkDuplicateRequirements(specs = []) {
  const failures = [];

  for (const { capability, path, parsed } of specs) {
    const counts = new Map();
    for (const requirement of parsed?.requirements ?? []) {
      counts.set(requirement.name, (counts.get(requirement.name) ?? 0) + 1);
    }

    for (const [name, count] of counts) {
      if (count > 1) {
        failures.push(
          createFailure(
            `${capability}: requirement "${name}" is declared ${count} times in ${path}`,
            'delete the extra copy, keeping the one that states current behaviour — archiving applies deltas by name, so duplicates drift apart as soon as one is modified',
          ),
        );
      }
    }
  }

  return failures;
}
