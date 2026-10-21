/**
 * Who may read or change a record: the one place that answers it, by subject (`{ type, id }`, what
 * the activity log, the change feeds and `onRecordChange()` speak). The gated sets decide who may
 * _call_ a function; this decides which _records_ they reach.
 *
 * - `mayRead(subject)` and `readOrNotFound(subject)` (the 404 with core's message): one record,
 *   checked against its table, so a record that doesn't exist, or is another tenant's, isn't readable;
 * - `readable(subjects)`: of a batch the tenant's own (a feed's burst, a catch-up query's subjects),
 *   those the viewer may read, as `type/id` keys, in one statement per type. A type the viewer
 *   reads whole answers without a query, so an entry of a deleted record stays;
 * - `readableTypes()`: the types the viewer reads at all, for the log's readers to drop the rest;
 * - `visible(type)`: the viewer's condition on the type's table, for a list's `scope`, a join or a
 *   subquery, where a record is read through its table;
 * - `mayChange`, `changeOrNotFound`, `changeable`: the same for a change. (Status rules stay in
 *   `#lib/orders/lifecycle.ts`: this says the record is theirs to touch, not that the move is allowed.)
 *
 * A type has one entry of rules per audience (`./rules.ts`): the core's in `./core.ts`, a module's in
 * its `server/access.ts` (`contribute(accessRules, …)`, `#lib/access/extensions.ts`). A type with no
 * entry, the records of a module the tenant lacks included, is unknown, and unknown is not found.
 */
import { error } from "@sveltejs/kit";
import { type SQL, sql } from "drizzle-orm";

import { accessRules } from "#lib/access/extensions.ts";
import { asSystem, tenantOf } from "#lib/server/auth/index.ts";
import { collectNow } from "#lib/server/extensions.ts";

import { coreRules } from "./core.ts";
import type { AccessRule, Condition, Rules } from "./rules.ts";
import { type Viewer, viewer } from "./viewer.ts";

/** A record by its type and id, as the log and the feeds name it. */
export interface RecordRef {
	type: string;
	id: string | number;
}

type Which = "read" | "change";

/** The current tenant's rules by type: the core's, and those of the modules it has on. */
function rulesOf(): Rules {
	const modules = collectNow(accessRules, undefined);
	return (type) => {
		if (Object.hasOwn(coreRules, type)) return coreRules[type as keyof typeof coreRules];
		for (const rules of modules) if (Object.hasOwn(rules, type)) return rules[type];
		return undefined;
	};
}

/** `type/id`, the key of a subject in what `readable()` answers. */
export const keyOf = ({ type, id }: RecordRef) => `${type}/${id}`;

/**
 * Of `subjects`, the keys the viewer may `which`, a statement per type. With `trust` a rule that
 * lets every record of the tenant through (`"all"`) answers without one.
 */
async function allowed(subjects: readonly RecordRef[], which: Which, trust: boolean, as?: Viewer) {
	const rules = rulesOf();
	const asking = as ?? (await viewer());
	const byType = Map.groupBy(subjects, (subject) => subject.type);
	const answers = await Promise.all(
		[...byType].map(async ([type, ofType]) => {
			const rule = rules(type);
			const where = rule && (await rule[which](asking, rules));
			if (!rule || !where) return [];
			const ids = [...new Set(ofType.map((subject) => String(subject.id)))];
			if (trust && where === "all") return ids.map((id) => `${type}/${id}`);
			return [...(await rule.check(ids, where))].map((id) => `${type}/${id}`);
		}),
	);
	return new Set(answers.flat());
}

/**
 * Whether the viewer may read the record: it exists in the tenant and a rule of theirs has it.
 * With `as`, whether that viewer may (`viewerIn()`, for another tenant's: run in it, see `mayReadIn()`).
 */
export async function mayRead(subject: RecordRef, as?: Viewer) {
	return (await allowed([subject], "read", false, as)).has(keyOf(subject));
}

/**
 * Whether `as` (`viewerIn()`: a member of organization `organizationId`, which needn't be the
 * request's tenant) may read the record there: the rules run as the system in that tenant, with the
 * modules it has on, but answer for `as`. For a viewer of the office or a customer's contact; an
 * engineer's rules read the request's own user.
 */
export async function mayReadIn(organizationId: string, as: Viewer, subject: RecordRef) {
	const tenant = await tenantOf(organizationId, { roles: [] });
	return !!tenant && asSystem(tenant, () => mayRead(subject, as));
}

/** The same, or the 404 a record that doesn't exist gets. */
export async function readOrNotFound(subject: RecordRef) {
	if (!(await mayRead(subject))) error(404, m.common_error_not_found());
}

/** Of `subjects` (the tenant's own), those the viewer may read, as `type/id` keys. */
export const readable = (subjects: readonly RecordRef[]) => allowed(subjects, "read", true);

/**
 * The subject types the viewer may read at all in this tenant: those with a rule whose read
 * condition for them isn't none. A type of a module the tenant lacks has no rule, and one only
 * managers read (`member`, …) none for anyone else, so neither is here. For the log's readers,
 * which hide the entries of the other types without asking per entry (so the entry of a deleted
 * record stays wherever the viewer reads its type whole).
 *
 * A type read under a condition counts too (`saved_view`, own or shared), though not every record is
 * theirs: the log holds only what was public when it was logged (a personal view is never logged,
 * a shared one's entries are the office's to see, its "unshared" entry included), so no entry
 * names a view that was private.
 */
export async function readableTypes(): Promise<string[]> {
	const rules = rulesOf();
	const asking = await viewer();
	const names = [
		...Object.keys(coreRules),
		...collectNow(accessRules, undefined).flatMap((own) => Object.keys(own)),
	];
	const answers = await Promise.all(
		names.map(async (type) => ((await rules(type)?.read(asking, rules)) ? type : undefined)),
	);
	return answers.filter((type) => type !== undefined);
}

/** Whether the viewer may change the record. */
export async function mayChange(subject: RecordRef) {
	return (await allowed([subject], "change", false)).has(keyOf(subject));
}

/** The same, or a 404: a record they may not change reads as one that isn't there. */
export async function changeOrNotFound(subject: RecordRef) {
	if (!(await mayChange(subject))) error(404, m.common_error_not_found());
}

/** Of `subjects`, those the viewer may change, as `type/id` keys: each is checked against its table. */
export const changeable = (subjects: readonly RecordRef[]) => allowed(subjects, "change", false);

/**
 * The viewer's (or `as`'s: a scope maker names its audience's viewer) condition on the table of
 * `type`, to `read` or `change` (`undefined`: none, also for an unknown type), for a list's `scope`,
 * a join or a subquery. A type without a row of its own (`order_type`, `module`) has no table to
 * scope: a yes is a condition that holds.
 */
export async function visible(
	type: string,
	which: Which = "read",
	as?: Viewer,
): Promise<SQL | undefined> {
	const rules = rulesOf();
	const rule: AccessRule | undefined = rules(type);
	const where: Condition | undefined = rule && (await rule[which](as ?? (await viewer()), rules));
	return where && rule ? rule.scope(where) : undefined;
}

/**
 * `visible()` for a query's `where`: a viewer who reads none of the type gets a condition that
 * holds for no record, where `undefined` in an `and()` would let every record through.
 */
export async function visibleOrNone(
	type: string,
	which: Which = "read",
	as?: Viewer,
): Promise<SQL> {
	return (await visible(type, which, as)) ?? sql`0`;
}
