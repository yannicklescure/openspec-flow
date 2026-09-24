/**
 * The strict-validation check: delegate to OpenSpec's own validator.
 *
 * Strict validation is the tool's contract and it moves with the tool — this
 * repository has already had to regenerate its generated instruction files once
 * for a CLI version bump. A local reimplementation would silently diverge from
 * whatever `openspec` means by strict next month, so this shells out instead
 * (design.md D4) and surfaces the command's own words rather than restating
 * them in this project's vocabulary.
 *
 * It is also the only check here that needs the CLI at all; the scenario-drop
 * and duplicate checks are text over files. That is why `openspec` is a pinned
 * devDependency (design.md D5) rather than something each machine happens to
 * have.
 *
 * The subprocess call is injected, so the unit tests exercise the parsing
 * without invoking a real CLI and without this module importing `node:child_process`
 * behaviour they would have to stub globally.
 */

import { createFailure } from './report.mjs';

/** Lines openspec prints for a failing item, e.g. `✗ spec/frontend-styling`. */
const FAILING_ITEM = /^\s*[✗×x]\s+(?:spec\/)?(\S+)/;

/** The totals line, e.g. `Totals: 17 passed, 1 failed (18 items)`. */
const TOTALS = /Totals:\s*(\d+)\s+passed,\s*(\d+)\s+failed/;

/**
 * Turn a completed `openspec validate --specs --strict` run into failures.
 *
 * `run` returns `{ status, stdout, stderr }`. A zero status is a pass and
 * yields no failures regardless of what was printed — INFO notices about long
 * requirement text are advice, not defects, and must not redden the build.
 */
export function checkStrictValidation({ run } = {}) {
  const { status, stdout = '', stderr = '' } = run();

  if (status === 0) {
    return [];
  }

  const output = `${stdout}\n${stderr}`;
  const lines = output.split(/\r?\n/);

  const failingItems = [];
  for (const line of lines) {
    const match = line.match(FAILING_ITEM);
    if (match) {
      failingItems.push(match[1]);
    }
  }

  const totals = output.match(TOTALS);
  const failedCount = totals ? Number(totals[2]) : null;

  // Prefer openspec's own summary of which items failed. When the output shape
  // changes under a CLI upgrade and nothing matches, report the raw tail rather
  // than claiming there is nothing to see — a check that goes quiet on an
  // unrecognised failure is worse than one that prints too much.
  if (failingItems.length === 0) {
    const tail = lines
      .filter((l) => l.trim().length > 0)
      .slice(-5)
      .join(' / ');
    return [
      createFailure(
        `openspec validate --specs --strict exited ${status}${
          failedCount === null ? '' : ` with ${failedCount} failing item(s)`
        }, and its output did not name them: ${tail}`,
        'run `openspec validate --specs --strict` directly and read the full output — the CLI output format may have changed, in which case fix scripts/check-specs/lib/validate.mjs rather than ignoring the failure',
      ),
    ];
  }

  return failingItems.map((item) =>
    createFailure(
      `${item}: fails openspec validate --specs --strict`,
      `run \`openspec validate ${item} --type spec\` and fix what it reports`,
    ),
  );
}
