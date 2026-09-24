import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { parseDropMarkers, parseSpec } from './parse.mjs';
import { checkScenarioDrops } from './scenarios.mjs';

const LIVE = parseSpec(`# web-dashboard Specification

## Requirements

### Requirement: Portfolio settings are editable

The detail page SHALL let the owner edit settings.

#### Scenario: Editing a setting

#### Scenario: Fixed bindings are not offered as inputs

#### Scenario: Arming live trading is confirmed
`);

function run(deltaText) {
  return checkScenarioDrops({
    capability: 'web-dashboard',
    delta: parseSpec(deltaText),
    live: LIVE,
    markers: parseDropMarkers(deltaText),
  });
}

test('a delta omitting a live scenario fails, naming all three', () => {
  const failures = run(`## MODIFIED Requirements

### Requirement: Portfolio settings are editable

Reworded prose.

#### Scenario: Editing a setting

#### Scenario: Arming live trading is confirmed
`);

  strictEqual(failures.length, 1);
  match(failures[0].what, /web-dashboard/);
  match(failures[0].what, /Portfolio settings are editable/);
  match(failures[0].what, /Fixed bindings are not offered as inputs/);
});

test('a marked omission passes', () => {
  const failures = run(`<!-- drops-scenario: Portfolio settings are editable :: Fixed bindings are not offered as inputs -->

## MODIFIED Requirements

### Requirement: Portfolio settings are editable

#### Scenario: Editing a setting

#### Scenario: Arming live trading is confirmed
`);

  deepStrictEqual(failures, []);
});

test('adding a scenario and rewording bodies passes', () => {
  const failures = run(`## MODIFIED Requirements

### Requirement: Portfolio settings are editable

Entirely new prose.

#### Scenario: Editing a setting

- **WHEN** reworded body
- **THEN** still fine

#### Scenario: Fixed bindings are not offered as inputs

#### Scenario: Arming live trading is confirmed

#### Scenario: A brand new one
`);

  deepStrictEqual(failures, []);
});

test('a MODIFIED requirement with no live counterpart fails', () => {
  const failures = run(`## MODIFIED Requirements

### Requirement: Something never specified

#### Scenario: Whatever
`);

  strictEqual(failures.length, 1);
  match(failures[0].what, /no current version/i);
  match(failures[0].what, /Something never specified/);
});

test('a marker for one scenario does not silence a second omission', () => {
  const failures = run(`<!-- drops-scenario: Portfolio settings are editable :: Editing a setting -->

## MODIFIED Requirements

### Requirement: Portfolio settings are editable

#### Scenario: Arming live trading is confirmed
`);

  strictEqual(failures.length, 1);
  match(failures[0].what, /Fixed bindings are not offered as inputs/);
  // The marked one must not be reported.
  strictEqual(/Editing a setting/.test(failures[0].what), false);
});
