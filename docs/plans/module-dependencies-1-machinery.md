# Module dependencies, part 1: the machinery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modules can require and enhance each other, tenants switch them on and off along those dependencies, modules talk to each other only through an `api/` folder, and extension points are declared by their owners (core or a module) and contributed to by file or by `contribute()`.

**Architecture:** The generator (`scripts/modules/`) reads each module's `requires`/`enhances`/`alwaysOn` as literals, checks the graph, orders every registry by dependency and writes the graph to `ids.gen.ts`. A pure `#lib/modules/graph.ts` works out which modules are on and what a switch changes. Extension points become typed values (`defineSlot`, `defineBulkTable`, `defineCollector`, `defineEvent`, `defineVote`) in their owner's `extensions.ts`; the kernel dispatches hooks (`collect`/`emit`/`vote`) and renders slots (`<ExtensionSlot>`) from generated registries. Boundary specs enforce the `api/` rules, read-only foreign tables and foreign keys along `requires`.

**Tech Stack:** SvelteKit 3 (remote functions), Svelte 5, TypeScript, drizzle (SQLite), valibot, Vitest (+ vitest-browser-svelte, Playwright e2e), pnpm, Vite+ (`vp`).

**Spec:** [`docs/plans/module-dependencies.md`](module-dependencies.md), sections 1–3 and the matching parts of 6. Parts 2–5 of its "Order of work" (roles, the schedule pilot, the portal pilot, the inspector) get their own plans once this one is merged, because they build on the names this plan settles.

**Prerequisite:** the slot isolation branch (`slot-error-boundaries`: a `<svelte:boundary>` per slot contribution in `src/routes/(app)/module-slots.svelte`, `slotLoaders()` returning `{ id, load }`) is merged into main before Task 7.

## Global Constraints

- Follow `AGENTS.md`: imports name a file by its real extension (`.ts`, `.svelte.ts`, `.svelte`); every user-facing text is a message added to `messages/en/<section>.json` and `messages/nl/<section>.json` together (Dutch informal, sentence case); no messages at module scope.
- Every select, update and delete on a tenant table includes `inTenant()` (or `idInTenant`/`idsInTenant`/`tenantJoin`); every mutation logs with `recordActivity(tx, …)` inside its transaction.
- Remote functions come only from the gated sets in `#lib/server/remote-functions.ts` (`forMembers`, `forManagers`, …) or a module's `moduleRemote()` set.
- Core never imports a module; a module imports another module only through `#modules/<id>/api/…` and only along `requires` (with `enhances`: only `api/extensions.ts` and types).
- Extension-point ids are string literals starting with their owner's id (`orders.detail.side`, `invoicing.billableItems`); module ids match `^[a-z][a-z0-9-]*$`.
- Registry order everywhere (hooks, slots, bulk actions, seeds) is dependency order over `requires`, ties broken by id.
- Each task ends with a commit (message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Run single test files while working (`pnpm vp test run <file>`, e2e: `pnpm vp test run --project e2e <file>`); the coordinator runs `pnpm run check`, `pnpm knip` and `pnpm test` before merging.

## Review Focus

1. **A stored module whose requirement is off** (a row for `b`, which requires `a`, without one for `a`): `b` must be off everywhere: its pages and remote functions 404, its slots render nothing, its hooks aren't called. Pinned in Task 2 (`effectiveModules`) and Task 5 (dispatch skips modules that aren't on).
2. **A switch-off sent past the UI** (a tampered form switching off `a` while `b` is on, or switching off an always-on module): refused with a message naming the dependents, nothing stored or logged. Pinned in Task 3.
3. **A `skip` collector that throws** (an order badge module failing): the list and the order page still render, without that module's badges, and the error is logged with the module and point id; a `fail` collector (prices) still fails the request. Pinned in Task 5.
4. **An `enhances` contribution whose owner is off** (contracts' fees when invoicing is off; contracts' cards when contracts is on and invoicing off): not called, and nothing breaks for the module that is on. Pinned in Task 5 and Task 6.
5. **A manifest value that isn't a literal** (`requires: deps` from a variable): the generator would read nothing and the graph would silently differ from the manifest. Pinned in Task 1 (a spec compares the generated graph with the manifests' runtime values).

---

## File structure

| File                                                                                                                                                     | Responsibility                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/modules/manifest.ts` (new)                                                                                                                      | Reads `requires`, `enhances`, `alwaysOn` from a `module.ts` source as literals                                                    |
| `scripts/modules/graph.ts` (new)                                                                                                                         | Checks the graph (unknown/own ids, cycles) and sorts modules by dependency                                                        |
| `scripts/modules/extensions.ts` (new)                                                                                                                    | Finds declared extension points and file contributions, checks them, renders `contributions.gen.ts`                               |
| `scripts/modules/shared.ts`, `find.ts`, `registries.ts`, `generate.ts`                                                                                   | `ModuleFolder` gains the graph fields; registries in dependency order; `ids.gen.ts` gains the graph                               |
| `src/lib/modules/graph.ts` (new)                                                                                                                         | Pure: `effectiveModules()`, `requirementsOf()`, `dependentsOf()`, `checkModuleSet()`                                              |
| `src/lib/modules/ids.ts`                                                                                                                                 | Exports `moduleGraph` from `ids.gen.ts`                                                                                           |
| `src/lib/extensions/define.ts` (new)                                                                                                                     | Isomorphic declarations: `defineSlot`, `defineBulkTable`, `defineCollector`, `defineEvent`, `defineVote` and their types          |
| `src/lib/server/extensions.ts` (new)                                                                                                                     | Server dispatch: `contribute()`, `collect()`, `emit()`, `vote()`; replaces the hook plumbing in `src/lib/server/modules/hooks.ts` |
| `src/lib/orders/extensions.ts`, `src/lib/equipment/extensions.ts`, `src/lib/dashboard/extensions.ts` (new)                                               | Core's extension points                                                                                                           |
| `src/modules/invoicing/api/extensions.ts` (new)                                                                                                          | `invoicing.billableItems`                                                                                                         |
| `src/routes/(app)/extension-slot.svelte` (replaces `module-slots.svelte`), `extension-bulk-actions.svelte.ts` (replaces `module-bulk-actions.svelte.ts`) | Render a point's contributions for the tenant                                                                                     |
| `src/lib/orders/server/order-changes.ts`                                                                                                                 | New service `setOrdersStatus()` (moves invoicing's direct writes to `order`)                                                      |
| `src/modules/boundaries.spec.ts`, `src/lib/server/db/modules.spec.ts`                                                                                    | `api/` import rules, read-only foreign tables, foreign keys along `requires`                                                      |

---

### Task 1: Read the dependency graph in the generator

**Files:**

- Create: `scripts/modules/manifest.ts`, `scripts/modules/manifest.spec.ts`, `scripts/modules/graph.ts`, `scripts/modules/graph.spec.ts`
- Modify: `scripts/modules/shared.ts` (`ModuleFolder`), `scripts/modules/find.ts`, `scripts/modules/check.ts`, `scripts/modules/registries.ts`, `scripts/modules/registries.spec.ts`, `scripts/modules/generate.ts`, `scripts/modules/test-helpers.ts`, `src/lib/modules/manifests.ts` (`ModuleParts`), `src/lib/modules/ids.ts`, `src/lib/modules/manifests.spec.ts`, `src/lib/server/db/seed/module-seed.ts`, `src/lib/server/db/seed/index.ts`

**Interfaces:**

- Produces:
  - `readManifestGraph(source: string): { requires: string[]; enhances: string[]; alwaysOn: boolean; problems: string[] }` in `scripts/modules/manifest.ts`. `problems` holds `"requires must be a list of string literals"` (same for `enhances`; `"alwaysOn must be true or left out"`) when the key is present but not a literal.
  - `ModuleFolder` gains `requires: string[]`, `enhances: string[]`, `alwaysOn: boolean`.
  - `graphProblems(modules: ModuleFolder[]): string[]` and `byDependency(modules: ModuleFolder[]): ModuleFolder[]` in `scripts/modules/graph.ts`.
  - `ids.gen.ts` exports `generatedModuleGraph: Record<ModuleIdLiteral, { requires: readonly string[]; enhances: readonly string[]; alwaysOn: boolean }>` (`as const`), and `generatedModuleIds` in dependency order.
  - `#lib/modules/ids.ts` exports `moduleGraph` (typed `Readonly<Record<ModuleId, ModuleNode>>`, `ModuleNode = { requires: readonly ModuleId[]; enhances: readonly ModuleId[]; alwaysOn: boolean }`).
  - `ModuleParts` (`#lib/modules/manifests.ts`) gains `requires?: readonly ModuleId[]`, `enhances?: readonly ModuleId[]`, `alwaysOn?: true`.

- [ ] **Step 1: Write the failing specs**

`scripts/modules/manifest.spec.ts`:

```ts
test("reads literal lists and the flag", () => {
	const source = `export default defineModule({ id: "b", requires: ["a"], enhances: ["c", "d"], alwaysOn: true });`;
	expect(readManifestGraph(source)).toEqual({
		requires: ["a"],
		enhances: ["c", "d"],
		alwaysOn: true,
		problems: [],
	});
});
test("defaults to no dependencies", () => {
	expect(readManifestGraph(`defineModule({ id: "a" })`)).toEqual({
		requires: [],
		enhances: [],
		alwaysOn: false,
		problems: [],
	});
});
test("refuses what isn't a literal", () => {
	expect(readManifestGraph(`defineModule({ id: "a", requires: deps })`).problems).toEqual([
		"requires must be a list of string literals",
	]);
});
```

`scripts/modules/graph.spec.ts` (modules built with `module(id, { requires, enhances })` from `test-helpers.ts`):

```ts
test("finds unknown and own ids", () => {
	expect(graphProblems([module("a", { requires: ["a", "x"] })])).toEqual([
		"src/modules/a requires itself.",
		"src/modules/a requires x, which isn't a module.",
	]);
});
test("finds a requires cycle and prints it", () => {
	const modules = [module("a", { requires: ["b"] }), module("b", { requires: ["a"] })];
	expect(graphProblems(modules)).toEqual(["src/modules: a requires cycle: a → b → a."]);
});
test("allows enhances both ways", () => {
	expect(
		graphProblems([module("a", { enhances: ["b"] }), module("b", { enhances: ["a"] })]),
	).toEqual([]);
});
test("sorts by requires, ties by id", () => {
	const modules = [module("a", { requires: ["c"] }), module("b"), module("c")];
	expect(byDependency(modules).map((m) => m.id)).toEqual(["b", "c", "a"]);
});
```

`src/lib/modules/manifests.spec.ts` gains a test over the real registry: for every module, `moduleGraph[id]` equals `{ requires: manifest.requires ?? [], enhances: manifest.enhances ?? [], alwaysOn: manifest.alwaysOn ?? false }` (Review Focus 5).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vp test run scripts/modules/manifest.spec.ts scripts/modules/graph.spec.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- `readManifestGraph`: regex over the source, like `declaredId` in `find.ts` (`/\brequires:\s*\[([^\]]*)\]/`, items must each be a quoted literal; a `requires:` key whose value isn't `[...]` of literals is a problem).
- `byDependency`: Kahn's algorithm over `requires`, picking the smallest id among the ready ones each round, so ties sort by id. `graphProblems` reports a cycle by following `requires` from the first module left over, in id order, until an id repeats.
- `discoverModules` fills the new fields and pushes `src/modules/<id>/module.ts: <problem>` for each problem; `checkModules` adds `graphProblems`; `generateModules` sorts the modules with `byDependency` before `renderRegistries`, so every `*.gen.ts` list is in dependency order.
- Remove `after` from `ModuleSeed` and `orderSeeds()` from `module-seed.ts`; `seed/index.ts` uses `moduleSeeds` as generated (already in dependency order). No module seed sets `after` today.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm vp test run scripts/modules src/lib/modules/manifests.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/modules src/lib/modules src/lib/server/db/seed
git commit -m "Read modules' requires and enhances, and order the registries by them"
```

---

### Task 2: Which modules are on

**Files:**

- Create: `src/lib/modules/graph.ts`, `src/lib/modules/graph.spec.ts`
- Modify: `src/lib/server/auth/session.ts` (`loadTenant`), `src/lib/server/auth/session.spec.ts`, `src/lib/modules/fakes.ts`

**Interfaces:**

- Consumes: `moduleGraph`, `ModuleNode` (Task 1).
- Produces, in `src/lib/modules/graph.ts` (pure, isomorphic; every function takes the graph last, defaulting to `moduleGraph`):
  - `effectiveModules(stored: readonly string[], graph?): ModuleId[]`: unknown ids dropped, always-on modules added, then modules without all their `requires` dropped until nothing changes; in graph (dependency) order.
  - `requirementsOf(id: ModuleId, graph?): ModuleId[]`: transitive `requires`, in dependency order.
  - `dependentsOf(id: ModuleId, graph?): ModuleId[]`: transitive modules that require `id`, in dependency order.
  - `fakeGraph` in `src/lib/modules/fakes.ts`, written in its dependency order: `base` (no deps), `addon` (requires `base`), `core-ish` (`alwaysOn`), `extra` (requires `addon`, enhances `side`), `side`.

- [ ] **Step 1: Write the failing spec** (`graph.spec.ts`, against `fakeGraph`)

```ts
test("drops a module whose requirement is off, transitively", () => {
	expect(effectiveModules(["addon", "extra"], fakeGraph)).toEqual(["core-ish"]);
});
test("keeps a module with its requirements, adds always-on ones, drops unknown ids", () => {
	expect(effectiveModules(["base", "addon", "gone"], fakeGraph)).toEqual([
		"base",
		"addon",
		"core-ish",
	]);
});
test("enhances doesn't make a module depend on another", () => {
	expect(effectiveModules(["base", "addon", "extra"], fakeGraph)).toEqual([
		"base",
		"addon",
		"core-ish",
		"extra",
	]);
});
test("requirements and dependents are transitive", () => {
	expect(requirementsOf("extra", fakeGraph)).toEqual(["base", "addon"]);
	expect(dependentsOf("base", fakeGraph)).toEqual(["addon", "extra"]);
});
```

`session.spec.ts`: `loadTenant()` for an organization with rows `addon` only returns `modules` without `addon` (mock `moduleGraph` with `fakeGraph`, as other specs mock `manifests.gen.ts`).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vp test run src/lib/modules/graph.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** the three functions, and in `loadTenant()` replace `.filter(isModuleId)` with `effectiveModules(rows.map((row) => row.id))`.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vp test run src/lib/modules/graph.spec.ts src/lib/server/auth/session.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules src/lib/server/auth
git commit -m "Turn a module off when what it requires is off"
```

---

### Task 3: Switching modules on and off along their dependencies

**Files:**

- Modify: `src/lib/modules/graph.ts` (+ spec), `src/routes/(app)/settings/settings.remote.ts` (`setModule` → `setModules`), `src/routes/(app)/settings/+page.svelte`, `messages/{en,nl}/settings.json`
- Test: `src/lib/modules/graph.spec.ts`, `e2e/tenancy.test.ts` (where switching modules is tested today, around its `organization_module` checks)

**Interfaces:**

- Consumes: Task 2.
- Produces:
  - `moduleSetProblems(stored: readonly ModuleId[], graph?): { module: ModuleId; missing: ModuleId[] }[]` in `src/lib/modules/graph.ts`: each stored module whose direct `requires` aren't all stored or always-on, with the missing ones.
  - `setModules` (forManagers form) in `settings.remote.ts`, input `{ enable: ModuleId[]; disable: ModuleId[] }` (valibot `v.array(v.picklist(moduleIds))`, both may be empty, not both). Works out the resulting stored set; refuses with `invalid(m.settings_modules_refused({ modules }))` when `moduleSetProblems` isn't empty or `disable` names an always-on module (Review Focus 2); otherwise inserts/deletes rows in one transaction and logs `module_enabled`/`module_disabled` per changed module, as `setModule` does today. Keeps the `tenant.modules` refresh and the `getOrganizationSettings()`/`getCurrentTenant()` refreshes.
  - Messages: `settings_modules_also_enables` (`{ modules }`: "Also switches on {modules}."), `settings_modules_also_disables` (`{ modules }`: "Also switches off {modules}, which need it."), `settings_modules_refused` (`{ modules }`: "This would leave {modules} without what they need."), `settings_modules_always_on` ("Always on").
- The settings page: switching a module on submits `enable: [id, ...requirementsOf(id) not on]`; switching one off with dependents that are on first shows an alert dialog listing them, then submits `disable: [id, ...dependentsOf(id) on]`. Always-on modules show a disabled switch with `settings_modules_always_on`.

- [ ] **Step 1: Write the failing tests**

`graph.spec.ts`:

```ts
test("finds stored modules without their requirements", () => {
	expect(moduleSetProblems(["addon", "extra"], fakeGraph)).toEqual([
		{ module: "addon", missing: ["base"] },
	]);
	expect(moduleSetProblems(["extra"], fakeGraph)).toEqual([
		{ module: "extra", missing: ["addon"] },
	]);
	expect(moduleSetProblems(["base", "addon"], fakeGraph)).toEqual([]);
});
```

E2e (`e2e/tenancy.test.ts`; contracts and invoicing have no `requires`, so these cover the plain switch and the refusals): switching a module off and on through the switch stores and removes the `organization_module` row and logs one activity entry per change; a tampered `setModules` submission (via `app.expectingErrors`) that disables an always-on or required module is refused and changes no rows. The dependency prompts get their e2e in the schedule pilot plan, when a real module has `requires`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vp test run src/lib/modules/graph.spec.ts`
Expected: FAIL, `moduleSetProblems` not exported.

- [ ] **Step 3: Implement** `moduleSetProblems`, `setModules`, the page and the messages (en + nl).

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vp test run src/lib/modules/graph.spec.ts src/lib/i18n/messages.spec.ts && pnpm vp test run --project e2e e2e/tenancy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules "src/routes/(app)/settings" messages e2e
git commit -m "Switch modules on and off together with what they need"
```

---

### Task 4: Public API folders and the data rules

**Files:**

- Modify: `src/modules/boundaries.spec.ts`, `src/lib/server/db/modules.spec.ts`, `scripts/modules/registries.ts` (+ spec), `src/lib/orders/server/order-changes.ts`, `src/modules/invoicing/routes/(app)/invoices/invoice-status.remote.ts`, `AGENTS.md` ("Modules", "Where files go")

**Interfaces:**

- Consumes: `moduleGraph` (Task 1).
- Produces:
  - Boundary rules in `boundaries.spec.ts` (each with made-up files, like the existing checks), exported as functions taking `(files, graph)`:
    - `apiImports(files, graph): string[]`: a module file importing `#modules/<other>/…` (or a relative path into another module) is allowed only for `#modules/<other>/api/…` with `<other>` in its `requires`, or `#modules/<other>/api/extensions.ts` or a type-only import with `<other>` in its `enhances`. Replaces `crossImports`.
    - `foreignWrites(files, graph): string[]`: in a module file, `.insert(X)`, `.update(X)` or `.delete(X)` where `X` is imported from `#lib/server/db/schema.ts` or from another module.
  - `module-schemas.gen.ts` (new registry, `src/lib/server/db/`): `export const moduleSchemas = { contracts: contractsSchema, … }` (namespace imports), for the foreign-key check.
  - `modules.spec.ts`: "a module's tables reference only core tables and tables of modules it requires" (using `moduleSchemas` and `moduleGraph`); the existing core → module check stays.
  - `setOrdersStatus(tx: Transaction, orders: { id: number; number: string; status: OrderStatus }[], status: OrderStatus, cause?: ActivitySubject): Promise<void>` in `src/lib/orders/server/order-changes.ts`: sets the status (and `completedAt` as `completedAt()` does) of the given orders in the tenant and logs one `updated` activity per order with `parent`/cause as invoicing's `recordOrderStatuses()` does today. Invoicing's two direct `tx.update(order)` calls and `recordOrderStatuses()` are replaced by it.

- [ ] **Step 1: Write the failing tests**

In `boundaries.spec.ts`, made-up files and graph:

```ts
const graph = { a: { requires: ["b"], enhances: ["c"], alwaysOn: false }, b: {…none}, c: {…none} };
expect(apiImports([file("src/modules/a/x.ts", `import { y } from "#modules/b/api/y.ts";`)], graph)).toEqual([]);
expect(apiImports([file("src/modules/a/x.ts", `import { y } from "#modules/b/server/y.ts";`)], graph)).toEqual([
	"src/modules/a/x.ts imports #modules/b/server/y.ts: only b's api/ is public",
]);
expect(apiImports([file("src/modules/a/x.ts", `import { p } from "#modules/c/api/extensions.ts";`)], graph)).toEqual([]);
expect(apiImports([file("src/modules/a/x.ts", `import { y } from "#modules/c/api/y.ts";`)], graph)).toEqual([
	"src/modules/a/x.ts imports #modules/c/api/y.ts: a only enhances c, so only its api/extensions.ts and types",
]);
expect(apiImports([file("src/modules/b/x.ts", `import { y } from "#modules/a/api/y.ts";`)], graph)).toEqual([
	"src/modules/b/x.ts imports #modules/a/api/y.ts: b doesn't require a",
]);
expect(foreignWrites([file("src/modules/a/x.ts", `import { order } from "#lib/server/db/schema.ts";\nawait tx.update(order).set({})`)], graph)).toEqual([
	"src/modules/a/x.ts writes order, which isn't its own table: use its owner's service",
]);
```

Plus the real-project tests (`apiImports`/`foreignWrites` over `src/modules/**` give `[]`). The invoicing e2e that issues and voids an invoice (`src/modules/invoicing/e2e/`) keeps passing unchanged: issuing sets its orders to `invoiced` with one activity entry each, voiding sets them back to `completed`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vp test run src/modules/boundaries.spec.ts src/lib/server/db/modules.spec.ts`
Expected: the made-up checks FAIL (functions missing) and `foreignWrites` over the project lists `invoice-status.remote.ts` twice.

- [ ] **Step 3: Implement** the checks, the registry, `setOrdersStatus()`, and switch invoicing to it. Update AGENTS.md: the `api/` folder, the import rules, "read tables, write through services", foreign keys along `requires`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vp test run src/modules/boundaries.spec.ts src/lib/server/db/modules.spec.ts scripts/modules && pnpm vp test run --project e2e src/modules/invoicing/e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules src/lib scripts/modules AGENTS.md
git commit -m "Let modules reach each other only through api/, and write others' data through services"
```

---

### Task 5: Hooks declared by their owners

**Files:**

- Create: `src/lib/extensions/define.ts`, `src/lib/server/extensions.ts`, `src/lib/server/extensions.spec.ts`, `src/lib/orders/extensions.ts`, `src/modules/invoicing/api/extensions.ts`
- Modify: `src/lib/server/modules/hooks.ts` (keeps only the route guards: `guardModuleRoute`, `guarded`, `guardedActions`; the hook types and functions go), `src/lib/server/modules/hooks.spec.ts`, `src/lib/orders/server/pricing.ts` (`priceOrders`), the callers of `tagOrders`/`orderCommitted` (`src/routes/(app)/orders/order.remote.ts`, `order-list.remote.ts`), `src/modules/contracts/server/index.ts`, `src/modules/contracts/module.ts` (`enhances: ["invoicing"]`), `src/modules/invoicing/server/index.ts` (its `orders.committed` handler), `src/modules/invoicing/server/billable.ts`, `scripts/modules/registries.ts` (`hooks.gen.ts` keeps its shape)

**Interfaces:**

- Produces, `src/lib/extensions/define.ts` (isomorphic, values only carry id and kind):
  - `type OnError = "fail" | "skip"`
  - `defineCollector<In, Out>(id: string, options: { onError: OnError }): CollectorPoint<In, Out>` → `{ id, kind: "collector", onError }`
  - `defineEvent<Payload>(id: string): EventPoint<Payload>` → `{ id, kind: "event" }`
  - `defineVote<In>(id: string): VotePoint<In>` → `{ id, kind: "vote" }`; a voter answers `string | undefined` (a refusal message, or nothing).
  - (`defineSlot`, `defineBulkTable` come in Task 6, same file.)
- Produces, `src/lib/server/extensions.ts`:
  - `contribute<In, Out>(point: CollectorPoint<In, Out>, answer: (input: In) => Promise<Out>): Contribution` (overloads for `EventPoint<P>` with `(payload: P) => void | Promise<void>` and `VotePoint<In>` with `(input: In) => Promise<string | undefined>`)
  - `defineServerModule(id: ModuleId, contributions: Contribution[]): ServerModule` (`ServerModule = { id: ModuleId; contributions: Contribution[] }`), replacing the hooks object.
  - `collect<In, Out>(point: CollectorPoint<In, Out>, input: In, enabled = requireTenant().modules): Promise<Out[]>`: every on module's answer, asked in parallel, returned in registry order. `onError: "skip"`: a rejection is logged (`console.error` with module id and point id) and left out; `"fail"`: it rejects.
  - `emit<P>(point: EventPoint<P>, payload: P, enabled = …): void`: each on module's handler via `afterCommit()`, in registry order.
  - `vote<In>(point: VotePoint<In>, input: In, enabled = …): Promise<string[]>`: every refusal, in registry order (empty: allowed).
- Produces, `src/lib/orders/extensions.ts`: `adjustPrices` (`defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>("orders.adjustPrices", { onError: "fail" })`), `tag` (`defineCollector<{ orders: OrderFacts[]; now: Date }, Map<number, OrderTag[]>>("orders.tag", { onError: "skip" })`), `committed` (`defineEvent<OrderChange>("orders.committed")`). `OrderFacts`, `PricedOrderFacts`, `OrderChange`, `OrderTag`, `PriceAdjustment` move here from `hooks.ts`/`manifests.ts`.
- Produces, `src/modules/invoicing/api/extensions.ts`: `billableItems` (`defineCollector<{ customerId: number; period: BillingPeriod }, BillableItem[]>("invoicing.billableItems", { onError: "fail" })`); `BillingPeriod`, `BillableItem` move here. Contracts contributes to it (`enhances: ["invoicing"]`); invoicing's `billable.ts` calls `collect(billableItems, …)` and sorts by date.
- `priceOrders()`, `tagOrders()` and `orderCommitted()` keep their names and signatures for their callers; inside they call `collect`/`emit`.

- [ ] **Step 1: Write the failing spec** (`src/lib/server/extensions.spec.ts`, with a made-up registry: mock `#lib/server/modules/hooks.gen.ts` with three fake server modules `a`, `b`, `c`, each contributing to a test collector, event and vote)

```ts
test("collect asks the modules that are on, in registry order", async () => {
	expect(await collect(point, 1, ["c", "a"])).toEqual(["a:1", "c:1"]);
});
test("a skip collector leaves out a module that throws, and logs it", async () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	expect(await collect(skipping, 1, ["a", "b"])).toEqual(["a:1"]); // b throws
	expect(String(errors.mock.calls[0])).toContain("b");
	expect(String(errors.mock.calls[0])).toContain("test.skipping");
});
test("a fail collector rejects when a module throws", async () => {
	await expect(collect(failing, 1, ["a", "b"])).rejects.toThrow();
});
test("a module that isn't on isn't asked", async () => {
	expect(await collect(point, 1, ["a"])).toEqual(["a:1"]);
});
test("vote returns every refusal", async () => {
	expect(await vote(voting, 1, ["a", "b", "c"])).toEqual(["b refuses"]);
});
test("emit runs after commit, in registry order", async () => {
	/* inside db.transaction: nothing ran until commit; then a, c */
});
```

Existing e2e that cover the real hooks: `src/modules/contracts/e2e/*.test.ts` (prices, SLA badges, billing), `src/modules/invoicing/e2e/*.test.ts`, `e2e/orders*.test.ts`.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vp test run src/lib/server/extensions.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `define.ts` (collector/event/vote), `extensions.ts`, the declarations, and move contracts' and invoicing's hooks to `contribute()`. Delete the hook types, `enabledServerModules()`, `tagOrders()`/`orderCommitted()`/`billableItems()` bodies and their doc comment from `hooks.ts` (the new home of that doc text is `src/lib/server/extensions.ts`). Update `hooks.spec.ts` to keep only the guard tests.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vp test run src/lib/server src/lib/orders src/modules && pnpm vp test run --project e2e src/modules/contracts/e2e src/modules/invoicing/e2e e2e/orders.test.ts e2e/orders.list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src scripts/modules
git commit -m "Declare hooks where their owner lives, and dispatch them from the kernel"
```

---

### Task 6: Slots and bulk actions declared by their owners, contributed by file

**Files:**

- Create: `scripts/modules/extensions.ts`, `scripts/modules/extensions.spec.ts`, `src/lib/equipment/extensions.ts`, `src/lib/dashboard/extensions.ts`
- Modify: `src/lib/extensions/define.ts` (slots, bulk tables), `src/lib/orders/extensions.ts`, `scripts/modules/generate.ts`, `scripts/modules/find.ts` (contribution files), `src/lib/modules/manifests.ts` (drop `slots`, `bulkActions`, `SlotProps`, `SlotLoader`, `BulkActionRows`, `BulkActionLoader`, `slotLoaders`, `bulkActionLoaders`), `src/lib/modules/manifests.spec.ts`, `src/lib/modules/fakes.ts`, both modules' `module.ts`
- Move (`git mv`): `src/modules/contracts/dashboard-cards.svelte` → `src/modules/contracts/slots/dashboard.cards/contracts.svelte`; `order-coverage.svelte` → `slots/orders.detail.side/coverage.svelte`; `equipment-coverage.svelte` → `slots/equipment.detail.side/coverage.svelte`; invoicing's `dashboard-cards.svelte` → `slots/dashboard.cards/invoices.svelte`, `order-invoice.svelte` → `slots/orders.detail.side/invoice.svelte`, `order-bulk-actions.ts` → `bulk-actions/orders.list.ts`

**Interfaces:**

- Produces, `src/lib/extensions/define.ts`:
  - `defineSlot<Props>(id: string): SlotPoint<Props>` → `{ id, kind: "slot" }`
  - `defineBulkTable<Row>(id: string): BulkTable<Row>` → `{ id, kind: "bulk" }`
  - `slotContribution<Props>(point: SlotPoint<Props>, module: ModuleId, name: string, load: () => Promise<{ default: Component<Props> }>): SlotContribution<Props>` → `{ id: \`${module}/${point.id}/${name}\`, module, point: point.id, load }`; the generic is what makes svelte-check reject a component whose props don't fit.
  - `bulkContribution<Row>(table: BulkTable<Row>, module: ModuleId, load: () => Promise<{ default: BulkAction<Row, AnyListWhere>[] }>): BulkContribution<Row>`.
- Core points: `src/lib/orders/extensions.ts` `detailSide = defineSlot<{ number: string }>("orders.detail.side")`, `list = defineBulkTable<OrderBulkRow>("orders.list")` (`OrderBulkRow` moves here); `src/lib/equipment/extensions.ts` `detailSide = defineSlot<{ serialNumber: string }>("equipment.detail.side")`; `src/lib/dashboard/extensions.ts` `cards = defineSlot<Record<string, never>>("dashboard.cards")`.
- Produces, `scripts/modules/extensions.ts`:
  - `findPoints(root: string): { id: string; kind: "slot" | "bulk" | "collector" | "event" | "vote"; owner: string; file: string; exportName: string }[]`: scans `src/lib/*/extensions.ts` (owner = the folder name) and `src/modules/*/api/extensions.ts` (owner = module id) for `export const <name> = define<Kind><…>("<id>"`.
  - `extensionProblems(points, modules: ModuleFolder[]): string[]`: a point whose id doesn't start with `<owner>.`; two points with one id; a contribution file (`ModuleFolder.slotFiles`: `slots/<point>/<name>.svelte`, `bulkFiles`: `bulk-actions/<point>.ts`) for an unknown point, a point of another kind, or an owner that is neither core nor in the module's `requires`/`enhances`.
  - `renderContributions(points, modules): string` → `src/lib/extensions/contributions.gen.ts` exporting `slotContributions` and `bulkContributions`, each entry a `slotContribution(point, "<module>", "<name>", () => import("#modules/<module>/slots/<point>/<name>.svelte"))` call, in registry order.
- `ModuleFolder` gains `slotFiles: string[]`, `bulkFiles: string[]` (relative to the module folder).

- [ ] **Step 1: Write the failing spec** (`scripts/modules/extensions.spec.ts`, with made-up points and modules)

```ts
test("a point's id starts with its owner", () => {
	expect(
		extensionProblems(
			[point("orders.detail.side", "slot", "orders"), point("x.y", "slot", "orders")],
			[],
		),
	).toEqual([
		"src/lib/orders/extensions.ts declares x.y: an extension point's id starts with its owner, orders.",
	]);
});
test("a contribution names an existing point of its kind, whose owner it requires or enhances", () => {
	const modules = [
		module("a", {
			slotFiles: ["slots/b.side/x.svelte", "slots/nope/x.svelte"],
			bulkFiles: ["bulk-actions/orders.detail.side.ts"],
		}),
		module("b"),
	];
	expect(
		extensionProblems(
			[point("b.side", "slot", "b"), point("orders.detail.side", "slot", "orders")],
			modules,
		),
	).toEqual([
		"src/modules/a/slots/b.side/x.svelte: a neither requires nor enhances b.",
		"src/modules/a/slots/nope/x.svelte: there is no extension point nope.",
		"src/modules/a/bulk-actions/orders.detail.side.ts: orders.detail.side is a slot, not a bulk table.",
	]);
});
test("renders typed contributions in registry order", () => {
	expect(renderContributions(points, modules)).toContain(
		`slotContribution(ordersDetailSide, "contracts", "coverage", () => import("#modules/contracts/slots/orders.detail.side/coverage.svelte"))`,
	);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vp test run scripts/modules/extensions.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** the scanner, checks and registry; wire them into `generateModules`; move the module files and drop `slots`/`bulkActions` from both manifests.

- [ ] **Step 4: Verify the type check catches a wrong component**

Temporarily give `src/modules/contracts/slots/orders.detail.side/coverage.svelte` a required prop `{ serial: string }`, run `pnpm generate && pnpm exec svelte-check --tsgo --tsconfig ./tsconfig.json --threshold error`, expect an error on its `contributions.gen.ts` line, then undo. (This is the one place this plan runs svelte-check: a quick project check, done once.)

- [ ] **Step 5: Run the specs**

Run: `pnpm vp test run scripts/modules src/lib/modules`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/modules src/lib src/modules
git commit -m "Declare slots and bulk tables where their owner lives, and contribute to them by file"
```

---

### Task 7: Render contributions with `<ExtensionSlot>`

**Files:**

- Create: `src/routes/(app)/extension-slot.svelte`, `src/routes/(app)/extension-slot.svelte.spec.ts` (from the slot isolation work's `module-slots.svelte.spec.ts`), `src/routes/(app)/extension-bulk-actions.svelte.ts`
- Delete: `src/routes/(app)/module-slots.svelte` (+ its spec), `src/routes/(app)/module-bulk-actions.svelte.ts`
- Modify: `src/routes/(app)/(dashboard)/+page.svelte`, `src/routes/(app)/orders/[number]/+page.svelte`, `src/routes/(app)/equipment/[serial]/+page.svelte`, `src/routes/(app)/orders/orders-table.svelte`, `AGENTS.md`

**Interfaces:**

- Consumes: `slotContributions`, `bulkContributions` (Task 6), `getCurrentTenant` (`./session.remote.ts`).
- Produces:
  - `extension-slot.svelte`, generic over `Props`: props `{ point: SlotPoint<Props>; props: Props; class?: string }`; renders `slotContributions` with `point === point.id` and `module` in the tenant's modules, keyed by contribution id, each in its own `<svelte:boundary>` with the `failed` snippet, `onerror` and SSR handling of the slot isolation work (its report says how the server side behaves; keep that). `onerror` logs the contribution id.
  - `extensionBulkActions<Row>(table: BulkTable<Row>): { readonly current: BulkAction<Row, AnyListWhere>[] }`, same behaviour as `moduleBulkActions()`.
  - Pages use `<ExtensionSlot point={cards} props={{}} … />`, `<ExtensionSlot point={detailSide} props={{ number: order.number }} />`, etc.

- [ ] **Step 1: Port the component spec** to `<ExtensionSlot>` with made-up points and contributions (mock `#lib/extensions/contributions.gen.ts`): one contribution renders, one whose component throws shows the `failed` snippet, one whose loader rejects shows it too, one of a module that isn't on renders nothing, one for another point renders nothing.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vp test run "src/routes/(app)/extension-slot.svelte.spec.ts"`
Expected: FAIL, component not found.

- [ ] **Step 3: Implement** the component and `extensionBulkActions`, switch the four call sites, delete the old files, update AGENTS.md ("Modules": extension points, `api/`, contributing by file, hooks with `contribute()`; "Not there yet" list).

- [ ] **Step 4: Run to see it pass, and the pages' e2e**

Run: `pnpm vp test run "src/routes/(app)/extension-slot.svelte.spec.ts" && pnpm vp test run --project e2e e2e/dashboard.test.ts e2e/orders.test.ts src/modules/contracts/e2e src/modules/invoicing/e2e`
Expected: PASS (the modules' e2e cover their cards, the empty slots for South and the bulk action).

- [ ] **Step 5: Commit**

```bash
git add src AGENTS.md
git commit -m "Render extension points' contributions with ExtensionSlot"
```

---

## After this plan

Separate plans, written once this one is merged: **roles** (spec section 4), the **schedule pilot** (including `nav: { after }` from section 1 and the e2e for the dependency prompts in settings), the **portal pilot** (section 5), and the **inspector** (section 6). Slot options in `<script module>` (order, roles) come with the roles plan, when there's a first use for them.
