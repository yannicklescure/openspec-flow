import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { checkStrictValidation } from './validate.mjs';

test('a zero exit passes even when INFO notices were printed', () => {
  const failures = checkStrictValidation({
    run: () => ({
      status: 0,
      stdout: `✓ spec/portfolio
  ℹ [INFO] requirements[0]: Requirement text is very long (>500 characters).
Totals: 18 passed, 0 failed (18 items)`,
      stderr: '',
    }),
  });

  deepStrictEqual(failures, []);
});

test('a failing item is named as openspec named it', () => {
  const failures = checkStrictValidation({
    run: () => ({
      status: 1,
      stdout: `✓ spec/portfolio
✗ spec/frontend-styling
Totals: 17 passed, 1 failed (18 items)`,
      stderr: '',
    }),
  });

  strictEqual(failures.length, 1);
  match(failures[0].what, /^frontend-styling:/);
  match(failures[0].fix, /openspec validate frontend-styling --type spec/);
});

test('several failing items each yield a failure', () => {
  const failures = checkStrictValidation({
    run: () => ({
      status: 1,
      stdout: `✗ spec/one
✗ spec/two
Totals: 16 passed, 2 failed (18 items)`,
      stderr: '',
    }),
  });

  deepStrictEqual(
    failures.map((f) => f.what.split(':')[0]),
    ['one', 'two'],
  );
});

test('a non-zero exit whose output names nothing still fails loudly', () => {
  const failures = checkStrictValidation({
    run: () => ({
      status: 2,
      stdout: 'something entirely unexpected',
      stderr: '',
    }),
  });

  strictEqual(failures.length, 1);
  match(failures[0].what, /did not name them/);
  match(failures[0].what, /something entirely unexpected/);
});
