# Module dependencies, part 3: the schedule pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The planning board becomes the optional module `src/modules/schedule/`: tenants can switch it off, existing tenants keep it, and it changes orders only through a core service. Along the way, modules get a place in the sidebar (`nav: { after }`), and the settings page's switching gets the fixes carried over from step 1.

**Architecture:** The order's planned time, engineer and `scheduled` status stay on the order (orders own that data; the schedule is a view of it). The logic of `plan()` in today's `schedule.remote.ts` becomes the core service `scheduleOrder(tx, plan)` in `#lib/orders/server/scheduling.ts`; the module's `scheduleOrder` form and `moveOrder` command are thin wrappers made with `moduleRemote("schedule")`. The module owns the `/schedule` route (generated into `src/routes/(app)/(modules)/schedule/`), the board components, its messages and its e2e; it has no tables, no `server/` and no seed of its own. A data migration gives every existing organization an `organization_module` row for it. The sidebar places a module's entry with a pure `placeNav()` (`#lib/modules/nav.ts`) after the core entry or module its manifest names.

**Tech Stack:** SvelteKit 3 (remote functions), Svelte 5, TypeScript, drizzle (SQLite), valibot, Vitest (+ vitest-browser-svelte, Playwright e2e), pnpm, Vite+ (`vp`).

**Spec:** [`docs/plans/module-dependencies.md`](module-dependencies.md), section 5 (the schedule part), section 1 (`nav: { after }`, switching), section 2 (read tables, write through services) and the matching parts of section 6. Builds on [step 1](module-dependencies-1-machinery.md) (done). Step 2 (roles) isn't needed: the schedule has no roles.

## Decisions

These settle the open questions of the brief; each says why.

1. **`requires` stays empty.** The schedule needs orders and engineers, which are core, and core is an implicit requirement of every module. Inventing a dependency (say, on invoicing) would make the graph lie. So after this pilot no real module has `requires` or `alwaysOn`, and the step 1 items that need one are covered like this:
   - the settings page's dependency prompts (switching on names what it also switches on; switching off asks first and lists the dependents) and a refusal inside the switch-off dialog: a component spec of `module-card.svelte` with the made-up graph (`fakeGraph`) mocked in as `moduleGraph` (Task 6);
   - the refusals for unmet requirements and for always-on modules: unit specs of `changeModules()` (Task 6), and an e2e of the one refusal a real tenant can reach, an empty (tampered) submission (Task 6);
   - **still carried**: the e2e of the dependency prompts and of a tampered unmet-requirement or always-on refusal, to the first plan that adds a real `requires` or `alwaysOn` module (most likely the first extracted core domain, which is `alwaysOn`). The portal pilot won't have one either: it too needs only core.
2. **The carried settings and generator items all belong here** (the schedule is the first module tenants have had all along, so switching is about to matter), except the e2e above:
   - **A stale `organization_module` row** (a module stored without what it requires, e.g. after a hand edit) **doesn't block unrelated switches.** `changeModules()` judges by what's on (`effectiveModules()`), not by the rows: it refuses a module of the resulting set that wouldn't be on afterwards, when it was on before or is being switched on. A stale module is off already, so it blocks nothing, not even switching off another module it requires (whose card doesn't list it). (Revised after the branch review: the first rule, comparing each module's missing requirements, still let a stale row block the switch-off of its other requirement.) The stale row stays (the module is off, `effectiveModules()` sees to that) until the module is switched on with its requirements, which fixes it, or off. Not chosen: dropping stale rows on any change, which would log a `module_disabled` for a module that was already off, under an unrelated change.
   - **Refusal messages**: an empty submission gets its own message (today `common_error_generic`); switching off an always-on module gets one that says so (today it reads "would leave X without what they need", which is wrong for it); a refusal from the switch-off dialog shows inside the dialog (today it shows on the card, behind the dialog). `changeModules()` returns why it refuses (`alwaysOn` and `unmet` lists) so the server can pick the message.
   - **Switching an always-on module on stores nothing**: an `enable` naming one is a no-op in `changeModules()` (the spec says no row is stored for them; today a tampered form would store one). A row already stored for one stays: dropping it under an unrelated change would log a `module_disabled` for a module that stays on.
   - **The generator refuses an `alwaysOn` module that requires a switchable one** (it could be switched off from under the always-on module).
   - **`org:create --modules` checks requirements through `changeModules()`**: a module listed without what it requires is a usage error naming the missing ones; an always-on module listed is left out of what's stored.
3. **What core keeps knowing about the schedule:**
   - **Stays core (orders own it):** `order.scheduledFor`, `order.engineerId`, the `scheduled` status (`orderStatuses`, `statuses` in `#lib/orders/display.ts`, `enum.json`), the `scheduled` activity verb (`activityActions` in `src/lib/models.ts`, `actionVerbs` in `activity.json`), the order form's "Scheduled for" fields, the order page's "Schedule" card (`orders_schedule`, the planned date), the orders list's "Scheduled" column, the dashboard's and the engineer page's planned dates, the portal's day list, and `assigneeProblem()` (bulk assigning uses it too).
   - **Moves to core orders:** `plannedStatus()` (a domain rule: a quote that gets an engineer is scheduled) from the board's `board.ts` to `#lib/orders/display.ts`, since the service and the board's optimistic move both use it; the four messages the service and `assigneeProblem()` use (`schedule_not_found` → the existing `orders_not_found_plain`, `schedule_unknown_engineer` → the existing `orders_unknown_engineer`, `schedule_only_open` → `orders_only_open_scheduled`, `schedule_engineer_inactive` → `orders_engineer_inactive`, texts unchanged).
   - **Moves to the module:** the route and board files, every other `schedule_*` message (the whole `messages/<locale>/schedule.json`, plus `schedule_module_name` and `schedule_module_description`), and the sidebar entry, which comes from the manifest (`common_nav_schedule` goes; the label is `schedule_module_name`, "Schedule" / "Planning").
   - **Nothing becomes a slot:** no core page links to `/schedule` today (only the sidebar does, checked with `grep -rn '/schedule\|(app)/schedule' src e2e`).
4. **The order form doesn't call `scheduleOrder()`.** The spec says it should use the same service, but the form sets the status explicitly (the service would turn a quote with an engineer into `scheduled` behind the user's back), may change the date of a completed order (the service refuses orders that aren't open), and logs one `updated`/`created` entry for the whole save (the service logs `scheduled`). Making the form call it would change what the form does. The form keeps saving its fields in `saveOrder()`; what the two share is the order's own rules, which already live in orders (`moveOrderStock`, `completedAt`, the activity log). This deviates from the spec; the user accepted it (October 2026).
5. **Names.** The service keeps the spec's name, `scheduleOrder(tx, plan)`; the module's form keeps its name `scheduleOrder` too (the dialog uses `scheduleOrder.for(id)`), so the module's remote file imports the service as `scheduleOrder as planOrder`.
6. **`nav.after` names a core sidebar entry or a module.** Core entries get ids (`dashboard`, `orders`, `activity`, `customers`, `equipment`, `engineers`, `materials`, in `coreNavIds`), and the manifest's type is `nav?: { after: CoreNavId | ModuleId }`, so a typo is a type error. The generator reads it as a literal like `requires` (a problem if it isn't one, or names the module itself) and writes it into `ids.gen.ts`, so `manifests.spec.ts` can compare it with the runtime value and the inspector (step 5) can show it. At runtime a module goes after its entry (several after one entry keep registry order); a module whose entry isn't shown (a module that's off) goes in the Modules group, as does one without `nav`.
7. **New organizations get the schedule only when asked**: `org:create --modules schedule,…` (the README's example lists it); nothing is on by default for a new organization (decided by the user). The seed already gives North every module and South only invoicing, so South is the tenant without the schedule.

## Global Constraints

- Follow `AGENTS.md`: imports name a file by its real extension; code outside a domain imports it through its barrels (`#lib/orders/index.ts`, `#lib/orders/server/index.ts`, …); every user-facing text is a message in `en` and `nl` together (Dutch informal, sentence case); no messages at module scope.
- Every select, update and delete on a tenant table includes `inTenant()` (or `idInTenant`/`idsInTenant`/`tenantJoin`); every mutation logs with `recordActivity(tx, …)` inside its transaction.
- The module writes no core table itself (`foreignWrites` in `src/modules/boundaries.spec.ts`): the order changes go through `scheduleOrder()`. Its remote functions come from its own set, `src/modules/schedule/remote-functions.ts` (`remote-functions.spec.ts` checks).
- Core never imports the module; the module's route files hold `+` files only and import the rest as `#modules/schedule/…` (`src/lib/domain-boundaries.spec.ts`, once `schedule` is in `migratedModules`).
- Behaviour of the board doesn't change for a tenant that has the module: same URL (`/schedule`), same texts, same activity entries, same refusals.
- Each task ends with a commit (message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Run single test files while working (`pnpm vp test run <file>`, e2e: `pnpm vp test run --project e2e <file>`; only one e2e run at a time); the coordinator runs `pnpm run check`, `pnpm knip` and `pnpm test` before merging.

## Review Focus

1. **A tenant without the module** (South): `/schedule` is the app's 404 inside the app layout, the sidebar has no Schedule entry, and `getSchedule`, `scheduleOrder` and `moveOrder` are refused with a 404, also from a board left open in North after switching organization in another tab; the order stays as it was. Pinned in Task 5.
2. **Existing tenants keep the schedule**: the migration gives every organization a row, without touching other rows. Pinned in Task 3 (`migrations.spec.ts`).
3. **The service keeps the rules it had in the route**: an order that isn't open is refused with the dialog's message; another tenant's or an inactive engineer is refused at the engineer field; a scheduled quote short of stock rolls back the whole plan (no date, no engineer, no activity); one `scheduled` entry per plan, as before. Pinned in Task 1 (the unchanged board e2e) and Task 4 (the same e2e from the module).
4. **A stale row doesn't block other switches, and a real problem is still refused**: `changeModules()` with a stale row lets an unrelated module through and leaves the stale one stored and off; a switch-off that strands a dependent is still refused. Pinned in Task 6.
5. **A module placed after an entry that isn't shown** (its target module is off): it falls back to the Modules group instead of disappearing. Pinned in Task 2 (`nav.spec.ts`).

---

## File structure

| File                                                                                                                                                                | Responsibility                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/orders/server/scheduling.ts` (new)                                                                                                                         | `scheduleOrder(tx, plan)`: plans an open order, keeping the stock, status and activity rules         |
| `src/lib/orders/display.ts`                                                                                                                                         | Gains `plannedStatus()` from the board                                                               |
| `src/lib/modules/nav.ts` (new)                                                                                                                                      | `coreNavIds`, `CoreNavId`, `placeNav()`: where the tenant's modules go in the sidebar                |
| `scripts/modules/manifest.ts`, `graph.ts`, `registries.ts`, `shared.ts`                                                                                             | Read `nav.after`; refuse an always-on module requiring a switchable one; `navAfter` in `ids.gen.ts`  |
| `src/lib/modules/graph.ts`                                                                                                                                          | `changeModules()` refuses only the problems a change makes, says why, never stores always-on modules |
| `drizzle/0003_enable-schedule.sql` (new, custom)                                                                                                                    | Switches the schedule on for every existing organization                                             |
| `src/modules/schedule/` (new): `module.ts`, `remote-functions.ts`, `schedule.remote.ts`, the board files, `routes/(app)/schedule/+page.svelte`, `messages/`, `e2e/` | The module                                                                                           |
| `src/routes/(app)/app-sidebar.svelte`                                                                                                                               | Core entries with ids; modules placed with `placeNav()`; no Schedule entry of its own                |
| `src/routes/(app)/settings/settings.remote.ts`, `module-card.svelte` (+ new spec)                                                                                   | The refusal messages; the dialog shows its refusal                                                   |
| `src/lib/server/db/create-organization-args.ts`                                                                                                                     | `--modules` checked with `changeModules()`                                                           |

---

### Task 1: The scheduling service in core orders

**Files:**

- Create: `src/lib/orders/server/scheduling.ts`
- Modify: `src/lib/orders/server/index.ts` (export it), `src/lib/orders/display.ts` (+ `display.spec.ts`: `plannedStatus`), `src/lib/orders/server/order-changes.ts` (`assigneeProblem` messages and doc), `messages/{en,nl}/orders.json`, `messages/{en,nl}/schedule.json` (drop the four keys that move), `src/routes/(app)/schedule/schedule.remote.ts` (`plan()` goes), `src/routes/(app)/schedule/board.ts` and `board.spec.ts` (`plannedStatus` goes)
- Test: `src/lib/orders/display.spec.ts`, `e2e/schedule.test.ts` and `e2e/orders.bulk.test.ts` unchanged

**Interfaces:**

- Produces, `src/lib/orders/display.ts` (exported from `#lib/orders/index.ts` through `export * from "./display.ts"`):
  - `plannedStatus(status: OrderStatus, engineerId: number | null): OrderStatus`, moved unchanged from `board.ts`.
- Produces, `src/lib/orders/server/scheduling.ts` (exported from `#lib/orders/server/index.ts`):
  - `interface OrderPlan { id: number; engineerId: number | null; day: Date; time: string }`
  - `scheduleOrder(tx: Transaction, plan: OrderPlan): Promise<Problem<"engineerId"> | undefined>`: the body of today's `planInTransaction()`, in the caller's transaction: finds the order with `idInTenant` (a 404 with `m.orders_not_found_plain()` if there's none), returns `{ message: m.orders_only_open_scheduled() }` for an order that isn't open, `{ field: "engineerId", message }` from `assigneeProblem(engineerId, tx)`, else sets `engineerId`, `scheduledFor: atTime(day, time)` and `status: plannedStatus(…)`, moves the order's stock with `moveOrderStock()` and logs `scheduled` with `before`/`after` as today. Throws `OrderStockShortage` when stock runs short, so the caller's transaction stores nothing; the caller turns it into a problem. The doc comment says why the order form doesn't use it (Decision 4). It doesn't emit `orders.committed`, as the board doesn't today.
- Messages (`orders.json`, en/nl): `orders_only_open_scheduled` ("Only open orders can be scheduled" / "Je kunt alleen open opdrachten inplannen"), `orders_engineer_inactive` (`{name}`: "{name} is no longer active" / "{name} is niet meer actief"). `assigneeProblem()` uses `m.orders_unknown_engineer()` and `m.orders_engineer_inactive()`.
- Consumes in the route (until Task 4 moves it): `schedule.remote.ts` keeps a local wrapper:

```ts
async function plan(input: OrderPlan): Promise<Problem<"engineerId"> | undefined> {
	try {
		return await db.transaction((tx) => planOrder(tx, input));
	} catch (error) {
		// Thrown, so the transaction stores nothing of it.
		if (error instanceof OrderStockShortage) return { message: error.message };
		throw error;
	}
}
```

- [ ] **Step 1: Write the failing test**

Move the `plannedStatus` test from `src/routes/(app)/schedule/board.spec.ts` to `src/lib/orders/display.spec.ts`, importing it from `./display.ts`.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vp test run src/lib/orders/display.spec.ts`
Expected: FAIL, `plannedStatus` is not exported.

- [ ] **Step 3: Implement** `plannedStatus` in `display.ts`, `scheduling.ts`, the barrel export, the messages (en + nl), and switch `schedule.remote.ts` and `board.ts` (which imports `plannedStatus` from `#lib/orders/index.ts`) to them. Drop the four moved keys from `schedule.json` (en + nl).

- [ ] **Step 4: Run to see it pass, and the board's e2e unchanged**

Run: `pnpm vp test run src/lib/orders "src/routes/(app)/schedule" src/lib/i18n/messages.spec.ts src/lib/domain-boundaries.spec.ts && pnpm vp test run --project e2e e2e/schedule.test.ts e2e/orders.bulk.test.ts`
Expected: PASS (the e2e cover the dialog, the drag, the not-open refusal, the inactive and North's engineers, and bulk assigning's refusals).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders "src/routes/(app)/schedule" messages
git commit -m "Plan orders through a scheduling service in core orders"
```

---

### Task 2: A module's place in the sidebar (`nav: { after }`)

**Files:**

- Create: `src/lib/modules/nav.ts`, `src/lib/modules/nav.spec.ts`
- Modify: `scripts/modules/manifest.ts` (+ spec), `scripts/modules/shared.ts` (`ModuleFolder.navAfter`), `scripts/modules/find.ts`, `scripts/modules/graph.ts` (+ spec), `scripts/modules/registries.ts` (+ spec), `scripts/modules/test-helpers.ts`, `src/lib/modules/manifests.ts` (`ModuleParts.nav`), `src/lib/modules/ids.ts` (`ModuleNode.navAfter`), `src/lib/modules/manifests.spec.ts`, `src/routes/(app)/app-sidebar.svelte`

**Interfaces:**

- Produces, `src/lib/modules/nav.ts` (isomorphic, no messages at module scope):
  - `coreNavIds = ["dashboard", "orders", "activity", "customers", "equipment", "engineers", "materials"] as const`, `type CoreNavId`.
  - `interface NavItem { id: string; title: string; href: string; icon: Component }`, `interface NavGroup { label: string; items: NavItem[] }`.
  - `placeNav(groups: NavGroup[], modules: (NavItem & { after?: string })[], modulesLabel: string): NavGroup[]`: `modules` are the tenant's, in registry order. Each module with `after` goes right after that entry, behind modules already placed after it; a module may go after another module, whichever comes first in registry order (repeat until nothing more can be placed); what's left (no `after`, or its entry isn't shown) goes in a last group labelled `modulesLabel`. Empty groups are left out.
- `ModuleParts` gains `nav?: { after: CoreNavId | ModuleId }` (doc: literal, read by the generator).
- Generator: `readManifestGraph()` gains `navAfter: string | undefined`, read with `/\bnav:\s*\{\s*after:\s*(["'`])([^"'`]*)\1\s*,?\s*\}/`; a `nav:` key in any other form is the problem `"nav must be { after: \"<id>\" } with a string literal"`. `ModuleFolder` gains `navAfter?: string`. `graphProblems()` adds `src/modules/<id> nav.after itself.` `ids.gen.ts` entries gain `navAfter: "<id>" | null`; `ModuleNode` gains `navAfter: string | null` (`ModuleGraph` in `graph.ts` and `fakeGraph` don't need it).
- Sidebar: the core items get `id: CoreNavId`; `groups` becomes `placeNav(coreGroups, modules.filter(on).map((module) => ({ id: module.id, title: module.label, href: resolve(module.route), icon: module.icon, after: module.nav?.after })), m.common_nav_modules())`. The core Schedule item stays until Task 4.

- [ ] **Step 1: Write the failing specs**

`src/lib/modules/nav.spec.ts` (made-up items; `ids()` maps the result to each group's item ids):

```ts
const core = [
	{ label: "Operations", items: [item("dashboard"), item("orders"), item("activity")] },
	{ label: "Records", items: [item("customers")] },
];
test("a module goes after the entry it names, the others in the modules group", () => {
	expect(ids(placeNav(core, [mod("schedule", "orders"), mod("contracts")], "Modules"))).toEqual([
		["dashboard", "orders", "schedule", "activity"],
		["customers"],
		["contracts"],
	]);
});
test("modules after the same entry keep registry order", () => {
	expect(ids(placeNav(core, [mod("a", "orders"), mod("b", "orders")], "Modules"))[0]).toEqual([
		"dashboard",
		"orders",
		"a",
		"b",
		"activity",
	]);
});
test("a module may go after a module that comes later in registry order", () => {
	expect(ids(placeNav(core, [mod("b", "a"), mod("a", "orders")], "Modules"))[0]).toEqual([
		"dashboard",
		"orders",
		"a",
		"b",
		"activity",
	]);
});
test("a module whose entry isn't shown goes in the modules group", () => {
	expect(ids(placeNav(core, [mod("b", "a")], "Modules")).at(-1)).toEqual(["b"]);
});
test("without modules there's no modules group", () => {
	expect(placeNav(core, [], "Modules").map((group) => group.label)).toEqual([
		"Operations",
		"Records",
	]);
});
```

`scripts/modules/manifest.spec.ts`: `nav: { after: "orders" }` reads as `navAfter: "orders"`; no `nav` gives `undefined`; `nav: placement` gives the problem. `scripts/modules/graph.spec.ts`: `module("a", { navAfter: "a" })` gives `src/modules/a nav.after itself.` `registries.spec.ts`: the graph entry has `navAfter: "orders"` (and `null` without). `src/lib/modules/manifests.spec.ts`: the real-registry comparison also checks `moduleGraph[id].navAfter === (manifest.nav?.after ?? null)`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vp test run src/lib/modules/nav.spec.ts scripts/modules/manifest.spec.ts scripts/modules/graph.spec.ts`
Expected: FAIL, `placeNav` missing, `navAfter` not read.

- [ ] **Step 3: Implement** `nav.ts`, the generator changes, the types and the sidebar.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm generate && pnpm vp test run src/lib/modules scripts/modules && pnpm vp test run --project e2e e2e/tenancy.test.ts e2e/i18n.test.ts`
Expected: PASS (the sidebar looks as before: no module has `nav` yet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules scripts/modules "src/routes/(app)/app-sidebar.svelte"
git commit -m "Let a module's manifest place its sidebar entry after another"
```

---

### Task 3: Switch the schedule on for every existing organization

**Files:**

- Create: `drizzle/0003_enable-schedule.sql` (with `pnpm db:generate --custom --name enable-schedule`, which also writes the journal entry and a snapshot equal to the last)
- Modify: `src/lib/server/db/migrations.spec.ts`, `src/lib/server/db/seed/index.ts` (the comment on the demo organizations: North has every module, South only invoicing, so not the schedule)

**Interfaces:**

- The migration:

```sql
-- The schedule became an optional module (src/modules/schedule): every organization that had it
-- as part of the core keeps it.
INSERT OR IGNORE INTO `organization_module` (`organization_id`, `module_id`)
SELECT `id`, 'schedule' FROM `organization`;
```

It runs before the module exists (Task 4); until then a `schedule` row is an unknown id, which `effectiveModules()` drops and the settings page doesn't list, so this task is safe on its own.

- [ ] **Step 1: Write the failing test** in `migrations.spec.ts`:

```ts
test("the schedule migration switches the schedule on for every organization there is", async () => {
	// The migrations before it, in a copy of the folder whose journal stops there.
	const before = join(folder, "before");
	cpSync(migrationsFolder, before, { recursive: true });
	const index = journal.entries.findIndex((entry) => entry.tag === "0003_enable-schedule");
	writeFileSync(
		join(before, "meta/_journal.json"),
		JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
	);
	const client = createClient({ url: `file:${join(folder, "schedule.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 0), ('b', 'B', 'b', 0);
		insert into organization_module (organization_id, module_id) values ('b', 'contracts');
	`);
	await migrate(drizzle(client), { migrationsFolder });
	const { rows } = await client.execute(
		"select organization_id, module_id from organization_module order by 1, 2",
	);
	expect(rows.map((row) => [row.organization_id, row.module_id])).toEqual([
		["a", "schedule"],
		["b", "contracts"],
		["b", "schedule"],
	]);
	client.close();
});
```

(`journal` keeps the whole parsed file for this; check the `organization` table's required columns in `auth.schema.ts`.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vp test run src/lib/server/db/migrations.spec.ts`
Expected: FAIL, no `0003_enable-schedule` entry (`index` is -1).

- [ ] **Step 3: Implement**: generate the custom migration, write the SQL, fix the seed comment. Apply it locally with `pnpm db:migrate`.

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vp test run src/lib/server/db/migrations.spec.ts`
Expected: PASS, and "every change to the schema is in a migration" still passes.

- [ ] **Step 5: Commit**

```bash
git add drizzle src/lib/server/db
git commit -m "Switch the schedule on for every organization, ahead of it becoming a module"
```

---

### Task 4: Move the schedule into `src/modules/schedule/`

**Files:**

- Move (`git mv`): `src/routes/(app)/schedule/+page.svelte` → `src/modules/schedule/routes/(app)/schedule/+page.svelte`; the other twelve files of `src/routes/(app)/schedule/` (`backlog-card.svelte`, `board-drag.svelte.ts`, `board.ts`, `board.spec.ts`, `day-list.svelte`, `order-card.svelte`, `schedule-board.svelte`, `schedule-dialog.svelte`, `schedule-schema.ts`, `schedule-schema.spec.ts`, `schedule.remote.ts`, `week-grid.svelte`) → `src/modules/schedule/`; `messages/{en,nl}/schedule.json` → `src/modules/schedule/messages/{en,nl}/schedule.json`; `e2e/schedule.test.ts` → `src/modules/schedule/e2e/schedule.test.ts`
- Create: `src/modules/schedule/module.ts`, `src/modules/schedule/remote-functions.ts`, `src/modules/schedule/e2e/helpers.ts`, `src/modules/schedule/e2e/schedule.tenancy.test.ts`
- Modify: `project.inlang/settings.json` (core list drops `./messages/{locale}/schedule.json`; the generator adds the module's), `messages/{en,nl}/common.json` (drop `common_nav_schedule`), `src/routes/(app)/app-sidebar.svelte` (drop the Schedule item and `CalendarDaysIcon`), `src/lib/domain-boundaries.spec.ts` (`migratedModules` gains `"schedule"`), `AGENTS.md`

**Interfaces:**

- `module.ts`:

```ts
import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";

import { defineModule } from "#lib/modules/define.ts";

export default defineModule({
	id: "schedule",
	label: m.schedule_module_name,
	description: m.schedule_module_description,
	route: "/(app)/(modules)/schedule",
	icon: CalendarDaysIcon,
	nav: { after: "orders" },
});
```

- `remote-functions.ts`: `export const { query, form, command } = moduleRemote("schedule");` with a doc comment like invoicing's.
- `schedule.remote.ts`: `getSchedule = query(…)`, `scheduleOrder = form(…)`, `moveOrder = command(…)` from `./remote-functions.ts` (no more `forMembers`); `plan()` as in Task 1 with `scheduleOrder as planOrder` from `#lib/orders/server/index.ts`. Still reads `order`, `customer` and `engineer` for the board (reading core tables is allowed); writes nothing itself.
- The page imports `#modules/schedule/board.ts`, `#modules/schedule/schedule-board.svelte`, `#modules/schedule/schedule.remote.ts`, declares `const _props: { params: RouteParams<"/(app)/(modules)/schedule"> } = $props();` like contracts' pages, and every `resolve("/(app)/schedule")` (the page, `schedule-board.svelte`) becomes `resolve("/(app)/(modules)/schedule")`.
- Messages, `src/modules/schedule/messages/{en,nl}/schedule.json`: what's left of `schedule.json` after Task 1, plus `schedule_module_name` ("Schedule" / "Planning") and `schedule_module_description` ("Plan who does which order, and when, on a weekly board." / "Plan per week wie welke opdracht doet, en wanneer.").
- E2e: `schedule.test.ts` keeps the "in North" describe, importing from `#e2e/app.ts` and `./helpers.ts`; `helpers.ts` gets what both files use (`weekday`, `dayKey`, `longDay`, `seconds`, `orderByNumber`, `snapshot`, the board locators, `drag`, `openDialog`). `schedule.tenancy.test.ts` gets the "in South" describe, which now starts by switching the schedule on for South on the settings page (as the owner, like `e2e/tenancy.test.ts` does for contracts) and ends by switching it off again, so the file leaves South as seeded for the files after it on the worker. Task 5 adds the rest of its coverage.
- `AGENTS.md`: "Where files go" drops the schedule from the route folders outside the domains; "Translations" drops `schedule` from the core sections and names the schedule module's section; "Modules" names the schedule as the third module and the example of one without tables that changes core records through a core service (`scheduleOrder()`), and documents `nav: { after }` with the other manifest fields.

- [ ] **Step 1: Move the e2e first, and see it fail**

`git mv e2e/schedule.test.ts src/modules/schedule/e2e/schedule.test.ts`, split off `schedule.tenancy.test.ts` and `helpers.ts` as above, with South's describe switching the schedule on in settings first.
Run: `pnpm vp test run --project e2e src/modules/schedule/e2e/schedule.tenancy.test.ts`
Expected: FAIL: the settings page has no Schedule card (and South still sees the core board).

- [ ] **Step 2: Move the code** with `git mv` as listed, create `module.ts` and `remote-functions.ts`, fix the imports and route ids, the remote set, the messages, `project.inlang/settings.json`, `common.json`, the sidebar and `migratedModules`.

- [ ] **Step 3: Generate and run the specs**

Run: `pnpm generate && pnpm vp test run src/modules src/lib/modules src/lib/domain-boundaries.spec.ts src/lib/server/remote-functions.spec.ts src/lib/i18n/messages.spec.ts src/import-extensions.spec.ts scripts/modules`
Expected: PASS: the generator writes `src/routes/(app)/(modules)/schedule/+page.svelte`, the schedule is in the registries, `foreignWrites` and `apiImports` find nothing.

- [ ] **Step 4: Run the board's e2e from the module**

Run: `pnpm vp test run --project e2e src/modules/schedule/e2e e2e/i18n.test.ts e2e/portal.test.ts e2e/tenancy.test.ts`
Expected: PASS (North's board as before; Dutch "Planning" still in the sidebar, now after "Opdrachten"; a field engineer is still sent from `/schedule` to `/my`).

- [ ] **Step 5: Type-check the moved page once**

Run: `pnpm exec svelte-check --tsgo --tsconfig ./tsconfig.json --threshold error` (the stub is typed with the route's `PageProps`; this is the one project-wide check in this plan, done once).
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A src/modules/schedule "src/routes/(app)" messages project.inlang src/lib AGENTS.md e2e
git commit -m "Make the schedule an optional module"
```

---

### Task 5: The module's e2e: a tenant without it, switching it on, isolation

**Files:**

- Modify: `src/modules/schedule/e2e/schedule.test.ts`, `src/modules/schedule/e2e/schedule.tenancy.test.ts`, `src/modules/schedule/e2e/helpers.ts`

**Interfaces:**

- Consumes: `useApp()`, `rows()`, `value()`, `app.anotherTab()`, `app.expectingErrors()`, `app.submit()`, `app.switchOrganization()` from `#e2e/app.ts`; the activity check of `e2e/tenancy.test.ts` (`moduleEntries`) as a pattern.

- [ ] **Step 1: Write the tests**

`schedule.test.ts`, in North: "the sidebar has Schedule right after Orders" (the Operations group's links read Dashboard, Orders, Schedule, Activity) and North has its `organization_module` row.

`schedule.tenancy.test.ts`, in this order (each a test, sharing the page, as the contracts' tenancy file does):

1. "a board left open in North is refused after switching to South elsewhere": open `/schedule` in North by a client-side navigation from the sidebar (so `getSchedule` goes through a remote query, whose URL is kept), open the dialog for a backlog order and fill it; switch to South in another tab; submit: a 404, and the order's row is as before (`snapshot`). (The page is in South from here on, as in the contracts' tenancy file.)
2. "a drag on a board left open is refused too": same set-up (a fresh board in North, switch elsewhere), drag a card to another day: the toast says "Couldn't move …", the card goes back, the order's row is unchanged.
3. "South's sidebar has no Schedule, and /schedule is a 404": Operations reads Dashboard, Orders, Activity; `/schedule` and `/schedule?week=<a Monday>` are 404s inside the app layout.
4. "North's schedule query is refused": replaying the kept `getSchedule` URL from South answers a 404, without North's order numbers in the body.
5. "an owner switches the schedule on in settings": on the settings page, the Schedule card's switch on: a row for South, one `module_enabled` entry, and the sidebar shows Schedule right after Orders.
6. The three South tests from Task 4 (South's engineers and orders only; North's order by its id refused; North's and inactive engineers refused).
7. "switching it off again hides it, and keeps the orders' plans": the card's switch off: the row is gone, one `module_disabled` entry, `/schedule` is a 404 again, and South's orders' `scheduled_for` and `engineer_id` are what they were before the switch.

- [ ] **Step 2: Run them**

Run: `pnpm vp test run --project e2e src/modules/schedule/e2e`
Expected: PASS. Fix the tests (not the app) only where a locator is wrong; a refusal that doesn't happen is a bug in the module to fix.

- [ ] **Step 3: Check the file leaves South as seeded**

Run: `pnpm vp test run --project e2e src/modules/schedule/e2e/schedule.tenancy.test.ts e2e/tenancy.test.ts` (one worker: `--maxWorkers=1`, so they share a database in this order).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/schedule/e2e
git commit -m "Test the schedule for a tenant without it, and switching it on and off"
```

---

### Task 6: Switching modules: stale rows, refusal messages, the dialog

**Files:**

- Create: `src/routes/(app)/settings/module-card.svelte.spec.ts`
- Modify: `src/lib/modules/graph.ts` (+ `graph.spec.ts`), `src/routes/(app)/settings/settings.remote.ts`, `src/routes/(app)/settings/module-card.svelte`, `src/lib/components/form/fake-form.ts`, `messages/{en,nl}/settings.json`, `e2e/tenancy.test.ts`

**Interfaces:**

- `changeModules(stored, change, graph?)` returns `{ stored: ModuleId[] } | { refused: { alwaysOn: ModuleId[]; unmet: ModuleId[] } }`:
  - `next` = stored plus `enable` (but not the always-on ones it names) minus `disable`; a stored always-on row stays;
  - `alwaysOn` = the always-on modules in `disable`;
  - `unmet` = the modules of `next` that aren't in `effectiveModules(next)` but were in `effectiveModules(stored)` or are in `enable`;
  - refused when either list isn't empty, in graph order.
- `setModules`: the `v.check` for an empty submission uses `m.settings_modules_nothing_to_change`; a refusal with `alwaysOn` uses `m.settings_modules_always_on_refused({ modules })`, otherwise `m.settings_modules_refused({ modules })` with `unmet`.
- Messages (`settings.json`, en/nl): `settings_modules_nothing_to_change` ("Choose a module to switch on or off." / "Kies een module om aan of uit te zetten."), `settings_modules_always_on_refused` (`{modules}`: "{modules} can't be switched off." / "{modules} kan niet uit.").
- `module-card.svelte`: the switch-off dialog shows `<Field.FieldError errors={form.fields.allIssues()} />` above its footer (and the card's own error only outside the dialog's branch).
- `fake-form.ts`: `fakeForm({ fields: string[], issues?, pending?, onsubmit? })`, a remote form whose `fields.<name>` are `fakeField`s and whose `fields.allIssues()` returns `issues`; `fakeIdForm` becomes `fakeForm({ fields: ["id"], … })`.

- [ ] **Step 1: Write the failing tests**

`graph.spec.ts` (against `fakeGraph`; the existing `changeModules` tests change to the new shape):

```ts
test("a stale row doesn't block an unrelated change, and stays", () => {
	// addon is stored without base: it's off, but switching side on is fine.
	expect(changeModules(["addon"], { enable: ["side"], disable: [] }, fakeGraph)).toEqual({
		stored: ["addon", "side"],
	});
});
test("switching a stale module on with what it requires mends it", () => {
	expect(changeModules(["addon"], { enable: ["addon", "base"], disable: [] }, fakeGraph)).toEqual({
		stored: ["base", "addon"],
	});
});
test("a change that leaves a module without a requirement is refused, saying which", () => {
	expect(
		changeModules(["base", "addon", "extra"], { enable: [], disable: ["base"] }, fakeGraph),
	).toEqual({ refused: { alwaysOn: [], unmet: ["addon"] } });
});
test("switching off an always-on module is refused as such, and one is never stored", () => {
	expect(changeModules([], { enable: [], disable: ["core-ish"] }, fakeGraph)).toEqual({
		refused: { alwaysOn: ["core-ish"], unmet: [] },
	});
	expect(changeModules([], { enable: ["core-ish"], disable: [] }, fakeGraph)).toEqual({
		stored: [],
	});
});
```

`module-card.svelte.spec.ts` (mock `./settings.remote.ts` with `setModules: { for: () => fakeForm({ fields: ["enable", "disable"], issues, onsubmit }) }` and `#lib/modules/ids.ts` with `moduleGraph: fakeGraph`, as `session.spec.ts` does; modules made up as the card's `Module` type):

- switching `addon` on while `base` is off says "Also switches on Base." and submits `addon` and `base` to enable;
- switching `base` off while `addon` is on opens a dialog naming Addon; confirming submits `base` and `addon` to disable;
- a refusal shows inside the open dialog (`getByRole("alertdialog")` contains the issue's text);
- an always-on module has a disabled "Always on" button and no form.

`e2e/tenancy.test.ts`, in its "modules" describe: as the owner in South, an empty submission (the hidden inputs of the contracts card's form removed with `page.evaluate` before submitting) is refused with "Choose a module to switch on or off." on that card, and South's `organization_module` rows and activity are unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vp test run src/lib/modules/graph.spec.ts "src/routes/(app)/settings/module-card.svelte.spec.ts"`
Expected: FAIL (old return shape; `fakeForm` missing; no error in the dialog).

- [ ] **Step 3: Implement** `changeModules()`, `setModules`, the messages (en + nl), the dialog and `fakeForm`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vp test run src/lib/modules "src/routes/(app)/settings" src/lib/components/form src/lib/i18n/messages.spec.ts && pnpm vp test run --project e2e e2e/tenancy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules "src/routes/(app)/settings" src/lib/components/form messages e2e/tenancy.test.ts
git commit -m "Let stale module rows be, and say why a module switch is refused"
```

---

### Task 7: The generator and `org:create` check the graph too

**Files:**

- Modify: `scripts/modules/graph.ts` (+ `graph.spec.ts`), `src/lib/server/db/create-organization-args.ts` (+ spec), `README.md` ("Deploying": the `org:create` example and the list of modules)

**Interfaces:**

- `graphProblems()` adds, for an always-on module that requires a module that isn't always on: `src/modules/<id> is always on, so it can't require <other>, which can be switched off.`
- `parseCreateArgs(args: string[], graph: ModuleGraph = moduleGraph)`: the known ids are the graph's; after the unknown-id check, `changeModules([], { enable: modules, disable: [] }, graph)`; when refused, the usage error `--modules: <module> requires <missing>; add it to --modules` per module (the missing ones from `moduleSetProblems()` of what was asked); otherwise `modules` is the outcome's `stored` (graph order, always-on ones left out).
- `README.md`: the example passes `--modules contracts,invoicing,schedule`, and the sentence about `--modules` lists `contracts`, `invoicing`, `schedule` and says a new organization has only the modules it lists.

- [ ] **Step 1: Write the failing tests**

`scripts/modules/graph.spec.ts`:

```ts
test("an always-on module can't require one that can be switched off", () => {
	expect(graphProblems([module("a", { alwaysOn: true, requires: ["b"] }), module("b")])).toEqual([
		"src/modules/a is always on, so it can't require b, which can be switched off.",
	]);
	expect(
		graphProblems([
			module("a", { alwaysOn: true, requires: ["b"] }),
			module("b", { alwaysOn: true }),
		]),
	).toEqual([]);
});
```

`create-organization-args.spec.ts` (with `fakeGraph`):

```ts
test("modules come with what they require, or are refused", () => {
	expect(() => parseCreateArgs([...required, "--modules", "extra"], fakeGraph)).toThrow(
		"--modules: extra requires addon; add it to --modules",
	);
	expect(parseCreateArgs([...required, "--modules", "addon,base"], fakeGraph)).toMatchObject({
		modules: ["base", "addon"],
	});
	expect(parseCreateArgs([...required, "--modules", "core-ish"], fakeGraph)).toMatchObject({
		modules: [],
	});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vp test run scripts/modules/graph.spec.ts src/lib/server/db/create-organization-args.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** both checks and the README.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vp test run scripts/modules src/lib/server/db/create-organization-args.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/modules src/lib/server/db README.md
git commit -m "Check module requirements in the generator and in org:create"
```

---

### Task 8: The plans index

**Files:**

- Modify: `docs/plans/README.md`

- [ ] **Step 1:** Mark step 3 done, and in "Carried from step 1 into the later plans" replace the "Schedule plan" item with what's still carried: the e2e of the settings page's dependency prompts and of a tampered unmet-requirement or always-on refusal, for the first plan with a real `requires` or `alwaysOn` module.

- [ ] **Step 2: Commit**

```bash
git add docs/plans/README.md
git commit -m "Mark the schedule pilot done in the plans index"
```

---

## Order and parallel work

Tasks 1 → 3 → 4 → 5 in order; Task 4 also needs Task 2 (the sidebar places the module). Task 2 can run beside Task 1, and Task 6 beside Tasks 1–5 (it touches `src/lib/modules/graph.ts`, the settings page and `e2e/tenancy.test.ts`, which Task 5 only runs). Task 7 comes after Task 2 (both change `scripts/modules/graph.ts`) and Task 6 (`org:create` uses the new `changeModules()` result). Task 8 last.

## After this plan

The **portal pilot** (step 4, after the roles plan), the **inspector** (step 5), and the carried e2e of the dependency prompts once a real module has `requires` or `alwaysOn`.
