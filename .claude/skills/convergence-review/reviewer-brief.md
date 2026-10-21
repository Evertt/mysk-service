# Convergence review: reviewer brief

You review one slice of this codebase (named in your prompt) for **convergence**: every recurring
problem solved one way, and as little hand-written repetition as possible. Stay in your slice,
but compare it with the rest of the codebase, because a variant often lives in another slice.

## Rules

- **Read only.** Don't edit, commit, stash or switch branches. Don't run tests, `pnpm run check`,
  lint or svelte-check: other reviewers share this machine. Keep notes in your own scratch folder,
  named in your prompt.
- Read `CLAUDE.md`, `docs/agents/structure.md`, `docs/agents/kit.md`, and the
  `docs/agents/*.md` that govern your slice. They are the recorded one ways and decisions.
- Read the thermo-nuclear review skill at the path in your prompt. It sets the bar: be ambitious,
  find the code judo move that deletes a category of complexity, and push past "a bit cleaner". Its
  red flags apply too: files past ~1,000 lines, special-case branches in shared paths, thin
  wrappers, cast-heavy or optional-heavy boundaries, logic in the wrong layer.
- Use CodeGraph (`codegraph_explore`, or `codegraph explore "<query>"`) before grep and file reads.
  Grep is right for counting copies.

## Census

Answer every question for your slice:

1. **Bypassed kit.** For each entry in `kit.md`, find the places in your slice that hand-roll it
   anyway, and why. An entry bypassed for a reason has too narrow an interface: that's the
   finding, not its callers.
2. **Unnamed shapes.** Find recurring shapes the kit doesn't cover yet. Name the variants, count
   them, and show 3 examples with `path:line`.
3. **Overlapping kit.** Find kit pieces that overlap each other: two components or helpers for one
   job.
4. **Generated, not written.** Find code that is a pure function of a folder, an enum, a schema or
   a list definition. The generator (`scripts/modules/`, `scripts/generate.ts`) should write it.
5. **Third-party first.** Find home-grown code that runed, svelte-toolbelt, bits-ui or another
   reputable library already provides.

Two copies count: a second module copying the first is the moment to generalise. "Framework glue"
is a shape like any other.

## Every finding

- **Title** and kind: `bypassed-kit`, `unnamed-shape`, `overlapping-kit`, `generated` or
  `third-party`.
- **Where:** every copy, or a count plus 3 examples, with `path:line`.
- **The one way:** its signature, props or codegen input, sketched in a few lines of code.
- **Net lines:** the copies deleted, minus what the new piece and its tests cost. Also give the
  **convergence**: how many places move onto one way. A flat or slightly positive count is
  fine when the convergence is real; say so.
- **The guard:** the spec that will refuse the hand-written form, and its `kit.md` entry.
- **Files touched**, so refactors can run side by side without conflicts.
- **Confidence:** high or medium.

Aim for 8 to 15 findings, most important first. List any bugs you notice separately, in one line
each. End with the patterns you saw that probably repeat in other slices. Your final message is the
report.
