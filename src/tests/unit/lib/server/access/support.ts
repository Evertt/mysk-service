/**
 * What the access specs share (`matrix.spec.ts` for the core, each module's
 * `tests/unit/server/access.spec.ts`): the ids a table holds for an organization, read by SQL of
 * the spec's own, and the subjects the actors may read of them.
 */
import { mayRead } from "#lib/server/access/index.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, rows, value } from "#unit/lib/server/harness/index.ts";

/**
 * The ids of `table` in `organization` (`org-north`, `org-south`, `org-shltr`), as text, by id;
 * `where` is more SQL on the table (with `args` for its `?`s).
 */
export const idsOf = async (
	table: string,
	organization: string,
	where = "",
	args: (string | number)[] = [],
	column = "id",
) =>
	(
		await rows<{ id: number | string }>(
			`select ${column} as id from "${table}" where organization_id = ? ${where} order by 1`,
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

/** The engineer record the actor is linked to (the account is added on first use). */
export const engineerIdOf = async (actor: Actor) => {
	await as(actor, () => null);
	return value<number>(
		`select e.id from engineer e join "user" u on u.id = e.user_id where u.email = ?`,
		[actor.email],
	);
};

/** The actor's `portal_contact` and the customer it is for (the account is added on first use). */
export const contactOf = async (actor: Actor) => {
	await as(actor, () => null);
	const [contact] = await rows<{ id: number; customer_id: number }>(
		`select c.id, c.customer_id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
		[actor.email],
	);
	return { id: contact.id, customerId: contact.customer_id };
};

/** The customer the actor is a contact of. */
export const customerIdOf = async (actor: Actor) => (await contactOf(actor)).customerId;
