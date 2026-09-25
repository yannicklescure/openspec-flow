/**
 * Shared result shape and formatter for the specification checkers.
 *
 * Deliberately the same contract as a documentation checker's report module:
 * every checker returns `{checker, failures[]}` where each failure is
 * `{what, fix}`, and the formatter renders one line per failure as
 * `<checker>: <what> — <how to fix>`. A reader who has seen one checker fail
 * should not have to learn a second output format to read the other.
 *
 * Nothing here touches the filesystem or calls `process.exit`; the CLI entry
 * point owns both. `report()` returns the exit code it should use.
 */

/** A single defect: what is wrong, and what the author should do about it. */
export function createFailure(what, fix) {
  return { what: String(what), fix: String(fix) };
}

/** A checker's verdict. `failures` empty means the checker passed. */
export function createResult(checker, failures = []) {
  return { checker: String(checker), failures: [...failures] };
}

/** `<checker>: <what> — <how to fix>` — the one line CI prints. */
export function formatFailureLine(checker, failure) {
  return `${checker}: ${failure.what} — ${failure.fix}`;
}

/** Every failure line across every result, in checker order. */
export function formatResults(results) {
  const lines = [];
  for (const result of results) {
    for (const failure of result.failures) {
      lines.push(formatFailureLine(result.checker, failure));
    }
  }
  return lines;
}

/** Total number of failures across every result. */
export function countFailures(results) {
  return results.reduce((total, result) => total + result.failures.length, 0);
}

/** 1 when anything failed, 0 otherwise. */
export function exitCodeFor(results) {
  return countFailures(results) > 0 ? 1 : 0;
}

/**
 * Print every failure and return the exit code the caller should use.
 *
 * `write` is injectable so tests can assert the output without printing it.
 */
export function report(results, { write = (line) => console.log(line) } = {}) {
  const lines = formatResults(results);
  for (const line of lines) {
    write(line);
  }

  if (lines.length === 0) {
    const names = results.map((r) => r.checker).join(', ');
    write(`specification checks passed (${results.length}): ${names}`);
    return 0;
  }

  write(
    `${lines.length} specification failure(s) across ${results.length} check(s)`,
  );
  return 1;
}
