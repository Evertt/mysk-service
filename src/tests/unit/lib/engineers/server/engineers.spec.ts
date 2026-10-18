/**
 * The engineers' remote functions on the seeded demo database: the list is the tenant's engineers
 * with their open orders, one with orders can't be deleted, an email address is the tenant's once
 * (in any case; another tenant may have it), the accounts an engineer can be linked to are the
 * tenant's members not linked to another engineer, the bulk change logs each engineer, and South
 * can't change, delete, link or (de)activate North's engineers by their ids. The server side of
 * `src/tests/e2e/engineers.test.ts` and `engineers.inline.test.ts`, which keep the pages, forms
 * and the tampered edit form.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	bulkSetEngineersActive,
	createEngineer,
	deleteEngineer,
	getEngineers,
	setEngineerActive,
	updateEngineer,
} from "#lib/engineers/engineers.remote.ts";
import { getEngineerAccount, linkEngineerAccount } from "#lib/engineers/form/account.remote.ts";
import { demoUsers } from "#lib/server/db/demo.ts";
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
const takenEmail = "Another engineer already uses this email address";
const openStatuses = `('quote', 'scheduled', 'in_progress')`;

/** An engineer as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from engineer where id = ?`, [id]);

/** The engineer of an organization with the most open orders. */
const busiest = async (organization: string) =>
	(
		await rows<{ id: number; name: string; email: string; open: number }>(
			`select e.id, e.name, e.email, count(*) as open from engineer e
			 join "order" o on o.engineer_id = e.id
			 where e.organization_id = ? and o.status in ${openStatuses}
			 group by e.id order by open desc, e.id limit 1`,
			[organization],
		)
	)[0];

/** The first engineer of an organization. */
const firstOf = (organization: string) =>
	value<number>(`select min(id) from engineer where organization_id = ?`, [organization]);

/** An engineer's edit form as the page fills it, with `changes`. */
async function engineerForm(id: number, changes: Record<string, unknown> = {}) {
	const [found] = await rows<Record<string, string | number>>(
		`select * from engineer where id = ?`,
		[id],
	);
	return {
		id: String(id),
		name: found.name,
		email: found.email,
		phone: found.phone,
		specialty: found.specialty,
		region: found.region,
		hourlyRate: Number(found.hourly_rate) / 100,
		hiredAt: found.hired_at,
		active: Boolean(found.active),
		...changes,
	};
}

/** A new engineer's form, with `changes`. */
const newForm = (changes: Record<string, unknown> = {}) => ({
	name: "Test Engineer",
	email: "test-engineer@fieldservice.example",
	phone: "+31 20 123 4567",
	specialty: "hvac",
	region: "West",
	hourlyRate: 72.5,
	hiredAt: "2024-03-01",
	active: true,
	...changes,
});

const messages = (answer: { issues?: { message: string }[] }) =>
	answer.issues?.map((issue) => issue.message) ?? [];

describe("North's engineers", () => {
	test("are listed by name, each with their open orders", async () => {
		const expected = await rows<{ id: number; open: number }>(
			`select e.id, (select count(*) from "order" o where o.engineer_id = e.id
			 and o.status in ${openStatuses}) as open from engineer e
			 where e.organization_id = ? order by e.name`,
			[northId],
		);
		const listed = await as(north.member, () => data(getEngineers));
		expect(listed.map((row) => [row.id, row.openOrders])).toEqual(
			expected.map((row) => [row.id, row.open]),
		);
		const busy = await busiest(northId);
		expect(Math.max(...listed.map((row) => row.openOrders))).toBe(busy.open);
	});

	test("one with orders can't be deleted, saying how many", async () => {
		const busy = await busiest(northId);
		const before = await snapshot(busy.id);
		const assigned = await value<number>(`select count(*) from "order" where engineer_id = ?`, [
			busy.id,
		]);
		const answer = await as(north.member, () => submit(deleteEngineer, { id: String(busy.id) }));
		expect(answer.status).toBe(400);
		expect(messages(answer)).toEqual([
			expect.stringContaining(
				`${busy.name} can't be deleted while ${assigned} orders are assigned to them`,
			),
		]);
		expect(await snapshot(busy.id)).toEqual(before);
	});

	test("an email address is the tenant's once, whatever its case", async () => {
		const busy = await busiest(northId);
		const count = () =>
			value<number>(`select count(*) from engineer where organization_id = ?`, [northId]);
		const before = await count();
		const answer = await as(north.member, () =>
			submit(createEngineer, newForm({ email: busy.email.toUpperCase() })),
		);
		expect(answer.status).toBe(400);
		expect(messages(answer)).toEqual([takenEmail]);
		expect(await count()).toBe(before);
		// Nor can another engineer take it by an edit.
		const other = await firstOf(northId);
		const edited = await as(north.member, async () =>
			submit(updateEngineer, await engineerForm(other, { email: busy.email })),
		);
		expect(messages(edited)).toEqual([takenEmail]);
	});

	test("an engineer's account is one of the tenant's members not linked to another engineer", async () => {
		const linkedTo = await rows<{ id: number; user_id: string }>(
			`select id, user_id from engineer where organization_id = ? and user_id is not null`,
			[northId],
		);
		expect(linkedTo.length).toBeGreaterThan(0);
		const free = await value<number>(
			`select min(id) from engineer where organization_id = ? and user_id is null`,
			[northId],
		);
		const account = await as(north.owner, () => data(getEngineerAccount, free));
		expect(account.canManage).toBe(true);
		const offered = new Set(account.members.map((member) => member.userId));
		for (const { user_id } of linkedTo) expect(offered.has(user_id)).toBe(false);
		const members = await rows<{ user_id: string }>(
			`select user_id from member where organization_id = ?`,
			[northId],
		);
		expect(offered).toEqual(
			new Set(
				members
					.map((row) => row.user_id)
					.filter((id) => !linkedTo.some((linked) => linked.user_id === id)),
			),
		);
		// Nor can it be linked to the account another engineer has.
		const answer = await as(north.owner, () =>
			submit(linkEngineerAccount, { id: String(free), userId: linkedTo[0].user_id }),
		);
		expect(answer.status).toBe(400);
		expect(await value(`select user_id from engineer where id = ?`, [free])).toBeNull();
	});

	test("deactivating and activating the selected engineers logs each", async () => {
		const picked = await rows<{ id: number }>(
			`select id from engineer where organization_id = ? and active = 1 order by id desc limit 2`,
			[northId],
		);
		const ids = picked.map((row) => row.id);
		expect(
			await as(north.member, () =>
				call(bulkSetEngineersActive, { target: { ids }, active: false }),
			),
		).toMatchObject({ status: 200, data: { done: 2 } });
		for (const id of ids) {
			const [logged] = await rows<{ action: string; changes: string }>(
				`select action, changes from activity where organization_id = ? and subject_type = 'engineer'
				 and subject_id = ? order by id desc limit 1`,
				[northId, String(id)],
			);
			expect(logged.action).toBe("updated");
			expect(JSON.parse(logged.changes)).toEqual({ active: [true, false] });
		}
		await as(north.member, () => call(bulkSetEngineersActive, { target: { ids }, active: true }));
		expect(await rows(`select active from engineer where id in (?, ?)`, ids)).toEqual([
			{ active: 1 },
			{ active: 1 },
		]);
	});
});

describe("South", () => {
	test("has email addresses of its own: one South has is taken, one only North has isn't", async () => {
		const own = (await snapshot(await firstOf(southId)))[0] as { email: string };
		const taken = await as(south.owner, () =>
			submit(createEngineer, newForm({ name: "Test South Engineer", email: own.email })),
		);
		expect(messages(taken)).toEqual([takenEmail]);
		const northEmail = (await busiest(northId)).email;
		const created = await as(south.owner, () =>
			submit(createEngineer, newForm({ name: "Test South Engineer", email: northEmail })),
		);
		expect(created).toMatchObject({ status: 303 });
		const id = Number(created.location!.split("/").pop());
		expect((await snapshot(id))[0]).toMatchObject({
			organization_id: southId,
			name: "Test South Engineer",
			email: northEmail,
		});
		expect((await as(south.owner, () => data(getEngineers))).map((row) => row.id)).toContain(id);
	});

	test("can't change, delete, link or (de)activate North's engineers by their ids", async () => {
		const busy = await busiest(northId);
		// A new one, without orders, who could be deleted in North.
		const added = await as(north.member, () =>
			submit(createEngineer, newForm({ email: "deletable@fieldservice.example" })),
		);
		const free = Number(added.location!.split("/").pop());
		const own = await firstOf(southId);
		const victims = [busy.id, free, own];
		const before = await Promise.all(victims.map(snapshot));
		const form = await engineerForm(own, { id: String(busy.id), hourlyRate: 1 });
		const southMember = await value<string>(
			`select user_id from member where organization_id = ? limit 1`,
			[southId],
		);
		await as(south.owner, async () => {
			expect(await submit(updateEngineer, form)).toMatchObject({ status: 404 });
			expect(await submit(deleteEngineer, { id: String(free) })).toMatchObject({ status: 404 });
			expect(
				await submit(linkEngineerAccount, { id: String(busy.id), userId: southMember }),
			).toMatchObject({ status: 404 });
			expect(await call(getEngineerAccount, busy.id)).toMatchObject({ status: 404 });
			expect(await call(setEngineerActive, { id: busy.id, active: false })).toMatchObject({
				status: 404,
			});
		});
		expect(await Promise.all(victims.map(snapshot))).toEqual(before);
	});

	test("links its engineers to South's members only", async () => {
		const own = await firstOf(southId);
		const account = await as(south.owner, () => data(getEngineerAccount, own));
		const southMembers = new Set(
			(
				await rows<{ user_id: string }>(`select user_id from member where organization_id = ?`, [
					southId,
				])
			).map((row) => row.user_id),
		);
		expect(account.members.length).toBeGreaterThan(0);
		for (const member of account.members) expect(southMembers.has(member.userId)).toBe(true);
		// North's engineer (Erik), not one of South's members.
		const erik = await value<string>(`select id from user where email = ?`, [demoUsers[2].email]);
		const answer = await as(south.owner, () =>
			submit(linkEngineerAccount, { id: String(own), userId: erik }),
		);
		expect(answer.status).toBe(400);
	});
});
