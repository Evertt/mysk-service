# Live changes and activity subjects

Candidates C2 and C3 of `docs/reviews/architecture-review.md`, taken as one, after grilling
(decisions Q1–Q7 below) and the design-it-twice step. The interface is a hybrid: the named
builders and `readAt` of the "simplest default" design, the two-form `live()` of both it and the
"fewest entry points" design, and the latter's single-shape client helper.

## Problem

- **Nine live queries re-implement the subscription.** Every `query.live` combines
  `watchChanges()`/`watchSubject()`, the request's abort signal, `changedAt()`, a `finally` that
  calls `stop()` and, for two of them, `inThisRequest()`. Six are line-for-line the same
  (`watchActivity`, `watchSchedule`, `watchEnergy`, `watchDocks`, `watchMyWork`, `watchPortal`);
  `getSimulation`, `watchAwaitingAcceptance` and `watchRecordChanges` vary it. The ordering
  ("watch before the first answer") and the SSR `finally` exist only as repeated comments.
- **Seven client copies** of the "refresh when it changes" effect (`seen`, `changed !== seen`,
  refresh), plus two schedule variants that compare the first answer with the data's read time.
- **Record types are free strings.** `Subject.type`, `announceChange()`, the watch lists, the
  `ActivityCard` `type` prop and `getSubjectActivity`'s input are `string`. Energy announces
  `"energy_reading"`, which no subject defines; a typo in any watch list silently never fires.
  Each module's `activity.ts` annotates its subjects `Record<string, SubjectType>`, which erases
  their names.
- **A subject's label is also its page's URL key**, by convention only. `subjects.ts` links an
  order by `number: label`, a customer by `code`, a unit by `serial`; about 31 call sites and four
  local helpers (`subjectOf`, `customerParent`, two `customerSubject`s) pass the right field by
  hand. All of them are right today; nothing would notice one that isn't.
- **Symptoms:** change amplification (9 + 7 copies), unknown unknowns (a typo or wrong label
  fails silently).

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | One subject builder each for `order`, `customer` and `equipment` (the page-keyed types), used as subject and as parent; the local helpers go. Other types keep inline literals, checked by the union. |
| Q2  | One server helper and one plain client helper. `refreshOnActivity` keeps its throttle and hidden-tab logic on top of the client helper. Behaviour stays as it is.                                     |
| Q3  | The subject-type union covers core's and the modules' types.                                                                                                                                          |
| Q4  | A module declares the types it only announces (never logs) in its manifest, `liveTypes`; energy's `energy_reading` is the one. `watchActivity` never wakes on them.                                   |
| Q5  | The server helper runs all 9 live queries, including the two that yield data through `inThisRequest()` and `watchRecordChanges`.                                                                      |
| Q6  | The client helper takes an optional read time; only the schedule passes it (the board and the month). The other pages behave as today.                                                                |
| Q7  | Docks' direct read of the activity table (`docks/board/board.remote.ts:99-120`) stays.                                                                                                                |
| —   | Docs go in the existing pages (`docs/agents/database.md`'s live-query paragraph, `modules.md` for `liveTypes`). No `GLOSSARY.md`, as for the order lifecycle.                                         |

## Proposed interface

### Subject types (types only, no generator change)

`manifests.gen.ts` is `as const` and `defineModule` is a `const` generic, so the union is derived
the way `ModuleAction` already is.

```ts
// src/lib/modules/manifests.ts
interface ModuleParts {
	subjects?: Record<string, SubjectType>;
	/** Types the module announces for its live queries but never logs (e.g. energy's readings). */
	liveTypes?: readonly string[];
	// …
}
type SubjectsOf<M> = M extends { subjects: infer S } ? keyof S & string : never;
type LiveOf<M> = M extends { liveTypes: readonly (infer T extends string)[] } ? T : never;
export type ModuleSubjectType = SubjectsOf<(typeof modules)[number]>;
export type ModuleLiveType = LiveOf<(typeof modules)[number]>;

// src/lib/activity/subjects.ts
export const coreSubjectTypes = {/* as today */} satisfies Record<string, SubjectType>;
/** A type the activity log can name. */
export type LoggedType = keyof typeof coreSubjectTypes | ModuleSubjectType;
/** A type a change can be announced for: a logged type, or a module's live-only type. */
export type ChangeType = LoggedType | ModuleLiveType;
```

- Every module's `activity.ts` changes `: Record<string, SubjectType>` to
  `satisfies Record<string, SubjectType>`; energy's manifest adds `liveTypes: ["energy_reading"]`.
- `Subject.type` (log.ts) is `LoggedType`: a live-only type can't be logged. `Change.type`,
  `announceChange()` and the watch lists take `ChangeType`. `ActivityCard`'s `type`,
  `getSubjectActivity`'s input (a picklist of the logged types) and the feed's type filter take
  `LoggedType`.
- `watchActivity` keeps watching `Object.keys(subjectTypes(allModules))`: logged types only.
- If the type-only imports between `subjects.ts`, `log.ts` and `manifests.ts` form a cycle that
  svelte-check or the boundaries spec dislikes, the two type aliases move to a type-only
  `src/lib/activity/types.ts`.

### Builders: `src/lib/activity/page-subjects.ts` (browser-safe, no `resolve()`)

```ts
export const orderSubject = (order: { id: number; number: string }) => ({
	type: "order" as const,
	id: order.id,
	label: order.number,
});
export const customerSubject = (customer: { id: number; code: string }) => ({
	type: "customer" as const,
	id: customer.id,
	label: customer.code,
});
export const equipmentSubject = (unit: { id: number; serialNumber: string }) => ({
	type: "equipment" as const,
	id: unit.id,
	label: unit.serialNumber,
});
```

- The parameter types follow the real column names (`serialNumber` for equipment).
- No `pageKeys` map (changed while building): `resolve()`'s typed parameters already check the
  route parameter's name in `subjects.ts`'s hrefs, so the rule that can break silently is the
  label's field, which lives only in the builders. A spec checks that each builder's subject
  links to its record's page through `coreSubjectTypes[subject.type].href`.
- Exported through `#lib/activity` for core and modules (modules may import core).

### Server: `src/lib/server/live.ts`

`changes.ts` stays the bus (`announceChange()`, and `changedAt()`/`watch()` for `live.ts` only);
`watchChanges`, `watchSubject` and `changedAt` stop being used outside it.

```ts
type Watched = readonly ChangeType[] | { type: LoggedType; id: string | number };

/** A live query's answers: when the records of `types` last changed, again on each change. */
export function live(types: readonly ChangeType[]): AsyncGenerator<number, void>;
/**
 * A live query's answers: `answer(null)` first, then `answer(change)` once per burst of changes
 * to the watched types or record.
 */
export function live<T>(
	watched: Watched,
	answer: (change: Change | null) => T | Promise<T>,
): AsyncGenerator<Awaited<T>, void>;

/** When the records of `types` last changed, as a query's data should carry it (the schedule's). */
export function readAt(types: readonly ChangeType[]): number;
```

Invariants, in order:

1. Called inside the live query's function. Reads the tenant (`currentTenant()`), starts watching
   and captures `inThisRequest()` before returning: a change after the call is never missed.
2. Wires the request's abort signal to `stop()`.
3. The first answer runs in the request; every later one through the captured runner (Cloudflare).
4. `stop()` runs in `finally`, on abort, and when `answer` throws.

Error modes: whatever `answer` throws (`error(404)`) ends the query and stops watching; a check in
the first answer runs after watching started. Outside a request, `currentTenant()` throws.
`query.live` accepts a function returning an `AsyncGenerator`
(`RemoteLiveQueryUserFunctionReturnType`), so callers return `live(…)` directly.

### Client: `src/lib/hooks/refresh-on-change.svelte.ts`

```ts
/**
 * Calls `refresh` (untracked) when a live query's answer changes. Call it while a component
 * initializes. `watch` is the live query (`watchPortal`) or a getter that may give none yet.
 */
export function refreshOnChange(
	watch: () => { current: unknown } | undefined,
	refresh: () => unknown,
	/** The data's read time: a first answer later than it counts as a change. */
	readTime?: () => number,
): void;
```

- The first answer is remembered, not acted on, unless `readTime` is given and the answer is
  later (read untracked). Each later answer that differs calls `refresh`.
- When the getter gives another query (or none), the last answer seen is forgotten.

### Usage

```ts
// schedule.remote.ts
const boardTypes = ["order", "engineer", "customer"] as const satisfies readonly ChangeType[];
export const watchSchedule = query.live(() => live(boardTypes));
// getSchedule / getScheduleMonth: `changedAt: readAt(boardTypes)` (the local readAt() goes)

// simulation.remote.ts
export const getSimulation = forMembers.query.live(moduleId, (id) =>
	live(["simulation"], async (change) => {
		if (!change && !currentTenant().modules.includes(id)) error(404, m.common_error_not_found());
		return view(await simulationOf(id));
	}),
);

// activity.remote.ts
export const watchRecordChanges = forMembers.query.live(recordInput, ({ type, id }) => {
	const { user } = currentTenant();
	return live({ type, id }, async (change): Promise<RecordChange | null> => {
		if (change)
			return {
				action: change.action ?? "updated",
				name: change.user?.name ?? "",
				mine: change.user?.id === user.id,
				at: Temporal.Instant.fromEpochMilliseconds(change.at),
			};
		const table = watchedRecords[type];
		const [found] = await db.select({ id: table.id }).from(table).where(idInTenant(table, id));
		if (!found) error(404, m.common_error_not_found());
		return null;
	});
});

// an order with its customer as parent
await recordActivity(tx, {
	action: "updated",
	subject: orderSubject(saved),
	parent: customerSubject(owner),
});
```

```ts
// (customer)/portal/live.svelte.ts and (field)/my/live.svelte.ts go; pages call:
refreshOnChange(watchPortal, () => getPortalOrder(number).refresh());
// dock-state:   refreshOnChange(() => docked && watchDocks(), () => query?.refresh());  (docked: a $derived boolean)
// month view:   refreshOnChange(watchSchedule, () => getScheduleMonth(month).refresh(), () => data.changedAt);
// board:        refreshOnChange(watchSchedule, () => { outdated = true; if (!drag.busy) void refresh(); }, () => schedule.changedAt);
// refreshOnActivity: refreshOnChange(watchActivity, schedule)  (throttle and hidden tabs unchanged)
```

## Cohesion statement

- **Single responsibility:** tells a page, in its tenant, that the records it shows changed.
- **What it owns:**
  - the typed record types (logged and live-only) the log, the announcements and the watchers
    share;
  - how the three page-keyed types are named in the log (label = URL key);
  - a live query's lifecycle: watch first, abort, `finally`, the Cloudflare re-read, bursts;
  - the data's read time;
  - on the client, the first-answer rule and the refresh.
- **What stays out:**
  - what each live query reads (its `answer`), and what each page refreshes;
  - announcing: `recordActivity()` and the telemetry announcements of docks and energy;
  - diffing, action verbs, how fields read (`subjects.ts`'s formats stay where they are);
  - throttling: `refreshOnActivity`'s, on the client; no options on `live()`;
  - docks' direct read of the log (Q7).

## Dependency strategy

In-process. The bus is a module-level map (one Durable Object per organization on Cloudflare);
`inThisRequest()` is the only seam to Cloudflare and does nothing on Node, so tests stub
`globalThis.durableRequests` as `in-this-request.spec.ts` does. The database is libsql in tests.
No ports or adapters.

## Testing strategy

- **New `src/tests/unit/lib/server/live.spec.ts`**, in the request harness, at the interface:
  - a change between the call and the first `next()` still brings a second answer;
  - a burst brings one answer; `live(types)` answers the latest change time;
  - abort ends it; a generator never resumed still stops (SSR); `answer` throwing stops watching
    and propagates;
  - later answers run inside a stubbed `durableRequests` store, the first outside it;
  - a record watch gets only its record's changes, with who made them;
  - `readAt()`'s millisecond rule (moved from `schedule.spec.ts`).
- **`changes.spec.ts`** keeps the bus (organizations, types, `changedAt`); its lifecycle tests
  move to `live.spec.ts`.
- **New `src/tests/unit/lib/hooks/refresh-on-change.svelte.spec.ts`** (`$effect.root` with a
  `$state` stand-in, as `clock.svelte.spec.ts`): the first answer is ignored; with a read time, a
  later first answer refreshes and an equal one doesn't; a getter giving none, then a query;
  switching query forgets the last answer; `refresh` isn't tracked.
- **Subjects:** a spec that each builder's subject links to its record's page, and type tests
  (`@ts-expect-error`, run by svelte-check): `recordActivity` refuses `"energy_reading"`,
  `announceChange` accepts it, an unknown type fails.
- **Kept:** `harness.spec.ts:196` (end to end), `activity.spec.ts:279-312` (the 404 and the
  `RecordChange` mapping, plus: `watchActivity` ignores `energy_reading`), `simulation.spec.ts`,
  `schedule.spec.ts:171-185` reduced to the board's types and read time; the e2e live files
  (dashboard, activity, portal, orders, schedule, schedule worker) as the behaviour check.
- **Removed:** per-query assertions of the lifecycle, which `live.spec.ts` covers once.

## Migration strategy

Single switchover per part, in commits that each pass the gate: the builders first (built while
the types were being tightened, they take over the literals the tighter types would flag), then
the types, then the live helpers with all callers, then the client helper. No old and new side by side
beyond a commit: every caller is in this repository.

## Implementation steps

1. **Subject-type union** (~25 files, small edits).
   - `coreSubjectTypes` to `satisfies`; `LoggedType`, `ChangeType`; `ModuleParts.liveTypes`,
     `ModuleSubjectType`, `ModuleLiveType` in `manifests.ts`.
   - Each module's `activity.ts` to `satisfies`; energy's `module.ts` gets `liveTypes`.
   - `Subject.type`, `Change.type`, `announceChange()`, `watchChanges()`'s list, `ActivityCard`,
     `getSubjectActivity`, the feed's filter. Fix what the compiler finds (the watch lists:
     `boardSubjects`, `energySubjects`, `dockSubjects` — rename the shadowing local — and the
     portals' `portalSubjects`).
   - Type tests. Check `pnpm run check` and the boundaries spec.
2. **Builders** (~20 call sites).
   - `page-subjects.ts`, exported from `#lib/activity`.
   - Replace the inline order/customer/equipment literals (about 31; find them by
     `type: "order"`, `"customer"`, `"equipment"`) and the four local helpers; the composite helpers
     in `customers/server/sites.ts`, `equipment/server/locations.ts` and
     `maintenance/server/plans.ts` use the builders for their parent. `equipment-list.remote.ts`
     builds its subject from the unit rather than `bulkChange`'s label.
   - The builder/href spec.
3. **Server live helper.**
   - `live.ts` with `live()` and `readAt()`; tests first (`live.spec.ts`).
   - Move the 9 live queries onto it; the schedule's `readAt()` goes; `changes.ts` exports only
     what `live.ts` and `log.ts` need (knip will tell).
   - Trim `changes.spec.ts` and `schedule.spec.ts` as above.
4. **Client helper.**
   - `refresh-on-change.svelte.ts`, tests first.
   - Replace the 7 plain effects, the board's and the month view's; delete the two portals'
     `live.svelte.ts`; `refreshOnActivity` uses it underneath.
   - Run the Svelte autofixer on the changed components.
5. **Docs.** `database.md`'s live-query paragraph (`live()`, `readAt()`, `refreshOnChange()`, the
   builders); `modules.md` (`liveTypes`, `satisfies` for subjects); `AGENTS.md`'s "Changes and
   the activity log" names `live()` instead of `watchChanges()`/`watchSubject()`.
6. **Gate:** `pnpm run check`, `pnpm knip`, the specs above, and the e2e live files plus the
   energy and docks e2e files, one at a time under the lock.

## Changed while building

- **No `pageKeys` map** (see the builders section).
- **Order of the commits:** builders first, then the types (Migration strategy).
- **"`refresh` isn't tracked" has no test:** an effect re-run caused by what `refresh` reads has the
  same live query and the same answer, so it never refreshes again; the mutation is equivalent
  (review round 1). `untrack()` stays, so such re-runs don't happen.
- **`schedule.spec.ts`'s read-time tests stay** as the board's integration of `readAt()`;
  `changes.spec.ts`'s lifecycle tests moved to `live.spec.ts`.
- **A getter must not hand `refreshOnChange()` a new handle of the same live query:** each call of
  a remote live query gives a new proxy, which the helper takes for another live query. The door
  card's getter depends on whether the door is a dock's, not on the dock (review round 1).
