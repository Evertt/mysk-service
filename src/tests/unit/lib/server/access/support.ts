/**
 * What the access specs share (`matrix.spec.ts` for the core, each module's
 * `tests/unit/server/access.spec.ts`): the ids a table holds for an organization, read by SQL of
 * the spec's own, and the subjects the actors may read of them.
 */
import { mayRead } from "#lib/server/access/index.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, rows } from "#unit/lib/server/harness/index.ts";

/**
 * The ids of `table` in `organization` (`org-north`, `org-south`, `org-shltr`), as text, by id;
 * `where` is more SQL on the table (with `args` for its `?`s).
 */
export const idsOf = async (
	table: string,
	organization: string,
	where = "",
	args: (string | number)[] = [],
) =>
	(
		await rows<{ id: number | string }>(
			`select id from "${table}" where organization_id = ? ${where} order by id`,
			[organization, ...args],
		)
	).map((row) => String(row.id));

/** `ids` as the subjects of `type`. */
export const subjects = (type: string, ids: readonly string[]) => ids.map((id) => ({ type, id }));

/** `ids` as the `type/id` keys `readable()` answers with. */
export const keys = (type: string, ids: readonly string[]) =>
	new Set(ids.map((id) => `${type}/${id}`));

/** Which of `ids` the actor may read, asking one record at a time (so its table is asked). */
export const readOneByOne = (actor: Actor, type: string, ids: readonly string[]) =>
	as(actor, async () => {
		const read: string[] = [];
		for (const id of ids) if (await mayRead({ type, id })) read.push(id);
		return read;
	});
