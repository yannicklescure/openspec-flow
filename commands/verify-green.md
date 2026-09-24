---
name: verify-green
description: Confirm every required CI check passed against the pull request's current head SHA, by name, without trusting a watch command's exit code.
---

Report whether the named pull request is genuinely green.

```bash
SHA=$(gh pr view <n> --json headRefOid -q .headRefOid)
echo "PR head:    $SHA"
echo "local HEAD: $(git rev-parse HEAD)"
gh api "repos/<owner>/<repo>/commits/$SHA/check-runs" \
  -q '.check_runs[] | "\(.conclusion // .status)\t\(.name)"' | sort
gh pr view <n> --json mergeable,mergeStateStatus
```

Green means: **every** required check reads `success`, against that exact SHA,
and the SHA still matches local `HEAD`.

Report anything else as not green, naming which checks are outstanding. In
particular:

- `gh pr checks --watch` exits 0 when its head is replaced mid-watch. Its exit
  code is not evidence.
- `mergeStateStatus: UNSTABLE` means checks are pending. `CLEAN` is the one to
  wait for.
- If every check reports at once on a first poll after a push, suspect that the
  API had not yet registered runs for the new head and is answering about the
  old one. Re-read the SHA.
