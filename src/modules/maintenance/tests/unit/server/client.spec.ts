/**
 * A unit's last maintenance as a customer's contact reads it in the customer portal (the fact on
 * the unit's page, `client.unit.facts`), on the seeded demo database: the latest done maintenance
 * or inspection order on it of the orders they see, its number and day only. Another customer's unit (Weggemans' for Riedel's contact),
 * another tenant's and one at a site the contact doesn't see are a 404, also by a tampered serial
 * number; a tenant without the module (South) and the office are refused.
 */
import { describe, expect, test } from "vite-plus/test";

import { getClientLastMaintenance } from "#modules/maintenance/client/client-maintenance.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	south,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";
import { expectSiteLimited } from "#unit/lib/server/site-limited.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
/** Riedel's facilities contact (all of Riedel's sites). */
const riedel = shltr.customer;
const weggemans = demoAccount("rob@weggemans.example");

/** A unit of the customer `name`'s with done maintenance or inspection orders, its serial and id. */
const maintainedUnitOf = async (name: string) =>
	(
		await rows<{ id: number; serial: string; customerId: number }>(
			`select e.id, e.serial_number as serial, e.customer_id as customerId from equipment e
			 join customer c on c.id = e.customer_id
			 where c.name = ? and (select count(*) from order_unit u join "order" o on o.id = u.order_id
				where u.equipment_id = e.id and o.customer_id = e.customer_id
				and o.status in ('completed', 'invoiced') and o.type in ('maintenance', 'inspection')) > 1
			 order by e.id limit 1`,
			[name],
		)
	)[0];

/** The unit's latest done maintenance or inspection order of the customer's, as stored. */
const latestOf = async (unitId: number, customerId: number) =>
	(
		await rows<{ number: string }>(
			`select o.number from order_unit u join "order" o on o.id = u.order_id
			 where u.equipment_id = ? and o.customer_id = ?
			 and o.status in ('completed', 'invoiced') and o.type in ('maintenance', 'inspection')
			 order by o.completed_at desc, o.id desc limit 1`,
			[unitId, customerId],
		)
	)[0];

/** The serial number of the first unit of a tenant, or of a customer of it other than `not`. */
const serialIn = (organization: string, not = 0) =>
	value<string>(
		`select serial_number from equipment where organization_id = ? and customer_id <> ?
		 order by id limit 1`,
		[organization, not],
	);

describe("a unit's last maintenance in the customer portal", () => {
	test("is its latest done maintenance or inspection order, by number and day only", async () => {
		const unit = await maintainedUnitOf("Riedel B.V.");
		expect(unit, "Riedel has a unit maintained more than once").toBeDefined();
		const answer = await as(riedel, () => data(getClientLastMaintenance, unit.serial));
		expect(answer.unitId).toBe(unit.id);
		expect(answer.last?.number).toBe((await latestOf(unit.id, unit.customerId)).number);
		// Nothing a customer shouldn't see: no plans, intervals, prices or notes.
		expect(Object.keys(answer).toSorted()).toEqual(["last", "unitId"]);
		expect(Object.keys(answer.last ?? {}).toSorted()).toEqual(["completedAt", "number"]);
	});

	test("is nothing yet for a unit never maintained", async () => {
		const serial = await value<string>(
			`select e.serial_number from equipment e join customer c on c.id = e.customer_id
			 where c.name = 'Riedel B.V.' and not exists (select 1 from order_unit u
				join "order" o on o.id = u.order_id where u.equipment_id = e.id
				and o.status in ('completed', 'invoiced') and o.type in ('maintenance', 'inspection'))
			 order by e.id limit 1`,
		);
		expect(serial, "Riedel has a unit never maintained").toBeDefined();
		expect((await as(riedel, () => data(getClientLastMaintenance, serial))).last).toBeNull();
	});

	test("of another customer's unit or another tenant's is a 404, by a tampered serial too", async () => {
		const own = await maintainedUnitOf("Riedel B.V.");
		const theirs = await maintainedUnitOf("Weggemans Logistiek");
		await as(riedel, async () => {
			expect(await call(getClientLastMaintenance, theirs.serial)).toMatchObject({ status: 404 });
			expect(await call(getClientLastMaintenance, await serialIn(northId))).toMatchObject({
				status: 404,
			});
		});
		// Weggemans' contact the other way round.
		await as(weggemans, async () => {
			expect(await call(getClientLastMaintenance, own.serial)).toMatchObject({ status: 404 });
			expect(await call(getClientLastMaintenance, theirs.serial)).toMatchObject({ status: 200 });
		});
		// North's contact: none of SHLTR's, nor another North customer's.
		const northern = await value<number>(
			`select id from customer where organization_id = ? order by id limit 1`,
			[northId],
		);
		await as(north.customer, async () => {
			expect(await call(getClientLastMaintenance, own.serial)).toMatchObject({ status: 404 });
			expect(await call(getClientLastMaintenance, await serialIn(northId, northern))).toMatchObject(
				{ status: 404 },
			);
		});
	});

	test("is refused to South (no module), to a tenant that switched it off and to the office", async () => {
		const own = await maintainedUnitOf("Riedel B.V.");
		await as(south.customer, async () => {
			expect(await call(getClientLastMaintenance, await serialIn(southId))).toMatchObject({
				status: 404,
			});
		});
		await withoutModule("shltr", "maintenance", () =>
			as(riedel, async () => {
				expect(await call(getClientLastMaintenance, own.serial)).toMatchObject({ status: 404 });
			}),
		);
		const office = await as(shltr.member, () => call(getClientLastMaintenance, own.serial));
		expect(office.status).not.toBe(200);
	});

	test("of a unit at a site a site-limited contact doesn't see is a 404", async () => {
		await expectSiteLimited((serial) => as(riedel, () => call(getClientLastMaintenance, serial)));
	});
});
