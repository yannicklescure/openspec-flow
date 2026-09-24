/**
 * Markdown skeleton parser for OpenSpec specifications and delta specs.
 *
 * A main spec at `openspec/specs/<capability>/spec.md` and a delta spec at
 * `openspec/changes/<name>/specs/<capability>/spec.md` share one skeleton:
 *
 *     ## <OPERATION> Requirements     <- delta only
 *     ### Requirement: <name>
 *     <prose>
 *     #### Scenario: <name>
 *     - **WHEN** ...
 *
 * The only structural difference is the operation header, which a main spec
 * does not carry. This parser records it when present rather than requiring
 * it, so both files go through the same code path (design.md D1: the
 * comparison is text over two files).
 *
 * Pure: no disk access, no process state. `index.mjs` owns every read
 * (design.md D3).
 */

/** Delta operation headers OpenSpec assigns meaning to. */
const OPERATIONS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];

const OPERATION_HEADER = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/;

// Exactly three hashes, then `Requirement:`. `####` must not match here, which
// a bare `^#{3,}` would, so the count is pinned on both sides.
const REQUIREMENT_HEADER = /^###\s+Requirement:\s*(.+?)\s*$/;

// Exactly four. A `#####` line is not a scenario, and neither is `###`.
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;

const PURPOSE_HEADER = /^##\s+Purpose\s*$/;

// A fence opener or closer: ``` or ~~~, optionally indented, optionally
// carrying an info string. Specs in this repository quote command output and
// Markdown examples, so a `####` inside a fence is text, not a scenario —
// without this, a delta that documents its own format parses as having
// scenarios it does not have.
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Parse a spec or delta into `{ purpose, requirements }`.
 *
 * `purpose` is the trimmed prose under `## Purpose`, or `null` when the file
 * has no such section (every delta, and a malformed main spec).
 *
 * Each requirement is `{ name, operation, scenarios }`, where `operation` is
 * the delta operation it appeared under and `null` in a main spec, and
 * `scenarios` is the list of scenario names in document order. A requirement
 * with no scenarios yields an empty array rather than being skipped — that is
 * a fact the caller needs, not a parse failure.
 */
export function parseSpec(text) {
  const lines = String(text).split(/\r?\n/);

  let purpose = null;
  let collectingPurpose = false;
  const purposeLines = [];

  let operation = null;
  const requirements = [];
  let current = null;

  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      if (collectingPurpose) {
        purposeLines.push(line);
      }
      continue;
    }

    if (inFence) {
      if (collectingPurpose) {
        purposeLines.push(line);
      }
      continue;
    }

    const operationMatch = line.match(OPERATION_HEADER);
    if (operationMatch) {
      operation = operationMatch[1];
      collectingPurpose = false;
      continue;
    }

    if (PURPOSE_HEADER.test(line)) {
      collectingPurpose = true;
      continue;
    }

    const requirementMatch = line.match(REQUIREMENT_HEADER);
    if (requirementMatch) {
      collectingPurpose = false;
      current = { name: requirementMatch[1], operation, scenarios: [] };
      requirements.push(current);
      continue;
    }

    const scenarioMatch = line.match(SCENARIO_HEADER);
    if (scenarioMatch && current) {
      current.scenarios.push(scenarioMatch[1]);
      continue;
    }

    // Any other `##` ends the purpose section without starting anything.
    if (collectingPurpose) {
      if (/^##\s/.test(line)) {
        collectingPurpose = false;
      } else {
        purposeLines.push(line);
      }
    }
  }

  const joined = purposeLines.join('\n').trim();
  purpose = joined.length > 0 ? joined : purpose;

  return { purpose, requirements };
}

/** The delta operations this parser recognises, for callers that enumerate. */
export function knownOperations() {
  return [...OPERATIONS];
}

// `<!-- enumerates: <inventory> -->`
const INVENTORY_MARKER = /^\s*<!--\s*enumerates:\s*([\w-]+)\s*-->\s*$/;

/**
 * Read the inventory declarations a capability makes.
 *
 * A capability opts in to being compared against the code by declaring, inside
 * the requirement that makes the claim, which inventory that requirement
 * enumerates. Nothing is inferred: a requirement mentioning a route in passing
 * is not claiming to list them all, and treating it as one would make every
 * incidental mention a maintenance burden.
 *
 * Placement is the **inverse** of `parseDropMarkers`, for the same underlying
 * reason read the other way. `openspec archive` copies a requirement's body
 * into the main spec. A drop marker describes one change and must not be
 * carried across, so it lives above the first `##`. An inventory declaration is
 * a permanent property of the capability and has to survive into the main spec,
 * so it lives where archive will carry it — inside the requirement. A marker
 * outside any requirement is therefore ignored rather than honoured.
 *
 * The distinction that generalises is not "markers go at the top"; it is
 * whether the marker describes the change or the capability.
 *
 * Returns `[{ requirement, inventory }]` in document order.
 */
export function parseInventoryDeclarations(text) {
  const declarations = [];
  let inFence = false;
  let current = null;

  for (const line of String(text).split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const requirementMatch = line.match(REQUIREMENT_HEADER);
    if (requirementMatch) {
      current = requirementMatch[1];
      continue;
    }

    const match = line.match(INVENTORY_MARKER);
    if (match && current) {
      declarations.push({ requirement: current, inventory: match[1] });
    }
  }

  return declarations;
}

// `<!-- drops-scenario: <Requirement> :: <Scenario> -->`
const DROP_MARKER = /^\s*<!--\s*drops-scenario:\s*(.+?)\s*::\s*(.+?)\s*-->\s*$/;

/**
 * Read the deliberate-removal markers from a delta's file header.
 *
 * A MODIFIED requirement replaces its live counterpart in full, so omitting a
 * scenario deletes it. An oversight and a deliberate removal look identical,
 * which is why intent is stated rather than inferred (design.md D2).
 *
 * Placement is the load-bearing part, not a style rule. `openspec archive`
 * applies requirement blocks, so anything inside a requirement is copied into
 * the main spec — a marker written there would end up embedded in the
 * capability itself, a note to a checker living inside a behaviour contract.
 * Only content before the first `##` header belongs to no requirement and
 * cannot be carried across, so only markers found there are honoured. A marker
 * below that line is ignored, which makes the check fail and the author move
 * it.
 *
 * Returns `[{ requirement, scenario }]` in document order. Each marker names
 * one scenario, so silencing one omission cannot silence another.
 */
export function parseDropMarkers(text) {
  const markers = [];
  let inFence = false;

  for (const line of String(text).split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    // The first `##` ends the header region. Everything after it belongs to a
    // delta operation section, and a marker there is not honoured.
    if (/^##\s/.test(line)) {
      break;
    }

    const match = line.match(DROP_MARKER);
    if (match) {
      markers.push({ requirement: match[1], scenario: match[2] });
    }
  }

  return markers;
}
