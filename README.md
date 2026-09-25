# openspec-flow

A Claude Code plugin for repositories using [OpenSpec](https://github.com/fission-ai/openspec):
a change flow with **one human gate inside it, at merge**, bracketed by an
explicit start and stop, plus drift checks that hold a specification to the code
it claims to describe.

It exists because both halves were learned the expensive way in one repository
and then could not travel. The reasoning is kept, not just the rules — a rule
without its reason gets "simplified" back out.

How the flow runs, why it has one gate and two brackets, and how the checker is
built — with diagrams — are in [`docs/`](docs/README.md).

## What's in it

**Skills** — the flow and the discipline:

| skill | covers |
|---|---|
| `openspec-change-flow` | the sequence, why one gate inside the brackets, archive-on-verified-green, the `gh pr checks --watch` false green, post-archive verification |
| `openspec-spec-drift` | what a `MODIFIED` delta silently deletes, both marker placement rules and why they are opposites, the doc-vs-spec asymmetry |
| `openspec-evidence` | watch a check fail before trusting it; three ways a green check means nothing |

**Commands**:

- `/start-change` — open the flow: does this deserve a change, is the tree clean, is the base current, is the name free
- `/archive-on-green` — pin the head SHA, confirm each check by name, archive, verify the apply
- `/verify-green` — is this PR actually green, against its current head?
- `/stop-change` — close a change that reached its end, or `--abandon` one without losing the work

`/start-change` and `/stop-change` bracket the flow; merge stays the only gate
*inside* it. Why that is not a contradiction of "one gate" is argued in the
`openspec-change-flow` skill — the metric was never the number of stops but
whether a decision lives at each one, and "does this deserve a change?" was the
decision the old flow left ungated.

**Checker** — `scripts/check-specs`, four checks over `openspec/`:

| check | fails when |
|---|---|
| `scenarios` | a `MODIFIED` delta omits a scenario the live requirement carries |
| `duplicates` | one spec declares the same requirement name twice |
| `inventories` | a capability that declares it enumerates code disagrees with it |
| `strict` | `openspec validate --specs --strict` does |

Three are pure text comparisons over `openspec/`, with no knowledge of your
stack. 37 unit tests, no fixtures on disk.

## Install

Add the plugin, then wire the checker into the consumer repository:

```bash
# 1. run the checks
node <plugin>/scripts/check-specs/index.mjs --root .

# 2. wire them in — as an npm script, a CI job, and a pre-push hook
```

`openspec` must be resolvable in the consumer repo for the `strict` check. Pin
it as a devDependency — note the scope, **`@fission-ai/openspec`**; the bare
`openspec` on npm is an unrelated package whose only published version is
`0.0.0`, so a pin written from the command name alone installs something else
under the name your build then trusts.

The checker needs no build, no database and no credentials, so give it its own CI
job rather than appending it to one that builds. It needs no git history either —
check out shallow.

## Declaring an inventory

Three of the four checks work anywhere. `inventories` has to derive something
from *your* code, which is the one thing this plugin cannot know: routes come
from NestJS decorators in one repository, an Express router in another, an
OpenAPI document in a third.

So the derivation is yours. `openspec-flow.json` at the repository root:

```json
{
  "derivers": {
    "routes": "./scripts/derive-routes.mjs"
  }
}
```

The module default-exports `(root) => string[]`, and **should** also export
`normalise(item) => string`:

```js
export default function deriveRoutes(root) { /* ... */ }

// Applied to BOTH sides — your derived items and the ones the declaring
// requirement lists.
export function normalise(item) { /* ... */ }
```

`normalise` being applied to both sides is what makes the comparison symmetric.
Only you know that `:id` and `:widgetId` are one route, or that a query string
is not part of a path — but normalising only your own side reports every
difference of spelling as drift. That was the first bug this seam produced, found
by running the plugin against a real repository whose repo-local version had
normalised both sides inside one function.

A capability then opts in, **inside** the requirement making the claim:

```markdown
### Requirement: Versioned REST surface

<!-- enumerates: routes -->

The system SHALL expose the following endpoints...
```

Placement matters and is the opposite of the `drops-scenario` marker's rule —
see the `openspec-spec-drift` skill for why.

An inventory no capability declares passes silently. Deciding that something
deserves a capability is a judgement, not a defect.

## What it cannot do

No check here reads application code, so none can tell you whether a requirement
is still **true** — only whether a stated claim has stopped holding. A capability
can be structurally perfect, pass every check, and explain its behaviour with a
reason that stopped being true months ago. That class needs a reader.

## Developing this package

```bash
npm test            # 37 unit tests, no dependencies, no fixtures on disk
npm run test:bin    # packs, installs and drives the bin the way a consumer gets it
npm run test:gates  # watches each /start-change and /stop-change refusal refuse
```

All three run in CI (`.github/workflows/ci.yml`) on every pull request and every
push to `master` — the unit tests across Node 20, 22 and 24, the smoke test on
22, the gate refusals on git alone.

The two are not redundant. Every unit test imports a module under `lib/`
directly and never reaches the entry point, so when the bin silently exited 0
through its npm symlink all 37 stayed green: `process.argv[1]` is the symlink
while `import.meta.url` is the real file, and the entry guard compared them
directly. `scripts/check-specs/smoke-bin.sh` covers that seam by installing the
packed tarball into a throwaway project and making four observations — the bin
prints its usage, a missing `openspec` CLI fails loudly rather than passing, a
seeded dropped scenario is caught *and named*, and restoring it goes green
again.

Watched failing before being trusted, per the `openspec-evidence` skill:
reintroducing that entry guard leaves `npm test` at 37 passed while the smoke
test reports three failures.

`scripts/gates/refusal-cases.sh` does the same job for the two gates, which are
prose and so cannot be run. It builds each refusing state in a throwaway
repository and checks that the detection command the command file names says
something **different** there than in the adjacent permitting state — 16
observations, both directions of every boundary. A refusal whose condition no
command can observe is a sentence, not a gate. Watched failing too: narrowing the
name search to `-maxdepth 1` reddens exactly the two observations that read it,
and stubbing `@{upstream}` so it always resolves reddens exactly the no-upstream
refusal. What it does **not** cover is printed by the run itself — the "does this
deserve a change?" judgement, the pull-request states, and whether an agent obeys
a refusal it can see.

## Licence

MIT
