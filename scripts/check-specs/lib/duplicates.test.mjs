import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { checkDuplicateRequirements } from './duplicates.mjs';
import { parseSpec } from './parse.mjs';

function spec(capability, text) {
  return {
    capability,
    path: `openspec/specs/${capability}/spec.md`,
    parsed: parseSpec(text),
  };
}

test('one spec declaring a name twice fails, naming file and name', () => {
  const failures = checkDuplicateRequirements([
    spec(
      'portfolio',
      `### Requirement: Targets sum to 100

### Requirement: Targets sum to 100
`,
    ),
  ]);

  strictEqual(failures.length, 1);
  match(failures[0].what, /portfolio/);
  match(failures[0].what, /Targets sum to 100/);
  match(failures[0].what, /2 times/);
});

test('two capabilities sharing a requirement name pass', () => {
  const failures = checkDuplicateRequirements([
    spec('git-hooks', '### Requirement: Hooks install automatically\n'),
    spec('deployment', '### Requirement: Hooks install automatically\n'),
  ]);

  deepStrictEqual(failures, []);
});

test('three copies yield one failure, not two', () => {
  const failures = checkDuplicateRequirements([
    spec(
      'rebalancing',
      `### Requirement: Sells precede buys

### Requirement: Sells precede buys

### Requirement: Sells precede buys
`,
    ),
  ]);

  strictEqual(failures.length, 1);
  match(failures[0].what, /3 times/);
});

test('a clean spec passes', () => {
  const failures = checkDuplicateRequirements([
    spec(
      'portfolio',
      `### Requirement: One

### Requirement: Two
`,
    ),
  ]);

  deepStrictEqual(failures, []);
});
