/**
 * The docks card on a customer's page (`docks.remote.ts`) on the seeded demo database: Weggemans'
 * docks, and a manager adding, editing and deleting one (logged against the customer), refused a
 * code another dock has, a unit or location at another site, another customer's dock and a
 * planner. The server side of `docks.test.ts`, which keeps the card.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	deleteCustomerDock,
	getCustomerDocks,
	saveCustomerDock,
} from "#modules/docks/docks.remote.ts";
import {
	as,
	data,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

/** One of SHLTR's customers by name, with its first site. */
const customerNamed = async (name: string) =>
	(
		await rows<{ id: number; code: string; site: number }>(
			`select c.id, c.code, min(s.id) as site from customer c
			 join customer_site s on s.customer_id = c.id
			 where c.organization_id = ? and c.name = ? group by c.id`,
			[shltrId, name],
		)
	)[0];

/** A dock of SHLTR's as stored, by code. */
const dockNamed = async (code: string) =>
	(
		await rows<{ id: number; position: string; scp_code: string | null; site_id: number }>(
			`select id, position, scp_code, site_id from dock_position where organization_id = ? and code = ?`,
			[shltrId, code],
		)
	)[0];

/** A dock's log, oldest first. */
const logOf = (id: number) =>
	rows<{ action: string; parent_type: string; parent_label: string }>(
		`select action, parent_type, parent_label from activity where organization_id = ?
		 and subject_type = 'dock' and subject_id = ? order by id`,
		[shltrId, String(id)],
	);

/** The dock form, as the card's dialog sends it. */
const dockForm = (customer: string, siteId: number, fields: Record<string, string> = {}) => ({
	customer,
	dockId: "",
	siteId: String(siteId),
	code: "DOCK 09",
	position: "P-09 · Expeditie oost",
	locationId: "",
	doorId: "",
	levellerId: "",
	scpCode: "SCP-09",
	keyId: "",
	keyStorageUnit: "",
	...fields,
});

describe("Weggemans' docks", () => {
	test("are on its page, which a manager may manage and a planner may not", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const asPlanner = await as(shltr.member, () => data(getCustomerDocks, weggemans.code));
		expect(asPlanner.canManage).toBe(false);
		const stored = await value<number>(
			`select count(*) from dock_position d join customer_site s on s.id = d.site_id
			 where s.customer_id = ?`,
			[weggemans.id],
		);
		expect(stored).toBe(8);
		expect(JSON.stringify(asPlanner)).toContain("DOCK 05");
		expect((await as(shltr.owner, () => data(getCustomerDocks, weggemans.code))).canManage).toBe(
			true,
		);
	});

	test("a manager adds one; logged against the customer", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const answer = await as(shltr.owner, () =>
			submit(saveCustomerDock, dockForm(weggemans.code, weggemans.site)),
		);
		expect(answer).toMatchObject({ status: 200, data: { code: "DOCK 09" } });
		expect(answer.refreshed).toContain("getCustomerDocks");
		const dock = await dockNamed("DOCK 09");
		expect(dock).toMatchObject({
			position: "P-09 · Expeditie oost",
			scp_code: "SCP-09",
			site_id: weggemans.site,
		});
		expect(await logOf(dock.id)).toEqual([
			{ action: "created", parent_type: "customer", parent_label: weggemans.code },
		]);
	});

	test("refuses a code another dock has, and a unit or location at another site", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const riedel = await customerNamed("Riedel B.V.");
		const elsewhere = await value<number>(
			`select min(id) from equipment where organization_id = ? and customer_id = ?`,
			[shltrId, riedel.id],
		);
		const location = await value<number>(
			`select min(l.id) from equipment_location l where l.site_id != ?`,
			[weggemans.site],
		);
		expect(location).not.toBeNull();
		const before = await value(`select count(*) from dock_position where organization_id = ?`, [
			shltrId,
		]);
		const answer = await as(shltr.owner, () =>
			submit(
				saveCustomerDock,
				dockForm(weggemans.code, weggemans.site, {
					code: "DOCK 05",
					doorId: String(elsewhere),
					levellerId: String(elsewhere),
					locationId: String(location),
				}),
			),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "doorId", message: "Choose a unit at the dock's site" }),
				expect.objectContaining({
					name: "levellerId",
					message: "Choose a unit at the dock's site",
				}),
				expect.objectContaining({ name: "code", message: "Another dock already has this code" }),
				expect.objectContaining({
					name: "locationId",
					message: "Choose a location at the dock's site",
				}),
			]),
		);
		expect(
			await value(`select count(*) from dock_position where organization_id = ?`, [shltrId]),
		).toBe(before);
	});

	test("a manager edits one; logged", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const dock = await dockNamed("DOCK 09");
		const answer = await as(shltr.owner, () =>
			submit(
				saveCustomerDock,
				dockForm(weggemans.code, weggemans.site, {
					dockId: String(dock.id),
					position: "P-09 · Expeditie west",
				}),
			),
		);
		expect(answer.status).toBe(200);
		expect((await dockNamed("DOCK 09")).position).toBe("P-09 · Expeditie west");
		expect((await logOf(dock.id)).map((entry) => entry.action)).toEqual(["created", "updated"]);
	});

	test("another customer's page can't change or delete it, nor can a planner", async () => {
		const [weggemans, riedel] = [
			await customerNamed("Weggemans Logistiek"),
			await customerNamed("Riedel B.V."),
		];
		const dock = await dockNamed("DOCK 09");
		const before = await rows(`select * from dock_position where id = ?`, [dock.id]);
		const tampered = dockForm(riedel.code, riedel.site, {
			dockId: String(dock.id),
			position: "Tampered",
		});
		await as(shltr.owner, async () => {
			expect(await submit(saveCustomerDock, tampered)).toMatchObject({ status: 404 });
			expect(
				await submit(deleteCustomerDock, { customer: riedel.code, id: String(dock.id) }),
			).toMatchObject({ status: 404 });
		});
		await as(shltr.member, async () => {
			const form = dockForm(weggemans.code, weggemans.site, { dockId: String(dock.id) });
			expect(await submit(saveCustomerDock, form)).toMatchObject({ status: 403 });
			expect(
				await submit(deleteCustomerDock, { customer: weggemans.code, id: String(dock.id) }),
			).toMatchObject({ status: 403 });
		});
		expect(await rows(`select * from dock_position where id = ?`, [dock.id])).toEqual(before);
	});

	test("a manager deletes one; logged", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const dock = await dockNamed("DOCK 09");
		const answer = await as(shltr.owner, () =>
			submit(deleteCustomerDock, { customer: weggemans.code, id: String(dock.id) }),
		);
		expect(answer).toMatchObject({ status: 200, data: { code: "DOCK 09" } });
		expect(await dockNamed("DOCK 09")).toBeUndefined();
		expect((await logOf(dock.id)).map((entry) => entry.action)).toEqual([
			"created",
			"updated",
			"deleted",
		]);
	});
});
