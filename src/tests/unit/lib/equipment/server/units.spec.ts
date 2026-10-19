/**
 * What the equipment form's and a unit's page's remote functions check and refuse on the seeded
 * demo database: in North, a serial number the tenant has (in any case), a warranty that ends
 * before the installation, deleting or moving a unit with orders; in South, North's customers,
 * sites, categories, units, locations and label sheets, also by their ids, while a serial number
 * only North has is South's to use. The server side of `src/tests/e2e/equipment.test.ts`,
 * `equipment.detail.test.ts`, `equipment.tenancy.test.ts` and `equipment.locations.test.ts`, which
 * keep the forms, North's unit a 404 and the tampered edit form.
 */
import { describe, expect, test } from "vite-plus/test";

import { getServiceHistory } from "#lib/equipment/detail/service-history.remote.ts";
import {
	createEquipment,
	deleteEquipment,
	getEquipment,
	updateEquipment,
} from "#lib/equipment/equipment.remote.ts";
import { getLabelSheet } from "#lib/equipment/labels/labels.remote.ts";
import { getLocation } from "#lib/equipment/locations/locations.remote.ts";
import { batchQueryTests } from "#unit/lib/server/batch-query.test-support.ts";
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

const unit = (id: number) => rows(`select * from equipment where id = ?`, [id]);
const unitId = (serial: string, organization: string) =>
	value<number>(`select id from equipment where serial_number = ? and organization_id = ?`, [
		serial,
		organization,
	]);
const countIn = async (organization: string) =>
	Number(await value(`select count(*) from equipment where organization_id = ?`, [organization]));

/** An organization's unit with the most orders. */
async function busiest(organization: string) {
	const [found] = await rows<{ id: number; serial: string; orders: number }>(
		`select e.id, e.serial_number as serial, count(*) as orders from equipment e
		 join order_unit ou on ou.equipment_id = e.id where e.organization_id = ?
		 group by e.id order by count(*) desc, e.id limit 1`,
		[organization],
	);
	return found;
}

/** A North unit without orders (so an unscoped delete would remove it) whose serial South lacks. */
async function northOnly() {
	const [found] = await rows<{ id: number; serial: string }>(
		`select id, serial_number as serial from equipment e where organization_id = ?
		 and not exists (select 1 from order_unit ou where ou.equipment_id = e.id)
		 and serial_number not in (select serial_number from equipment where organization_id = ?)
		 order by id limit 1`,
		[northId, southId],
	);
	return found;
}

/** The edit form of `actor`'s unit `serial` as the page fills it, with `changes`. */
async function editForm(actor: Actor, serial: string, changes: Record<string, unknown> = {}) {
	const { unit: found } = await as(actor, () => data(getEquipment, serial));
	return {
		id: String(found.id),
		serialNumber: found.serialNumber,
		manufacturer: found.manufacturer,
		model: found.model,
		categoryId: String(found.categoryId),
		status: found.status,
		name: found.name ?? "",
		customerId: String(found.customerId),
		siteId: String(found.siteId),
		locationId: found.locationId ? String(found.locationId) : "",
		installedAt: found.installedAt.toString(),
		warrantyUntil: found.warrantyUntil.toString(),
		...changes,
	};
}

/** A new unit's form of an organization's first customer, at its first site, with `changes`. */
async function newForm(organization: string, changes: Record<string, unknown> = {}) {
	const [first] = await rows<{ customer: number; site: number; category: number }>(
		`select c.id as customer, (select min(s.id) from customer_site s where s.customer_id = c.id)
		 as site, (select min(k.id) from equipment_category k where k.organization_id = c.organization_id)
		 as category from customer c where c.organization_id = ? order by c.id limit 1`,
		[organization],
	);
	return {
		serialNumber: "ZZ-SPEC-0001",
		manufacturer: "Testco",
		model: "TX-S",
		categoryId: String(first.category),
		status: "operational",
		name: "",
		customerId: String(first.customer),
		siteId: String(first.site),
		locationId: "",
		installedAt: "2026-01-10",
		warrantyUntil: "2029-01-10",
		...changes,
	};
}

const messages = (answer: { issues?: { message: string }[] }) =>
	answer.issues?.map((issue) => issue.message) ?? [];

describe("in North", () => {
	test("a new unit's serial number is the tenant's once, in any case, and its warranty ends after it's installed", async () => {
		const before = await countIn(northId);
		const { serial: taken } = await busiest(northId);
		const answer = await as(north.member, async () =>
			submit(
				createEquipment,
				await newForm(northId, { serialNumber: taken.toLowerCase(), warrantyUntil: "2025-01-10" }),
			),
		);
		expect(answer.status).toBe(400);
		expect(messages(answer)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("already has this serial"),
				expect.stringContaining("can't end before"),
			]),
		);
		expect(await countIn(northId)).toBe(before);
	});

	test("a unit with orders can't be deleted", async () => {
		const busy = await busiest(northId);
		const answer = await as(north.member, () => submit(deleteEquipment, { id: String(busy.id) }));
		expect(answer.status).toBe(400);
		expect(messages(answer)).toContainEqual(
			expect.stringContaining(`${busy.orders} orders refer to it`),
		);
		expect(await unitId(busy.serial, northId)).toBe(busy.id);
	});

	test("a unit with orders can't be moved to another customer", async () => {
		const busy = await busiest(northId);
		const before = await unit(busy.id);
		const [other] = await rows<{ customer: number; site: number }>(
			`select c.id as customer, min(s.id) as site from customer c join customer_site s
			 on s.customer_id = c.id where c.organization_id = ? and c.id != ? group by c.id limit 1`,
			[northId, before[0].customer_id as number],
		);
		const answer = await as(north.member, async () =>
			submit(
				updateEquipment,
				await editForm(north.member, busy.serial, {
					customerId: String(other.customer),
					siteId: String(other.site),
					locationId: "",
				}),
			),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(
			expect.objectContaining({
				name: "customerId",
				message: expect.stringContaining("Can't move this unit"),
			}),
		);
		expect(await unit(busy.id)).toEqual(before);
	});

	test("a location's page and labels list its units as they're named, else by make", async () => {
		const [location] = await rows<{ id: number; site: number }>(
			`select l.id, l.site_id as site from equipment_location l
			 join equipment e on e.location_id = l.id where l.organization_id = ?
			 group by l.id having count(*) > 1 order by l.id limit 1`,
			[northId],
		);
		// The seeded units have no names: name the last by make, in lower case, so it comes first
		// (unnamed units came first before).
		const [last] = await rows<{ id: number }>(
			`select id from equipment where location_id = ? order by manufacturer desc, id desc limit 1`,
			[location.id],
		);
		await rows(`update equipment set name = 'aaa Hal' where id = ?`, [last.id]);
		await as(north.member, async () => {
			const page = await data(getLocation, String(location.id) as never);
			expect(page.units[0]).toMatchObject({ id: last.id, name: "aaa Hal" });
			const sheet = await data(getLabelSheet, {
				site: String(location.site),
				location: String(location.id),
			} as never);
			expect(sheet.units.map((u) => u.id)).toEqual(page.units.map((u) => u.id));
		});
	});

	test("a unit's label at its location is its own, and a 404 at another", async () => {
		const [placed] = await rows<{ serial: string; site: number; location: number }>(
			`select serial_number as serial, site_id as site, location_id as location from equipment
			 where organization_id = ? and location_id is not null order by id limit 1`,
			[northId],
		);
		const other = await value<number>(
			`select min(id) from equipment_location where organization_id = ? and id != ?`,
			[northId, placed.location],
		);
		const sheet = (location: number) =>
			call(getLabelSheet, {
				site: String(placed.site),
				location: String(location),
				unit: placed.serial,
			} as never);
		await as(north.member, async () => {
			expect(await sheet(placed.location)).toMatchObject({
				status: 200,
				data: { locations: [], units: [{ serialNumber: placed.serial }] },
			});
			expect(await sheet(other)).toMatchObject({ status: 404 });
		});
	});
});

describe("in South", () => {
	test("North's unit's history is a 404", async () => {
		const { serial } = await northOnly();
		expect(await as(south.owner, () => call(getServiceHistory, serial))).toMatchObject({
			status: 404,
		});
		const busy = await busiest(northId);
		expect(await unitId(busy.serial, southId)).toBeUndefined();
		expect(await as(south.owner, () => call(getServiceHistory, busy.serial))).toMatchObject({
			status: 404,
		});
	});

	test("deleting with the id of a North unit is refused", async () => {
		const target = await northOnly();
		const before = await unit(target.id);
		expect(before).toHaveLength(1);
		expect(
			await as(south.owner, () => submit(deleteEquipment, { id: String(target.id) })),
		).toMatchObject({ status: 404 });
		expect(await unit(target.id)).toEqual(before);
	});

	test("a North customer, site and category, and a serial number South has, are refused", async () => {
		const before = await countIn(southId);
		const own = await busiest(southId);
		const northCustomer = await value<number>(
			`select min(id) from customer where organization_id = ?`,
			[northId],
		);
		const northSite = await value<number>(
			`select min(id) from customer_site where customer_id = ?`,
			[northCustomer],
		);
		const northCategory = await value<number>(
			`select min(id) from equipment_category where organization_id = ?`,
			[northId],
		);
		const answer = await as(south.owner, async () =>
			submit(
				createEquipment,
				await newForm(southId, {
					customerId: String(northCustomer),
					siteId: String(northSite),
					categoryId: String(northCategory),
					serialNumber: own.serial,
				}),
			),
		);
		expect(answer.status).toBe(400);
		expect(messages(answer)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Unknown customer"),
				expect.stringContaining("already has this serial"),
				"Choose one of your organization's categories",
			]),
		);
		expect(await countIn(southId)).toBe(before);
	});

	test("a serial number only North has is South's to use; deleting South's leaves North's", async () => {
		const busy = await busiest(northId);
		expect(await unitId(busy.serial, southId)).toBeUndefined();
		const created = await as(south.owner, async () =>
			submit(createEquipment, await newForm(southId, { serialNumber: busy.serial.toLowerCase() })),
		);
		expect(created).toMatchObject({ status: 303, location: `/equipment/${busy.serial}` });
		expect(
			await rows(
				`select e.organization_id as unit, c.organization_id as customer, e.model from equipment e
				 join customer c on c.id = e.customer_id where e.serial_number = ? order by e.organization_id`,
				[busy.serial],
			),
		).toEqual([
			{ unit: northId, customer: northId, model: expect.not.stringMatching("TX-S") },
			{ unit: southId, customer: southId, model: "TX-S" },
		]);

		// The serial number shows South's unit, with no orders.
		const shown = await as(south.owner, () => data(getEquipment, busy.serial));
		expect(shown).toMatchObject({
			unit: { model: "TX-S", organizationId: southId },
			orderCount: 0,
		});
		const { events } = await as(south.owner, () => data(getServiceHistory, busy.serial));
		expect(events.map((event) => event.kind)).toEqual(["warranty", "installation"]);

		const own = await unitId(busy.serial, southId);
		expect(await as(south.owner, () => submit(deleteEquipment, { id: String(own) }))).toMatchObject(
			{
				status: 303,
				location: "/equipment",
			},
		);
		expect(await unitId(busy.serial, southId)).toBeUndefined();
		expect(await unitId(busy.serial, northId)).toBe(busy.id);
		expect(
			Number(await value(`select count(*) from order_unit where equipment_id = ?`, [busy.id])),
		).toBe(busy.orders);
	});

	test("a unit can't be put at a North site, nor at another customer's", async () => {
		const own = await busiest(southId);
		const before = await unit(own.id);
		const owner = before[0].customer_id as number;
		const northSite = await value<number>(
			`select min(id) from customer_site where organization_id = ?`,
			[northId],
		);
		const otherCustomers = await value<number>(
			`select min(id) from customer_site where organization_id = ? and customer_id != ?`,
			[southId, owner],
		);
		for (const site of [northSite, otherCustomers]) {
			const answer = await as(south.owner, async () =>
				submit(
					updateEquipment,
					await editForm(south.owner, own.serial, { siteId: String(site), locationId: "" }),
				),
			);
			expect(answer.status).toBe(400);
			expect(answer.issues).toContainEqual(
				expect.objectContaining({ name: "siteId", message: "Choose one of the customer's sites" }),
			);
			expect(await unit(own.id)).toEqual(before);
		}
	});

	test("North's locations and label sheets are a 404", async () => {
		const [target] = await rows<{ id: number; site: number }>(
			`select id, site_id as site from equipment_location where organization_id = ?
			 order by id limit 1`,
			[northId],
		);
		await as(south.owner, async () => {
			// Ids as the page's URL has them.
			expect(await call(getLocation, String(target.id) as never)).toMatchObject({ status: 404 });
			expect(await call(getLabelSheet, { site: String(target.site) } as never)).toMatchObject({
				status: 404,
			});
		});
		// North's own.
		await as(north.member, async () => {
			expect(await call(getLocation, String(target.id) as never)).toMatchObject({ status: 200 });
			expect(await call(getLabelSheet, { site: String(target.site) } as never)).toMatchObject({
				status: 200,
			});
		});
	});
});

describe("getEquipment, the unit's page's and hover card's batch query", () => {
	batchQueryTests({
		query: getEquipment,
		table: "equipment",
		column: "serial_number",
		keyOf: (answer) => answer.unit.serialNumber,
	});

	test("it counts the unit's orders, and says when it was last serviced", async () => {
		const [serviced] = await rows<{ serial: string; orders: number; last: number }>(
			`select e.serial_number as serial, count(*) as orders,
			 max(case when o.status in ('completed', 'invoiced') then o.completed_at end) as last
			 from equipment e join order_unit ou on ou.equipment_id = e.id
			 join "order" o on o.id = ou.order_id
			 where e.organization_id = ? group by e.id having last is not null
			 order by orders desc limit 1`,
			[organizationId("north")],
		);
		const found = await as(north.member, () => data(getEquipment, serviced.serial));
		expect(found.orderCount).toBe(serviced.orders);
		expect(found.lastService?.epochMilliseconds).toBe(serviced.last * 1000);
	});
});
