/**
 * The checklists on orders as the office reads them, on the seeded demo database: an order's (a
 * checklist per unit, in the units' order, each with its points and what was found), its work
 * order with the sign-off's names and signatures, a unit's inspection status and history, and the
 * equipment list's inspection column, filtered and sorted in the database; and North never reading
 * SHLTR's, also by a tampered number or serial. The server side of `checklists.office.test.ts`
 * and `checklists.tenancy.test.ts`, which keep the pages.
 */
import { describe, expect, test } from "vite-plus/test";

import { getEquipmentList } from "#lib/equipment/list/equipment-list.remote.ts";
import { equipmentList } from "#lib/equipment/list/equipment-list.ts";
import {
	getOrderChecklists,
	getUnitChecklists,
	getWorkOrder,
} from "#modules/checklists/checklists.remote.ts";
import { EXPIRING_DAYS } from "#modules/checklists/model.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	shltr,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

/** Today, as the database has days, in the seed's (and the visitors') time zone. */
const today = Temporal.Now.plainDateISO("Europe/Amsterdam");

/** An order's checklists as stored, in its units' order. */
const checklistsOfOrder = (orderId: number) =>
	rows<{ id: number; serial_number: string; remarks: string | null }>(
		`select c.id, e.serial_number, c.remarks from checklist c join equipment e on e.id = c.equipment_id
		 join order_unit u on u.order_id = c.order_id and u.equipment_id = c.equipment_id
		 where c.order_id = ? order by u.position`,
		[orderId],
	);

/** A checklist's points as stored, in their order. */
const resultsOf = (checklistId: number) =>
	rows<{
		id: number;
		group_name: string;
		text: string;
		result: string | null;
		remark: string | null;
	}>(
		`select id, group_name, text, result, remark from checklist_result where checklist_id = ?
		 order by position`,
		[checklistId],
	);

/**
 * Each of an organization's units' inspection status today, worked out in SQL apart from the app's:
 * by its latest completed inspection.
 */
const inspectionStatuses = (organization: string) =>
	rows<{ serial_number: string; status: string }>(
		`select e.serial_number, coalesce((
			select case when c.valid_until < ? then 'expired'
				when exists (select 1 from checklist_result r where r.checklist_id = c.id and r.result = 'nok')
					then 'rejected'
				when c.valid_until <= ? then 'expiring' else 'valid' end
			from checklist c where c.equipment_id = e.id and c.kind = 'inspection'
				and c.status = 'completed' and c.valid_until is not null
			order by c.completed_at desc, c.id desc limit 1), 'none') as status
		 from equipment e where e.organization_id = ? order by e.id`,
		[today.toString(), today.add({ days: EXPIRING_DAYS }).toString(), organization],
	);

/** SHLTR's done inspection with rejected points that has the most checklists. */
const doneInspection = async () =>
	(
		await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.organization_id = ? and o.type = 'inspection'
			 and exists (select 1 from checklist c join checklist_result r on r.checklist_id = c.id
				where c.order_id = o.id and r.result = 'nok')
			 order by (select count(*) from checklist c where c.order_id = o.id) desc, o.id limit 1`,
			[shltrId],
		)
	)[0];

/** The equipment list's query with the inspection column's `filter` and `sort`. */
const equipmentQuery = (filter: string[] | null, sort?: { desc: boolean }) =>
	({
		q: "",
		filters: filter ? { "checklists.inspection": filter } : {},
		sort: sort ? [{ id: "checklists.inspection", ...sort }] : [],
		group: null,
		pageIndex: 0,
		pageSize: equipmentList.pageSize,
	}) as unknown as Parameters<typeof getEquipmentList>[0];

describe("a done inspection with rejected points, in SHLTR's office", () => {
	test("its order has a checklist per unit, in the units' order, with what each found", async () => {
		const order = await doneInspection();
		const { checklists } = await as(shltr.member, () => data(getOrderChecklists, order.number));
		const stored = await checklistsOfOrder(order.id);
		expect(stored.length).toBeGreaterThan(1);
		expect(checklists.map((checklist) => checklist.unit.serialNumber)).toEqual(
			stored.map((checklist) => checklist.serial_number),
		);
		for (const [i, checklist] of checklists.entries()) {
			expect(checklist.remarks).toBe(stored[i].remarks);
			const points = await resultsOf(stored[i].id);
			expect(
				checklist.results.map(({ text, result, remark }) => ({ text, result, remark })),
			).toEqual(points.map(({ text, result, remark }) => ({ text, result, remark })));
		}
		expect(checklists.some((checklist) => checklist.results.some((p) => p.result === "nok"))).toBe(
			true,
		);
	});

	test("its work order has the order, every checklist with its points in order, and both signatures", async () => {
		const order = await doneInspection();
		const workOrder = await as(shltr.member, () => data(getWorkOrder, order.number));
		const stored = await checklistsOfOrder(order.id);
		expect(workOrder.order).toMatchObject({ number: order.number, type: "inspection" });
		expect(workOrder.organization).toBe("SHLTR");
		expect(workOrder.checklists.map((checklist) => checklist.unit.serialNumber)).toEqual(
			stored.map((checklist) => checklist.serial_number),
		);
		expect(workOrder.units.map((unit) => unit.serialNumber)).toEqual(
			expect.arrayContaining(stored.map((checklist) => checklist.serial_number)),
		);
		expect(workOrder.sites.length).toBeGreaterThan(0);
		const [first] = workOrder.checklists;
		expect(first.results.map((point) => point.text)).toEqual(
			(await resultsOf(stored[0].id)).map((point) => point.text),
		);
		// The seed signs SHLTR's done work off by the engineer and the customer's contact.
		const [signoff] = await rows<{ signer_name: string; engineer_name: string }>(
			`select signer_name, engineer_name from order_signoff where order_id = ?`,
			[order.id],
		);
		expect(workOrder.signoff).toMatchObject({
			signerName: signoff.signer_name,
			engineerName: signoff.engineer_name,
			signature: expect.stringMatching(/^data:image\//),
			engineerSignature: expect.stringMatching(/^data:image\//),
		});
	});

	test("an order without checklists has none, and an unknown order is a 404", async () => {
		const number = await value<string>(
			`select o.number from "order" o where o.organization_id = ?
			 and not exists (select 1 from checklist c where c.order_id = o.id) order by o.id limit 1`,
			[shltrId],
		);
		await as(shltr.member, async () => {
			expect(await data(getOrderChecklists, number)).toMatchObject({ checklists: [] });
			expect(await call(getOrderChecklists, "ORD-99999")).toMatchObject({ status: 404 });
			expect(await call(getWorkOrder, "ORD-99999")).toMatchObject({ status: 404 });
		});
	});
});

describe("a unit's inspections", () => {
	test("its status is its latest inspection's, and its history every checklist of it", async () => {
		const all = await inspectionStatuses(shltrId);
		for (const status of ["rejected", "expired", "valid", "none"]) {
			const unit = all.find((each) => each.status === status);
			expect(unit, status).toBeDefined();
			const shown = await as(shltr.member, () => data(getUnitChecklists, unit!.serial_number));
			expect(shown.status, unit!.serial_number).toBe(status);
			const history = Number(
				await value(
					`select count(*) from checklist c join equipment e on e.id = c.equipment_id
					 where e.serial_number = ? and e.organization_id = ?`,
					[unit!.serial_number, shltrId],
				),
			);
			expect(shown.checklists).toHaveLength(history);
		}
	});

	test("the equipment list filters by it in the database, and sorts it worst first", async () => {
		const all = await inspectionStatuses(shltrId);
		await as(shltr.member, async () => {
			for (const status of ["valid", "expiring", "expired", "rejected", "none"]) {
				const count = all.filter((each) => each.status === status).length;
				expect(count, status).toBeGreaterThan(0);
				const { rows: shown, rowCount } = await data(getEquipmentList, equipmentQuery([status]));
				expect(rowCount, status).toBe(count);
				for (const row of shown) {
					const value = row.moduleValues["checklists.inspection"] as { status: string } | null;
					expect(value?.status ?? "none", row.serialNumber).toBe(status);
				}
			}
			const { rows: sorted } = await data(getEquipmentList, equipmentQuery(null, { desc: false }));
			const order = ["expired", "rejected", "expiring", "valid", "none"];
			const ranks = sorted.map((row) =>
				order.indexOf(
					(row.moduleValues["checklists.inspection"] as { status: string } | null)?.status ??
						"none",
				),
			);
			expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
			expect(ranks[0]).toBe(0);
		});
	});
});

describe("SHLTR's checklists, to North", () => {
	test("are a 404 by the number of an order or the serial number of a unit of SHLTR's", async () => {
		const number = await value<string>(
			`select o.number from "order" o where o.organization_id = ?
			 and exists (select 1 from checklist c where c.order_id = o.id)
			 and o.number not in (select number from "order" where organization_id = ?)
			 order by o.id limit 1`,
			[shltrId, northId],
		);
		const serial = await value<string>(
			`select e.serial_number from equipment e where e.organization_id = ?
			 and exists (select 1 from checklist c where c.equipment_id = e.id)
			 and e.serial_number not in (select serial_number from equipment where organization_id = ?)
			 order by e.id limit 1`,
			[shltrId, northId],
		);
		await as(north.owner, async () => {
			expect(await call(getOrderChecklists, number)).toMatchObject({ status: 404 });
			expect(await call(getWorkOrder, number)).toMatchObject({ status: 404 });
			expect(await call(getUnitChecklists, serial)).toMatchObject({ status: 404 });
		});
	});
});

describe("the work order of an order without units", () => {
	// Which site it shows is the work record's rule (`work-record.spec.ts`); this is its wiring.
	test("prints the site of a customer with just one", async () => {
		const [found] = await rows<{ number: string; customerId: number }>(
			`select o.number, o.customer_id as customerId from "order" o where o.organization_id = ?
			 and not exists (select 1 from checklist c where c.order_id = o.id)
			 and (select count(*) from customer_site s where s.customer_id = o.customer_id) = 1
			 order by o.id limit 1`,
			[shltrId],
		);
		expect(found).toBeDefined();
		await rows(
			`delete from order_unit where order_id = (select id from "order" where number = ? and organization_id = ?)`,
			[found.number, shltrId],
		);
		const site = await value<number>(`select id from customer_site where customer_id = ?`, [
			found.customerId,
		]);
		const printed = await as(shltr.member, () => data(getWorkOrder, found.number));
		expect(printed.sites.map((each) => each.id)).toEqual([site]);
	});
});
