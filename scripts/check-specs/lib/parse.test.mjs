import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseDropMarkers,
  parseInventoryDeclarations,
  parseSpec,
} from './parse.mjs';

test('parses a main spec: purpose, requirements, scenarios', () => {
  const { purpose, requirements } = parseSpec(`# cap Specification

## Purpose
Keeps something honest.

## Requirements

### Requirement: First thing

The system SHALL do it.

#### Scenario: It happens

- **WHEN** a thing
- **THEN** another
`);

  strictEqual(purpose, 'Keeps something honest.');
  deepStrictEqual(requirements, [
    { name: 'First thing', operation: null, scenarios: ['It happens'] },
  ]);
});

test('parses a delta identically, recording the operation header', () => {
  const { requirements } = parseSpec(`## MODIFIED Requirements

### Requirement: First thing

The system SHALL do it differently.

#### Scenario: It happens
`);

  deepStrictEqual(requirements, [
    { name: 'First thing', operation: 'MODIFIED', scenarios: ['It happens'] },
  ]);
});

test('a requirement with no scenarios yields an empty list, not a skip', () => {
  const { requirements } = parseSpec(`### Requirement: Bare

Prose only.
`);

  strictEqual(requirements.length, 1);
  deepStrictEqual(requirements[0].scenarios, []);
});

test('a scenario name containing a colon keeps the whole name', () => {
  const { requirements } = parseSpec(`### Requirement: R

#### Scenario: Archiving: the delta is applied
`);

  deepStrictEqual(requirements[0].scenarios, [
    'Archiving: the delta is applied',
  ]);
});

test('three or five hashes is not a scenario', () => {
  const { requirements } = parseSpec(`### Requirement: R

### Scenario: three hashes

##### Scenario: five hashes

#### Scenario: four hashes
`);

  deepStrictEqual(requirements[0].scenarios, ['four hashes']);
});

test('a #### line inside a fenced code block is not a scenario', () => {
  const { requirements } = parseSpec(`### Requirement: R

The message it prints looks like this:

\`\`\`
#### Scenario: not a real one
\`\`\`

#### Scenario: the real one
`);

  deepStrictEqual(requirements[0].scenarios, ['the real one']);
});

test('a ### Requirement line inside a fence does not open a requirement', () => {
  const { requirements } = parseSpec(`### Requirement: R

\`\`\`markdown
### Requirement: quoted example
\`\`\`
`);

  deepStrictEqual(
    requirements.map((r) => r.name),
    ['R'],
  );
});

test('a drop marker above the first ## header is honoured', () => {
  deepStrictEqual(
    parseDropMarkers(`<!-- drops-scenario: First thing :: It happens -->

## MODIFIED Requirements

### Requirement: First thing
`),
    [{ requirement: 'First thing', scenario: 'It happens' }],
  );
});

test('a drop marker inside a requirement body is NOT honoured', () => {
  deepStrictEqual(
    parseDropMarkers(`## MODIFIED Requirements

### Requirement: First thing

<!-- drops-scenario: First thing :: It happens -->
`),
    [],
  );
});

test('several markers each name one scenario', () => {
  deepStrictEqual(
    parseDropMarkers(`<!-- drops-scenario: R :: One -->
<!-- drops-scenario: R :: Two -->

## MODIFIED Requirements
`),
    [
      { requirement: 'R', scenario: 'One' },
      { requirement: 'R', scenario: 'Two' },
    ],
  );
});

test('a marker quoted inside a fence is not a marker', () => {
  deepStrictEqual(
    parseDropMarkers(`\`\`\`
<!-- drops-scenario: R :: Quoted -->
\`\`\`

## MODIFIED Requirements
`),
    [],
  );
});

test('an enumerates marker inside a requirement is honoured', () => {
  deepStrictEqual(
    parseInventoryDeclarations(`## Requirements

### Requirement: Versioned REST surface

<!-- enumerates: routes -->

The system SHALL expose the following endpoints.
`),
    [{ requirement: 'Versioned REST surface', inventory: 'routes' }],
  );
});

test('an enumerates marker outside any requirement is NOT honoured', () => {
  deepStrictEqual(
    parseInventoryDeclarations(`<!-- enumerates: routes -->

## Requirements

### Requirement: Versioned REST surface
`),
    [],
  );
});

test('a capability declaring nothing yields nothing', () => {
  deepStrictEqual(
    parseInventoryDeclarations(`### Requirement: Something

It mentions \`GET /portfolios\` in passing.
`),
    [],
  );
});

test('an enumerates marker inside a fence is not a declaration', () => {
  deepStrictEqual(
    parseInventoryDeclarations(`### Requirement: R

\`\`\`
<!-- enumerates: routes -->
\`\`\`
`),
    [],
  );
});
