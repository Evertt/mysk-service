# Test subject imports (SPIKE)

**Status: feasibility spike, not adopted** (October 2026). The prototype (the shims in
`scripts/modules/subjects.ts`, the Vite plugin, five converted specs) lived on a branch that was
deleted; only these findings were kept. Tests import their subjects through aliases, as AGENTS.md says.

## The question

Since the tests moved to `src/tests/unit/` (mirroring `src/`) and `src/modules/<id>/tests/unit/`
(mirroring the module), they import their subjects through aliases (`#lib/…`, `#modules/<id>/…`).
Can a test instead import its subject's folder as if it still sat next to it, with every tool
agreeing? `src/tests/unit/lib/orders/server/pricing.spec.ts` would import `./pricing.ts` and
`../extensions.ts`; `src/modules/materials/tests/unit/server/stock.spec.ts` would import
`./stock.ts` and `../model.ts`.

## Verdict

**It works, but not the way first proposed.** A Vite plugin handles runtime. TypeScript works
through generated re-export shims (the way SvelteKit's `./$types` works), not through `rootDirs`
laid over the test trees: that version resolves a module's test to **another module's file**.
With the shims, svelte-check, tsgolint, the editor and the import specs all work, and knip needs an
adapter.

**Recommendation: neither, for now. Keep the aliases.** If renaming module folders becomes a real,
recurring cost, use plain relative imports with the shims and the plugin described here. Don't use
`$subject`. Reasons are at the end.

## How the prototype works

The rule: each test tree overlays a subject tree. `src/tests/unit` overlays `src`, less
`src/modules` (core never imports a module). Each `src/modules/<id>/tests/unit` overlays
`src/modules/<id>`. For a relative import in a test:

1. If a file is there, next to the test, it wins (a harness, a fake, `display.test-support.ts`).
2. Otherwise the import resolves at the same place in the subject tree.
3. The mapping applies to the **target**, and only while the target stays inside the test tree.
   An import that climbs out (`../../../contracts/…` from a module's test, `../modules/x` from a
   core test) is not mapped.

All of it is in `scripts/modules/subjects.ts`, with a spec next to it:

- **Runtime:** `subjectsPlugin()`, a `resolveId` hook with `enforce: "pre"`, registered in
  `vite.config.ts`. It applies only to importers inside a test tree, and only after
  `this.resolve(…, { skipSelf: true })` finds nothing next to the test. Every Vitest project that
  extends `vite.config.ts` gets it. In dev, it also rewrites the shims when files come or go.
- **Types:** `planSubjectShims()` mirrors each test tree under `.svelte-kit/subjects/`, with one
  shim per subject file. For example, `.svelte-kit/subjects/src/tests/unit/lib/orders/display.ts`
  contains `export * from "…/src/lib/orders/display.ts"`, plus `export { default }` when the
  subject has a default export. A component's shim is `x.d.svelte.ts`. `tsconfig.json` sets
  `rootDirs: [".", ".svelte-kit/types", ".svelte-kit/subjects"]` and
  `allowArbitraryExtensions: true`. `generateModules()` writes the shims through `syncFolder`:
  665 shims, 2.6 MB, gitignored with the rest of `.svelte-kit`. That runs in `pnpm generate`,
  `prepare`, and every time `vite.config.ts` loads.
- **Converted specs:**
  - `src/tests/unit/lib/orders/display.spec.ts` (Node). Mixes a subject import with a real file in
    the test tree.
  - `src/tests/unit/lib/orders/server/pricing.spec.ts` (Node, relative `vi.mock`, including a
    generated `hooks.gen.ts`).
  - `src/tests/unit/lib/extensions/extension-slot.svelte.spec.ts` (browser). Covers a `.svelte`
    subject, relative `vi.mock`, a relative `import()` inside a mock factory, and real harnesses
    next to the spec.
  - `src/modules/materials/tests/unit/server/stock.spec.ts` (module, Node, `vi.mock` factory with a
    relative `import()`).
  - `src/modules/contracts/tests/unit/ui/sla-badge.svelte.spec.ts` (module, browser, `.svelte`).

The first commit on the branch holds the `rootDirs`-overlay version, for the record.

## Findings

### Overlaying the trees with `rootDirs` (first attempt): blocker for modules

TypeScript's `rootDirs` doesn't pair one directory with another. It merges **every** listed root
into one virtual folder. For a relative import that finds nothing at its literal place, TypeScript
takes the longest root that prefixes the target, keeps the rest of the path, and tries that rest in
**every other root, in list order**. The order is the same for every importer.

Overlaying the trees needs `src`, `src/tests/unit` and, per module, `src/modules/<id>` and
`src/modules/<id>/tests/unit`. A module test's `./schema.ts` (rest `server/schema.ts`) is then tried
in `src/modules/contracts/` before `src/modules/materials/`. svelte-check confirmed it:
`stock.spec.ts`'s `../model.ts` and `./schema.ts` resolved to **contracts'** files ("has no
exported member 'MaterialUnit'"). This happens for correct imports, not only broken ones, because
modules share file names (`module.ts`, `model.ts`, `server/index.ts`, `server/schema.ts`). No single
order suits every module. The same merge also lets a broken relative import in module source code
type-check against a sibling module. The core alone would have worked, since `src` comes before the
module roots.

knip resolves `rootDirs` with its own loop and has the same problem (see knip below).

### Merging with Kit's `rootDirs`: works, no hook needed

- `node_modules/$app/tsconfig.json` (Kit 3, written by `svelte-kit sync`) sets
  `rootDirs: ["../..", "../../.svelte-kit/types"]`. A user `rootDirs` **replaces** it rather than
  adding to it, so `tsconfig.json` repeats Kit's two entries. Kit's validation
  (`write_tsconfig/validate.js`) checks `paths`, `types` and the essential options, not `rootDirs`,
  and `svelte-kit sync` printed no warning.
- Kit's only hook is `typescript.config`. It's deprecated in Kit 3 ("Add configuration to
  `tsconfig.json` directly"), so I didn't use it. `extends` also accepts an array, which the first
  commit used for a generated `tsconfig.gen.json`. The shim version doesn't need generated
  `rootDirs`: its list is static.
- **Nesting** (tested in a minimal project with `tsc --traceResolution`): a root nested in another
  resolves correctly, and the real file in the test tree wins. One catch: once `src` is a root, a
  route's `src/routes/x/$types` matches `src` (the longer prefix) and is looked up as
  `routes/x/$types` in the other roots, so `./$types` **breaks** unless `.svelte-kit/types/src` is
  also a root. Verified both ways. The shim version never adds `src`, so `$types` isn't affected.
  The full svelte-check passes, including the routes that use `./$types`.

### Runtime plugin: works in both Vitest projects

- The `server` (Node) and `client` (Chromium) projects both run the five specs: 53 tests pass. With
  the plugin switched off, all five files fail ("Cannot find module './display.ts'", "Failed to
  fetch dynamically imported module"). The plugin is what makes them pass, not a cache.
- `vi.mock("./x.ts")` paths work in Node and the browser. Vitest resolves them through the same
  plugin container, so a relative mock and the subject's own import resolve to one id. The
  `pricing` and `extension-slot` tests depend on their mocks taking effect, and they pass.
- `.svelte` imports in component tests, `import()` inside hoisted `vi.mock` factories, and
  generated files (`hooks.gen.ts`, `contributions.gen.ts`, `manifests.gen.ts`) all work.
- **Caveat, `fsModuleCache: true`:** the transformed spec, with its resolved ids, is cached by the
  spec's content. I added a file in the test tree with the subject's name: the cached run still
  loaded the subject, and only `--fsModuleCache=false` loaded the new file. Aliases never hit this,
  because their target doesn't depend on which files exist. Fix it with `vp test --clearCache` after
  adding or removing a file that shadows a subject.

### Per tool

| Tool                         | Result               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / svelte-check    | Works (shims)        | Full run: 3724 files, 0 errors, 0 warnings, 37 s. A probe confirmed: real errors are still reported (missing file, wrong type, a component's props typed through its `.d.svelte.ts` shim), a module test resolves its own module, and nothing climbs out of an overlay. Needs `allowArbitraryExtensions` for the component shims.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Vite / Vitest                | Works (plugin)       | Node and browser, `vi.mock`, `.svelte`, `import()` in factories. Watch out for the fsModuleCache caveat above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Editor (TS server)           | Works                | Run through TypeScript's language service: go to definition on `plannedStatus` lands in `src/lib/orders/display.ts`. Clicking the specifier `"./display.ts"` opens the shim, like `./$types`. Shims for new files appear only after the generator runs (the dev server, or `pnpm generate`), as with Kit's `$types`. The Svelte extension uses the same tsconfig, but I didn't check `.svelte` go to definition in an editor.                                                                                                                                                                                                                                                                                                                |
| oxlint (tsgolint)            | Works                | `typescript/no-deprecated` fired on a `@deprecated` export imported through a shim, so tsgo follows `rootDirs` and the shim. The project enables no `import/*` rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `import-extensions.spec.ts`  | Small adapter (done) | Without it, the check would miss a wrong extension (`./display.js` for `display.ts`): it looked only next to the test, and TypeScript and Vite both accept `.js` for `.ts`. Now `found()` also looks at `subjectTarget()`. It has a made-up case, and it caught the real one when I planted it.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `domain-boundaries.spec.ts`  | Works                | Tests are exempt from the barrel rules, and a test's file isn't in a domain, so its relative imports aren't held to anything.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `modules/boundaries.spec.ts` | Works                | It resolves relative imports literally. For a module's test, the literal target is under the same `src/modules/<id>/`, so "own module" comes out right. Imports that climb out aren't mapped, by plugin or shim, so its view matches the tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| knip                         | Adapter needed       | Tested on a minimal project (I couldn't scope knip to the prototype). knip resolves `rootDirs` itself (`resolve-module-names.js`), so it sees the shim, but it doesn't follow a re-export from a file outside `project`, let alone a gitignored one. Exports used only by tests came back as **unused exports**. Fixed by adding `.svelte-kit/subjects/**/*.ts` to `project`, the same glob to `ignore` (otherwise every unused shim is an "unused file"), and `--no-gitignore`. In the real project, that last flag also exposes `*.gen.ts`, the `(modules)` stubs and paraglide, so `knip.ts` would need rethinking. The `rootDirs`-overlay version needed nothing in knip for the core, but it resolves modules wrongly, like TypeScript. |

### Precedence when names collide

A real file next to the test **always wins**, in TypeScript (the literal place comes first, before
`rootDirs`) and at runtime (the plugin tries `this.resolve` first). I verified both. Only when
nothing is there does the import fall through to the subject. A test can therefore keep a fake
named like a subject file, but that fake silently shadows the subject for every test in that
folder.

## `$subject` vs plain relative imports

- **`./$subject` naming "the subject file" can't work.** A specifier resolves per folder, not per
  importing file, so `pricing.spec.ts` and `hooks.spec.ts` in the same folder would get the same
  `$subject`. The only workable form names a folder: `./$subject/pricing.ts`, `../$subject/x.ts`.
- **It needs the same machinery:** shims (as `.svelte-kit/subjects/…/$subject/…`) and the plugin.
  The plugin becomes mandatory for every subject import, where plain relative imports at least look
  like ordinary paths.
- **What it gains: explicitness.** A reader sees that the import crosses into the subject tree.
  There's no shadowing hazard (no precedence rule needed), and you can grep for it.
- **What it costs: a non-standard specifier.** Every tool has to learn it. `import-extensions.spec`
  skips any specifier containing `$` today, the boundary specs would need it, and knip would need
  the same adapter. Formatters and editors' path completion don't know it.
- **On top of plain relative imports:** two ways to write the same import. Not worth it.

Plain relative imports beat `$subject`.

## Why not migrate now

The benefit is narrow. Relative imports survive renaming a module's folder (its id), and they read
like the code's own imports. Moving a subject file still means moving its test, either way. The
alias rename is one mechanical search-and-replace.

The costs are standing ones:

- 665 generated shims, rewritten by the generator (about 160–300 ms per run, and `vite.config.ts`
  runs it on every load).
- A Vite plugin on every test resolution.
- A second resolution rule a reader can't see in the file. `./pricing.ts` isn't next to the spec,
  and searching for `pricing.ts`'s importers misses the specs.
- The shadowing hazard, and the fsModuleCache staleness that comes with it.
- A knip setup that has to stop respecting `.gitignore`, or find another way through the shims.
- `tsconfig.json` repeating SvelteKit's `rootDirs`, so a change to Kit's list wouldn't reach it.

## What a full migration would take

1. **Decide the scope rule.** Should a test import the whole subject tree relatively, or only its
   own domain or module, with the rest (`#lib/models.ts`, `#lib/server/…`) staying aliases? The
   prototype's specs do the latter, matching the in-domain rule for code.
2. **Codemod about 147 test files.** For each `#lib/…`, `#routes/…` or `#modules/<own id>/…`
   specifier that lands inside the test's overlay (and inside the scope rule), write the relative
   path as seen from the mirrored folder. Include `vi.mock`, `vi.importActual` and `import()`. Keep
   `#unit/` and `#e2e/` as they are.
3. **Make the generator production-grade.**
   - Track default exports appearing or disappearing: the dev watcher reruns on add/unlink only,
     not on change.
   - Cache the file reads (mtime).
   - Decide whether paraglide and the `(modules)` stubs stay out (they do now).
   - Remove the `SPIKE` markers.
   - Add a resolve test of the plugin on a fixture, beyond the pure-function spec.
4. **knip:** work out the `project` + `ignore` + `.gitignore` setup on the full project, then run
   `pnpm knip` and fix what it reports.
5. **Document it in AGENTS.md "Tests":** the import rule, the precedence rule, "fakes don't take a
   subject's name", the `--clearCache` caveat, and that shims appear after `pnpm generate`, like
   `$types`.
6. **Keep e2e as it is.** The e2e project has no plugins, and its tests import by alias.
7. **Watch SvelteKit releases** for changes to its own `rootDirs`, since `tsconfig.json` copies
   them.
