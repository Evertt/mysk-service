---
name: convergence-review
description: Review the whole codebase for convergence: one way per recurring problem, DRY, enforced by guard specs.
disable-model-invocation: true
---

# Convergence review

The owner wants one system: every recurring problem in this app solved **one way**, and as little
hand-written repetition as possible. This review's job is **convergence**:

- find each problem that is solved more than one way;
- pick or design the one way;
- plan the refactors that bring every place onto it, each landing with a guard spec.

Bug hunting and redesigning domain logic are out of scope, except where they remove duplication.

What already holds:

- `docs/agents/kit.md` is the current catalogue of one ways.
- The decisions recorded in AGENTS.md, `docs/agents/*.md` and `docs/reviews/` stand. For example,
  small lists stay client-side.
- The arguments of the invocation narrow or extend the scope; follow them.

## Steps

1. **Load the standards.** The thermo-nuclear code-quality review sets the bar: be ambitious, look
   for code judo, and delete complexity rather than move it. Its skill can only be started by the
   user, so find its file instead:
   `find "$HOME/Library/Application Support/Claude" "$HOME/.claude" -path '*thermo-nuclear-code-quality-review/SKILL.md' 2>/dev/null | head -1`.
   Read it, and pass its path to every reviewer in step 3. It's written for a branch's diff;
   here it applies to the whole codebase. If the file isn't found, say so: the reviewer brief's
   own standards then carry the review alone.
   Done when you have the path, or have told the user it's missing.

2. **Slice.** Measure the non-test source (`src/`, `scripts/`) by folder. Split it into 5 or 6
   slices of similar size whose folders belong together, for example generic UI, server
   infrastructure with codegen, core domains with their routes, and two or three groups of
   modules with the portals.
   Done when every source folder is in exactly one slice.

3. **Census.** Copy [`reviewer-brief.md`](reviewer-brief.md) to the scratchpad. Start one
   read-only reviewer per slice, all in parallel and in the background. Each gets the brief's
   path, the thermo-nuclear skill's path, its slice name and folders, and a focus line for what
   its slice is most likely to hold.
   Done when every reviewer has reported.

4. **Correlate and verify.** Merge the reports.
   - A shape that 3 or more slices found independently ranks highest.
   - Spot-check every top-ranked claim against the code yourself, with counts, a file read or a
     grep, before it reaches the report.
   - Note the bugs found along the way separately.

   Done when every finding in the report has been checked or is marked unverified.

5. **Write** `docs/reviews/<date>-convergence.md`, in this order:
   1. a verdict: what holds, and where the system diverges;
   2. a status table, filled in as batches land;
   3. the findings, ranked, each with its four parts (see the reviewer brief);
   4. the batch plan: refactors that touch disjoint files run side by side, in dependency order
      (shared helpers before their users), with renames last and alone;
   5. "making the system enforce itself": the guard specs and `kit.md` entries the batches add.

   Summarise it in chat, then propose the first batch as session cards, each with a brief built
   from [`refactor-brief.md`](refactor-brief.md). At most three side by side; the rest wait for a
   later batch.

## Value

Every finding states its **net lines**: the copies deleted, minus what the new piece and its tests
cost. Fewer lines are a payoff, not the bar. Replacing several variants with one guarded way is
worth doing even when the count stays flat, because a new feature then has one obvious way to be
built and a spec that keeps it that way. Rank by both: how many places converge, and how much code
goes. Name which one carries each finding.
