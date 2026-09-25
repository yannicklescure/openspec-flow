/**
 * The inventory check: a capability that claims to enumerate something is held
 * to it.
 *
 * In the repository this package was extracted from, a capability said its
 * route list "is the whole surface: a route that exists in the API but is
 * absent here is a spec defect", and carried a scenario asserting the
 * comparison holds. Nothing performed that comparison, and for six weeks the
 * list was missing five of twenty-three routes — while the API reference
 * document was correct throughout, because a documentation checker made
 * exactly this comparison against it.
 *
 * Only a **declared** inventory is checked. A capability mentioning a route in
 * passing is not claiming completeness, and treating it as one would make every
 * incidental mention a maintenance burden. An inventory no capability declares
 * passes silently: deciding that it deserves a capability is a judgement, not a
 * defect.
 *
 * Pure: the caller supplies both sides; `index.mjs` owns the reads and the
 * derivation.
 */

import { createFailure } from './report.mjs';

/**
 * Compare each declared inventory against the one derived from the code.
 *
 * `declared` is `[{ capability, requirement, inventory, items }]`; `derived` is
 * `{ [inventory]: items }`. Comparison is by exact string, so the caller
 * normalises both sides — parameter names in a route path, for instance — before
 * handing them over.
 *
 * A declaration naming an inventory nothing derives is its own finding rather
 * than a silent pass: it means the marker is misspelled or the derivation was
 * removed, and both leave the capability's claim unenforced while looking
 * enforced.
 */
export function checkInventories({ declared = [], derived = {} } = {}) {
  const failures = [];

  for (const entry of declared) {
    const { capability, requirement, inventory, items = [] } = entry;

    if (!Object.prototype.hasOwnProperty.call(derived, inventory)) {
      failures.push(
        createFailure(
          `${capability}: requirement "${requirement}" declares it enumerates "${inventory}", but nothing derives such an inventory`,
          'correct the marker to name an inventory the checker derives, or remove it — a declaration nothing checks leaves the claim unenforced while looking enforced',
        ),
      );
      continue;
    }

    const inCode = new Set(derived[inventory]);
    const inSpec = new Set(items);

    const missingFromSpec = [...inCode].filter((i) => !inSpec.has(i)).sort();
    const missingFromCode = [...inSpec].filter((i) => !inCode.has(i)).sort();

    if (missingFromSpec.length > 0) {
      failures.push(
        createFailure(
          `${capability}: requirement "${requirement}" enumerates ${inventory} and omits ${missingFromSpec.length}: ${missingFromSpec.join(', ')}`,
          `add each to the list in "${requirement}" — the requirement claims the list is complete, so an omission is a spec defect rather than a shorter list`,
        ),
      );
    }

    if (missingFromCode.length > 0) {
      failures.push(
        createFailure(
          `${capability}: requirement "${requirement}" lists ${missingFromCode.length} ${inventory} the code does not have: ${missingFromCode.join(', ')}`,
          'remove each from the list, or restore it in the code — a removal the spec did not follow leaves the capability describing something that no longer exists',
        ),
      );
    }
  }

  return failures;
}
