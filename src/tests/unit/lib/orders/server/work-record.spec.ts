/**
 * An order's work record (its units at their sites, the notes, the sign-off) as each audience sees
 * it, on the seeded demo database: the office all of it, with who took the sign-off; the engineer
 * their own orders' with the notes; a customer's contact only the units at their sites, the engineer
 * by first name and no notes; the printed work order the units its caller sees. An order the scope
 * doesn't reach reads as nothing. The type check (svelte-check) runs the `@ts-expect-error`s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
	customerWork,
	engineerWork,
	officeOrder,
	officeOrders,
	printedWorkOrder,
	readWorkRecord,
	readWorkRecords,
	type WorkRecord,
} from "#lib/orders/server/index.ts";
import type { CustomerAccess } from "#lib/server/auth/index.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";
import { drawn } from "#unit/signature.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

interface Order {
	id: number;
	number: string;
	customerId: number;
}

/** An order's units as stored, in their order. */
const unitsOf = (orderId: number) =>
	rows<{ serial: string; siteId: number }>(
		`select e.serial_number as serial, e.site_id as siteId from order_unit u
		 join equipment e on e.id = u.equipment_id where u.order_id = ? order by u.position`,
		[orderId],
	);

const userOf = (email: string) =>
	rows<{ id: string; name: string }>(`select id, name from user where email = ?`, [email]).then(
		([found]) => found,
	);

/** Erik's (North's field engineer's) and his full name. */
let erik: { id: number; name: string };
/**
 * An order of Erik's at a customer with units at two sites, with a unit of the other site added,
 * so its units are at both; two notes (the later written first) and a sign-off Pieter took.
 */
let job: Order;
let pieter: { id: string; name: string };

beforeAll(async () => {
	[erik] = await rows<{ id: number; name: string }>(
		`select e.id, e.name from engineer e join user u on u.id = e.user_id
		 where u.email = ? and e.organization_id = ?`,
		[north.engineer.email, northId],
	);
	[job] = await rows<Order>(
		`select o.id, o.number, o.customer_id as customerId from "order" o
		 where o.engineer_id = ? and exists (select 1 from order_unit u where u.order_id = o.id)
		 and (select count(distinct e.site_id) from equipment e where e.customer_id = o.customer_id) > 1
		 order by o.id limit 1`,
		[erik.id],
	);
	expect(job).toBeDefined();
	const [first] = await unitsOf(job.id);
	const other = await value<number>(
		`select id from equipment where customer_id = ? and site_id <> ? order by id limit 1`,
		[job.customerId, first.siteId],
	);
	await rows(
		`insert into order_unit (organization_id, order_id, customer_id, equipment_id, position)
		 values (?, ?, ?, ?, (select max(position) + 1 from order_unit where order_id = ?))`,
		[northId, job.id, job.customerId, other, job.id],
	);

	pieter = await userOf(north.member.email);
	await rows(
		`insert into order_note (organization_id, order_id, user_id, text, created_at)
		 values (?, ?, ?, 'Second', 2000000000), (?, ?, ?, 'First', 1900000000)`,
		[northId, job.id, pieter.id, northId, job.id, pieter.id],
	);
	await rows(
		`insert into order_signoff (order_id, organization_id, signer_name, signature, user_id,
		 signed_at, engineer_name, engineer_signature) values (?, ?, 'Bram de Vries', ?, ?, 2000000000, ?, ?)
		 on conflict (order_id) do update set user_id = excluded.user_id`,
		[job.id, northId, drawn, pieter.id, erik.name, drawn],
	);
});

describe("the office", () => {
	test("sees the units in their order at their sites, the notes and who took the sign-off", async () => {
		const record = await as(north.member, async () =>
			readWorkRecord(await officeOrder(job.number)),
		);
		const stored = await unitsOf(job.id);
		expect(record?.units.map((unit) => unit.serialNumber)).toEqual(stored.map((u) => u.serial));
		expect(record?.sites.map((site) => site.id)).toEqual([...new Set(stored.map((u) => u.siteId))]);
		expect(record?.notes.map((note) => [note.text, note.author])).toEqual([
			["First", pieter.name],
			["Second", pieter.name],
		]);
		expect(record?.signoff).toMatchObject({
			signerName: "Bram de Vries",
			collectedBy: pieter.name,
		});
		expect(record?.engineer).toBe(erik.name);
		// What the engineer needs on site.
		expect(record?.sites[0]).toHaveProperty("accessNotes");
		expect(record?.units[0]).toHaveProperty("warrantyUntil");
	});

	test("doesn't see another tenant's order", async () => {
		const southern = await value<string>(
			`select number from "order" o where organization_id = ?
			 and not exists (select 1 from "order" n where n.organization_id = ? and n.number = o.number)
			 limit 1`,
			[southId, northId],
		);
		expect(
			await as(north.member, async () => readWorkRecord(await officeOrder(southern))),
		).toBeUndefined();
	});
});

describe("several of the office's orders at once", () => {
	test("are each its own record, as read alone", async () => {
		const other = await value<string>(
			`select o.number from "order" o where o.organization_id = ? and o.id <> ?
			 and exists (select 1 from order_unit u where u.order_id = o.id) order by o.id limit 1`,
			[northId, job.id],
		);
		// Two orders of different one-site customers, their units taken off: each shows its own site.
		const bare = await rows<{ id: number; number: string }>(
			`select min(o.id) as id, o.number from "order" o where o.organization_id = ? and o.id <> ?
			 and (select count(*) from customer_site s where s.customer_id = o.customer_id) = 1
			 group by o.customer_id order by o.customer_id limit 2`,
			[northId, job.id],
		);
		expect(bare).toHaveLength(2);
		for (const { id } of bare) await rows(`delete from order_unit where order_id = ?`, [id]);
		const numbers = [job.number, other, ...bare.map((one) => one.number)];
		const [together, ...alone] = await as(north.member, async () =>
			Promise.all([
				readWorkRecords(await officeOrders([...numbers, "ORD-0000-00000"])),
				...numbers.map(async (number) => readWorkRecord(await officeOrder(number))),
			]),
		);
		expect([...together.keys()].toSorted()).toEqual(numbers.toSorted());
		numbers.forEach((number, i) => expect(together.get(number), number).toEqual(alone[i]));
		expect(together.get(other)?.notes).toEqual([]);
		for (const { number } of bare) expect(together.get(number)?.sites).toHaveLength(1);
	});
});

describe("the engineer", () => {
	test("sees their own order's units, sites and notes, and not who took the sign-off", async () => {
		const record = await as(north.engineer, async () =>
			readWorkRecord(await engineerWork({ number: job.number })),
		);
		const stored = await unitsOf(job.id);
		expect(record?.units.map((unit) => unit.serialNumber)).toEqual(stored.map((u) => u.serial));
		expect(record?.sites.map((site) => site.id)).toEqual([...new Set(stored.map((u) => u.siteId))]);
		expect(record?.units[0]).not.toHaveProperty("warrantyUntil");
		expect(record?.notes.map((note) => note.text)).toEqual(["First", "Second"]);
		expect(record?.signoff).not.toHaveProperty("collectedBy");
		expect(record).not.toHaveProperty("engineer");
		expect(record?.sites[0]).toHaveProperty("accessNotes");
	});

	test("doesn't see another engineer's order", async () => {
		const others = await value<string>(
			`select number from "order" where organization_id = ? and engineer_id <> ? order by id limit 1`,
			[northId, erik.id],
		);
		expect(
			await as(north.engineer, async () => readWorkRecord(await engineerWork({ number: others }))),
		).toBeUndefined();
	});
});

describe("a customer's contact", () => {
	/** A contact of the job's customer who sees only the site of its first unit. */
	const limited = async (): Promise<CustomerAccess> => {
		const [first] = await unitsOf(job.id);
		return {
			contactId: 0,
			customer: { id: job.customerId, code: "", name: "" },
			siteIds: [first.siteId],
		};
	};

	test("sees only the units at their sites and those sites, the engineer by first name, no notes", async () => {
		const access = await limited();
		const record = await as(north.customer, async () =>
			readWorkRecord(await customerWork(access, job.number)),
		);
		const theirs = (await unitsOf(job.id)).filter((unit) => access.siteIds?.includes(unit.siteId));
		expect(record?.units.map((unit) => unit.serialNumber)).toEqual(theirs.map((u) => u.serial));
		expect(record?.sites.map((site) => site.id)).toEqual(access.siteIds);
		expect(record?.engineer).toBe(erik.name.split(" ")[0]);
		expect(record).not.toHaveProperty("notes");
		expect(record?.signoff).not.toHaveProperty("collectedBy");
		// The site's address, not what the engineer needs on it.
		expect(record?.sites[0]).not.toHaveProperty("accessNotes");
		expect(record?.sites[0]).toHaveProperty("address");
		expect(record?.units[0]).not.toHaveProperty("warrantyUntil");
	});

	test("doesn't see another customer's order", async () => {
		const access = await limited();
		const others = await value<string>(
			`select number from "order" where organization_id = ? and customer_id <> ? order by id limit 1`,
			[northId, job.customerId],
		);
		expect(
			await as(north.customer, async () =>
				readWorkRecord(await customerWork({ ...access, siteIds: null }, others)),
			),
		).toBeUndefined();
	});
});

describe("the printed work order", () => {
	/** An order of a customer with `sites` sites, its units taken off. */
	async function unitless(sites: number) {
		const [found] = await rows<Order>(
			`select o.id, o.number, o.customer_id as customerId from "order" o where o.organization_id = ?
			 and (select count(*) from customer_site s where s.customer_id = o.customer_id) = ?
			 and o.id <> ? order by o.id limit 1`,
			[northId, sites, job.id],
		);
		await rows(`delete from order_unit where order_id = ?`, [found.id]);
		return found;
	}

	/** The printed work order of `number` as `actor` has it. */
	const printed = (actor: Actor, number: string, access?: CustomerAccess) =>
		as(actor, async () =>
			readWorkRecord(
				await printedWorkOrder(
					number,
					access ? { audience: "customer", access } : { audience: "office", manager: false },
				),
			),
		);

	test("shows a customer's contact the units at their sites' addresses, and the engineer in full", async () => {
		const [first] = await unitsOf(job.id);
		await rows(`update "order" set status = 'completed' where id = ?`, [job.id]);
		const record = await printed(north.customer, job.number, {
			contactId: 0,
			customer: { id: job.customerId, code: "", name: "" },
			siteIds: [first.siteId],
		});
		const there = (await unitsOf(job.id)).filter((unit) => unit.siteId === first.siteId);
		expect(record?.units.map((unit) => unit.serialNumber)).toEqual(there.map((u) => u.serial));
		expect(there.length).toBeLessThan((await unitsOf(job.id)).length);
		expect(record?.units[0]).not.toHaveProperty("warrantyUntil");
		expect(record?.engineer).toBe(erik.name);
		expect(record).not.toHaveProperty("notes");
		expect(record?.sites[0]).not.toHaveProperty("accessNotes");
	});

	test("shows a customer's contact only done orders, the office any", async () => {
		const access: CustomerAccess = {
			contactId: 0,
			customer: { id: job.customerId, code: "", name: "" },
			siteIds: null,
		};
		await rows(`update "order" set status = 'in_progress' where id = ?`, [job.id]);
		expect(await printed(north.customer, job.number, access)).toBeUndefined();
		expect(await printed(north.member, job.number)).toBeDefined();
		await rows(`update "order" set status = 'invoiced' where id = ?`, [job.id]);
		expect(await printed(north.customer, job.number, access)).toBeDefined();
	});

	test("of an order without units, shows the customer's site only when it has one", async () => {
		const [single, double] = [await unitless(1), await unitless(2)];
		const site = await value<number>(`select id from customer_site where customer_id = ?`, [
			single.customerId,
		]);
		const sitesOf = (number: string) => printed(north.member, number);
		expect((await sitesOf(single.number))?.sites.map((each) => each.id)).toEqual([site]);
		expect((await sitesOf(double.number))?.sites).toEqual([]);
	});
});

test("an audience's record has only the keys its table allows", () => {
	const types = [
		(record: WorkRecord<"customer">) =>
			// @ts-expect-error customers don't see the notes
			record.notes,
		(record: WorkRecord<"customer">) =>
			// @ts-expect-error nor who in the office took the sign-off
			record.signoff?.collectedBy,
		(record: WorkRecord<"engineer">) =>
			// @ts-expect-error nor does the engineer
			record.signoff?.collectedBy,
		(record: WorkRecord<"engineer">) =>
			// @ts-expect-error the engineer is them
			record.engineer,
		(record: WorkRecord<"customer">) =>
			// @ts-expect-error nor the units' warranty
			record.units[0].warrantyUntil,
		(record: WorkRecord<"office">) => [
			record.notes,
			record.signoff?.collectedBy,
			record.engineer,
			record.units[0].warrantyUntil,
		],
	];
	// Only the type check tells them apart.
	expect(types.every((each) => typeof each === "function")).toBe(true);
});
