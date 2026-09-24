import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { checkInventories } from './inventories.mjs';

const declared = [
  {
    capability: 'rest-api',
    requirement: 'Versioned REST surface',
    inventory: 'routes',
    items: ['GET /health', 'POST /portfolios'],
  },
];

test('an item in the code that the declaring capability omits fails', () => {
  const failures = checkInventories({
    declared,
    derived: { routes: ['GET /health', 'POST /portfolios', 'GET /runs/:id'] },
  });

  strictEqual(failures.length, 1);
  match(failures[0].what, /rest-api/);
  match(failures[0].what, /GET \/runs\/:id/);
  match(failures[0].what, /Versioned REST surface/);
});

test('an item the capability lists that the code no longer has fails', () => {
  const failures = checkInventories({
    declared,
    derived: { routes: ['GET /health'] },
  });

  strictEqual(failures.length, 1);
  match(failures[0].what, /POST \/portfolios/);
  match(failures[0].fix, /remov|delete/i);
});

test('a capability declaring nothing is ignored', () => {
  deepStrictEqual(
    checkInventories({
      declared: [],
      derived: { routes: ['GET /health', 'POST /portfolios'] },
    }),
    [],
  );
});

test('an inventory nothing declares passes', () => {
  deepStrictEqual(
    checkInventories({
      declared,
      derived: {
        routes: ['GET /health', 'POST /portfolios'],
        env: ['NODE_ENV', 'PORT'],
      },
    }),
    [],
  );
});

test('a declaration naming an inventory nothing derives is its own finding', () => {
  const failures = checkInventories({
    declared: [{ ...declared[0], inventory: 'widgets' }],
    derived: { routes: ['GET /health'] },
  });

  strictEqual(failures.length, 1);
  match(failures[0].what, /widgets/);
  match(failures[0].what, /no such inventory|nothing derives/i);
});

test('an exact match passes', () => {
  deepStrictEqual(
    checkInventories({
      declared,
      derived: { routes: ['POST /portfolios', 'GET /health'] },
    }),
    [],
  );
});
