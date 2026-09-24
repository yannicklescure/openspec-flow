import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  countFailures,
  createFailure,
  createResult,
  exitCodeFor,
  formatFailureLine,
  report,
} from './report.mjs';

test('a failure line reads <checker>: <what> — <fix>', () => {
  strictEqual(
    formatFailureLine('scenarios', createFailure('a dropped', 'copy it back')),
    'scenarios: a dropped — copy it back',
  );
});

test('all-clear prints the checker names and exits 0', () => {
  const lines = [];
  const code = report(
    [createResult('scenarios'), createResult('duplicates')],
    { write: (l) => lines.push(l) },
  );

  strictEqual(code, 0);
  deepStrictEqual(lines, [
    'specification checks passed (2): scenarios, duplicates',
  ]);
});

test('failures are printed and the exit code is 1', () => {
  const lines = [];
  const results = [
    createResult('scenarios', [createFailure('x dropped', 'copy it')]),
  ];
  const code = report(results, { write: (l) => lines.push(l) });

  strictEqual(code, 1);
  strictEqual(lines[0], 'scenarios: x dropped — copy it');
  strictEqual(countFailures(results), 1);
  strictEqual(exitCodeFor(results), 1);
});
