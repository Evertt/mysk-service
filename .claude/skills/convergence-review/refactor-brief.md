# Convergence review: refactor brief template

Each session card's brief covers the points below, in your own words, filled in for its finding.
Pass the background (`fresh` context) as two or three sentences:

- the review and its doc;
- the batches already merged;
- the owner's goal: one way per recurring problem, DRY through composition, factories and
  codegen, reputable third-party utilities first.

1. **Setup:**
   - start the worktree from local `develop` with `git reset --hard develop`, since it may hold
     unpushed merges;
   - rename the branch after the task: `git branch -m <name>`;
   - set up the worktree as AGENTS.md says.
2. **The finding:** quote it from the review doc, with every copy's `path:line`, and the one way
   to build.
3. **Recorded decisions** that bound it, and where they're written.
4. **The guard:** the spec that refuses the hand-written form, with a reason for every exception
   on its allow-list, and the `kit.md` entry, plus a one-line pointer in AGENTS.md only if the
   kit's pointer doesn't already cover it.
5. **Overlap:** the other sessions in the batch, and the files to keep away from.
6. **Done when:**
   - the copies are converted, and the guard and kit entry have landed;
   - the pre-commit steps in AGENTS.md pass for what changed;
   - the e2e runs go through the shared lock.

   Not the full suite: the coordinator runs `pnpm test:unit` after each merge, and CI runs the
   rest. Commit in logical commits, and report the branch, the worktree path, the net line delta
   and the convergence: how many places now take the one way.
