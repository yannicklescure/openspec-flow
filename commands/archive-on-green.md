---
name: archive-on-green
description: Verify CI green against the current head SHA by name, then archive the change and verify the applied delta.
---

Archive the named OpenSpec change, but only on verified green. Take the change
name from the argument, or infer it from `openspec list` if exactly one is
active.

**1. Resolve and pin the head.**

```bash
gh pr view <n> --json headRefOid -q .headRefOid
git rev-parse HEAD
```

They must match. If they differ the head moved — stop and say so rather than
archiving against a commit that is not what CI tested.

**2. Confirm every required check by name against that SHA.**

```bash
gh api "repos/<owner>/<repo>/commits/<SHA>/check-runs" \
  -q '.check_runs[] | "\(.conclusion // .status)\t\(.name)"' | sort
```

Do not use `gh pr checks --watch`'s exit code as evidence — it exits 0 when its
head is replaced mid-watch. Every check must read `success`. Anything
`in_progress` means hold, not proceed.

**3. Snapshot what the archive will change**, so the apply can be verified
rather than trusted: the requirement's scenario count, whether it is declared
once, and for a `skip_specs` change a checksum of the specs tree.

**4. Archive.**

```bash
openspec archive <name> --yes
```

**5. Verify the apply.**

- the requirement is declared exactly once
- a `MODIFIED` requirement kept every scenario it had
- a `skip_specs` change left the specs tree byte-identical to the checksum
- `openspec validate --specs --strict` passes
- the project's own spec checks pass

**6. Commit with explicit paths.** Never `git add` a directory — it sweeps in
unrelated in-flight change folders.

**7. Stop before merging.** Merge is the human gate; report and wait.
