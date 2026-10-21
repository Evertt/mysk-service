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
import type { SQL } from "drizzle-orm";

import { accessRules } from "#lib/access/extensions.ts";
import { collectNow } from "#lib/server/extensions.ts";

import { coreRules } from "./core.ts";
import type { AccessRule, Condition, Rules } from "./rules.ts";
import { viewer } from "./viewer.ts";

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
const keyOf = ({ type, id }: RecordRef) => `${type}/${id}`;

/**
 * Of `subjects`, the keys the viewer may `which`, a statement per type. With `trust` a rule that
 * lets every record of the tenant through (`"all"`) answers without one.
 */
async function allowed(subjects: readonly RecordRef[], which: Which, trust: boolean) {
	const rules = rulesOf();
	const asking = await viewer();
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

/** Whether the viewer may read the record: it exists in the tenant and a rule of theirs has it. */
export async function mayRead(subject: RecordRef) {
	return (await allowed([subject], "read", false)).has(keyOf(subject));
}

/** The same, or the 404 a record that doesn't exist gets. */
export async function readOrNotFound(subject: RecordRef) {
	if (!(await mayRead(subject))) error(404, m.common_error_not_found());
}

/** Of `subjects` (the tenant's own), those the viewer may read, as `type/id` keys. */
export const readable = (subjects: readonly RecordRef[]) => allowed(subjects, "read", true);

/** Whether the viewer may change the record. */
export async function mayChange(subject: RecordRef) {
	return (await allowed([subject], "change", false)).has(keyOf(subject));
}

/** The same, or a 404: a record they may not change reads as one that isn't there. */
export async function changeOrNotFound(subject: RecordRef) {
	if (!(await mayChange(subject))) error(404, m.common_error_not_found());
}

/** Of `subjects` (the tenant's own), those the viewer may change, as `type/id` keys. */
export const changeable = (subjects: readonly RecordRef[]) => allowed(subjects, "change", true);

/**
 * The viewer's condition on the table of `type`, to `read` or `change` (`undefined`: none, also for
 * an unknown type), for a list's `scope`, a join or a subquery. A type without a row of its own
 * (`order_type`, `module`) has no table to scope: a yes is a condition that holds.
 */
export async function visible(type: string, which: Which = "read"): Promise<SQL | undefined> {
	const rules = rulesOf();
	const rule: AccessRule | undefined = rules(type);
	const where: Condition | undefined = rule && (await rule[which](await viewer(), rules));
	return where && rule ? rule.scope(where) : undefined;
}
