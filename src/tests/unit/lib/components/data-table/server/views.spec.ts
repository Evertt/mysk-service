/**
 * The data tables' saved views and memory on the seeded demo database, as North's owner (who may
 * share views) and planner (who may not) use them: names are each user's once per table, in any
 * case; personal views are their owner's alone and not logged, shared ones everyone's to see and
 * the managers' to change, logged; South sees and changes none of North's, also by their ids; and
 * a table's memory is each member's own, per organization, and remembers only a view they see.
 * The server side of `src/tests/e2e/views.test.ts` and `views.memory.test.ts`, which keep the
 * menu, the restored lists and one tampered rename.
 */
import { describe, expect, test } from "vite-plus/test";

import { getTableMemory, rememberTable } from "#lib/components/data-table/table-memory.remote.ts";
import {
	createView,
	deleteView,
	getTableViews,
	renameView,
	shareView,
	updateView,
} from "#lib/components/data-table/views.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const customersKey = "/(app)/customers";
const ordersKey = "/(app)/orders";
const [owner, planner] = [north.owner, north.member];

/** Saves a view of the customers list as `actor`; answers with the form's answer. */
const save = (
	actor: Actor,
	name: string,
	{ shared = false, query = "?segment=enterprise", tableKey = customersKey } = {},
) => as(actor, () => submit(createView, { tableKey, name, query, columns: "{}", shared }));

const viewNamed = async (name: string, organization = northId) =>
	(
		await rows<{ id: number; name: string; query: string; shared: number; user_id: string }>(
			`select id, name, query, shared, user_id from saved_view
			 where organization_id = ? and table_key = ? and name = ?`,
			[organization, customersKey, name],
		)
	)[0];

/** The activity logged about a saved view, oldest first. */
const viewActivity = async (id: number) =>
	(
		await rows<{ action: string }>(
			`select action from activity where subject_type = 'saved_view' and subject_id = ? order by id`,
			[String(id)],
		)
	).map((row) => row.action);

/** The names of the customers list's views `actor` sees. */
const seen = async (actor: Actor) =>
	(await as(actor, () => data(getTableViews, customersKey))).views.map((view) => view.name);

describe("saved views, in North", () => {
	test("a personal view is its owner's alone, and not logged", async () => {
		expect(await save(owner, "Big accounts")).toMatchObject({ status: 200 });
		const view = (await viewNamed("Big accounts"))!;
		expect(view).toMatchObject({ query: "?segment=enterprise", shared: 0 });
		expect(await viewActivity(view.id)).toEqual([]);
		expect(await seen(owner)).toContain("Big accounts");
		expect(await seen(planner)).not.toContain("Big accounts");
	});

	test("a name the user already has for the table is refused, whatever its case", async () => {
		const answer = await save(owner, "big accounts");
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(
			expect.objectContaining({
				name: "name",
				message: "You already have a view called “big accounts” here",
			}),
		);
		// Another user may have it.
		expect(await save(planner, "Big accounts")).toMatchObject({ status: 200 });
	});

	test("renaming and updating a personal view change it, unlogged", async () => {
		const view = (await viewNamed("Big accounts"))!;
		await as(owner, async () => {
			expect(
				await submit(renameView, { id: String(view.id), name: "Every segment" }),
			).toMatchObject({
				status: 200,
			});
			expect(
				await call(updateView, {
					id: view.id,
					query: "?segment=enterprise,mid_market",
					columns: {},
				}),
			).toMatchObject({ status: 200 });
		});
		const renamed = (
			await rows<{ name: string; query: string }>(
				`select name, query from saved_view where id = ?`,
				[view.id],
			)
		)[0];
		expect(renamed).toEqual({ name: "Every segment", query: "?segment=enterprise,mid_market" });
		expect(await viewActivity(view.id)).toEqual([]);
	});

	test("an owner shares views with the organization, which is logged", async () => {
		const view = (await viewNamed("Every segment"))!;
		await as(owner, () => call(shareView, { id: view.id, shared: true }));
		expect((await viewNamed("Every segment"))!.shared).toBe(1);
		expect(await viewActivity(view.id)).toEqual(["shared"]);

		expect(await save(owner, "Shared from the start", { shared: true })).toMatchObject({
			status: 200,
		});
		const created = (await viewNamed("Shared from the start"))!;
		expect(created.shared).toBe(1);
		expect(await viewActivity(created.id)).toEqual(["created"]);
		// Everyone sees them, theirs to change only if they may share.
		const { views, canShare } = await as(planner, () => data(getTableViews, customersKey));
		expect(canShare).toBe(false);
		expect(views.filter((v) => !v.mine).map((v) => [v.name, v.editable])).toEqual([
			["Every segment", false],
			["Shared from the start", false],
		]);
	});

	test("the planner can't share, nor change or delete a shared view", async () => {
		const shared = (await viewNamed("Every segment"))!;
		expect(await save(planner, "Small ones", { shared: true })).toMatchObject({ status: 403 });
		expect(await viewNamed("Small ones")).toBeUndefined();
		const own = (await save(planner, "Small ones")).data as { id: number };
		await as(planner, async () => {
			expect(await call(shareView, { id: own.id, shared: true })).toMatchObject({ status: 403 });
			expect(await call(deleteView, shared.id)).toMatchObject({ status: 403 });
			expect(
				await call(updateView, { id: shared.id, query: "?segment=small_business", columns: {} }),
			).toMatchObject({ status: 403 });
			expect(await submit(renameView, { id: String(shared.id), name: "Mine now" })).toMatchObject({
				status: 403,
			});
		});
		expect(await viewNamed("Every segment")).toEqual(shared);
		expect(await seen(owner)).not.toContain("Small ones");
	});

	test("unsharing and deleting a shared view are logged", async () => {
		const view = (await viewNamed("Every segment"))!;
		const created = (await viewNamed("Shared from the start"))!;
		await as(owner, async () => {
			await call(shareView, { id: view.id, shared: false });
			expect(await call(deleteView, created.id)).toMatchObject({ status: 200 });
		});
		expect((await viewNamed("Every segment"))!.shared).toBe(0);
		expect(await viewNamed("Shared from the start")).toBeUndefined();
		expect(await viewActivity(created.id)).toEqual(["created", "deleted"]);
		expect(await viewActivity(view.id)).toEqual(["shared", "unshared"]);
	});
});

describe("saved views, in South", () => {
	test("none of North's show, nor can they be changed or deleted by their ids", async () => {
		// One of North's shared again, which every member of North sees.
		const target = (await viewNamed("Every segment"))!;
		await as(owner, () => call(shareView, { id: target.id, shared: true }));
		const before = await viewNamed("Every segment");
		expect(await seen(south.owner)).toEqual([]);
		await as(south.owner, async () => {
			expect(await submit(renameView, { id: String(target.id), name: "Tampered" })).toMatchObject({
				status: 404,
			});
			expect(
				await call(updateView, { id: target.id, query: "?segment=mid_market", columns: {} }),
			).toMatchObject({ status: 404 });
			expect(await call(deleteView, target.id)).toMatchObject({ status: 404 });
			expect(await call(shareView, { id: target.id, shared: false })).toMatchObject({
				status: 404,
			});
		});
		expect(await viewNamed("Every segment")).toEqual(before);
	});
});

describe("a table's memory", () => {
	const remember = (actor: Actor, memory: Record<string, unknown>) =>
		as(actor, async () => {
			const { owner: whose } = await data(getTableMemory, ordersKey);
			return call(rememberTable, {
				owner: whose,
				tableKey: ordersKey,
				columns: null,
				query: "",
				viewId: null,
				...memory,
			});
		});
	const memoryOf = async (actor: Actor) =>
		(await as(actor, () => data(getTableMemory, ordersKey))).memory;

	test("is each member's own, in each organization", async () => {
		await remember(owner, { columns: { total: false } });
		expect(await memoryOf(owner)).toEqual({ columns: { total: false }, query: "", viewId: null });
		// Not the planner's, nor the owner's in South (Anouk is South's owner too).
		expect(await memoryOf(planner)).toBeNull();
		expect(await memoryOf(south.owner)).toBeNull();
		// With nothing to remember, it's forgotten.
		await remember(owner, {});
		expect(await memoryOf(owner)).toBeNull();
	});

	test("remembers a view the member sees, not another's or another tenant's", async () => {
		const view = (actor: Actor, name: string) =>
			save(actor, name, { query: "?status=quote", tableKey: ordersKey }).then(
				(answer) => (answer.data as { id: number }).id,
			);
		const own = { id: await view(owner, "Quotes") };
		const theirs = { id: await view(planner, "Planner's quotes") };
		await remember(owner, { query: "?status=quote", viewId: own.id });
		expect((await memoryOf(owner))?.viewId).toBe(own.id);
		// The planner's personal view isn't the owner's to have open.
		await remember(owner, { query: "?status=quote", viewId: theirs.id });
		expect((await memoryOf(owner))?.viewId).toBeNull();
		// Nor is North's South's, by its id.
		await remember(south.owner, { query: "?status=completed", viewId: own.id });
		expect(await memoryOf(south.owner)).toEqual({
			columns: null,
			query: "?status=completed",
			viewId: null,
		});
		expect(
			await value(`select count(*) from table_memory where organization_id = ? and view_id = ?`, [
				southId,
				own.id,
			]),
		).toBe(0);
	});

	test("drops a save meant for the organization the member left", async () => {
		await remember(owner, { query: "?status=scheduled" });
		const answer = await as(owner, () =>
			call(rememberTable, {
				owner: `${southId}:someone`,
				tableKey: ordersKey,
				columns: { total: false },
				query: "?status=quote",
				viewId: null,
			}),
		);
		expect(answer.status).toBe(200);
		expect((await memoryOf(owner))?.query).toBe("?status=scheduled");
	});
});
