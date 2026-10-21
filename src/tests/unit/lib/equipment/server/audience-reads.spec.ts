/**
 * Units and locations as each audience sees them (`readUnits()`, `readLocation()`), on the seeded
 * demo database: the office the tenant's with their warranty, the QR code's token and the sites'
 * `onSite` columns with their customer; a field engineer the same units without warranty or token;
 * a customer's contact only their customer's units and locations at the sites they see, with the
 * sites' address only. Another tenant's or customer's reads as nothing. The type check
 * (svelte-check) runs the `@ts-expect-error`s.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
	customerUnits,
	engineerUnits,
	officeUnits,
	readLocation,
	readUnits,
} from "#lib/equipment/server/index.ts";
import type { CustomerAccess } from "#lib/server/auth/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { engineerIdOf, sitesOfOrdersOf } from "#unit/lib/server/access/support.ts";
import { as, north, organizationId, rows } from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

interface Placed {
	id: number;
	serial: string;
	customerId: number;
	siteId: number;
	locationId: number;
}

/** A tenant's units at a location, by customer. */
const placedIn = (organization: string) =>
	rows<Placed>(
		`select id, serial_number as serial, customer_id as customerId, site_id as siteId,
		 location_id as locationId from equipment
		 where organization_id = ? and location_id is not null order by id`,
		[organization],
	);

let mine: Placed;
let southern: Placed;
/** A unit of North's of another customer than `mine`'s. */
let others: Placed;

beforeAll(async () => {
	const placed = await placedIn(northId);
	[mine] = placed;
	others = placed.find((unit) => unit.customerId !== mine.customerId)!;
	[southern] = await placedIn(southId);
});

/** A contact of `mine`'s customer who sees only `siteIds` (all its sites with `null`). */
const contact = (siteIds: number[] | null): CustomerAccess => ({
	contactId: 0,
	customer: { id: mine.customerId, code: "", name: "" },
	siteIds,
});

const bySerial = (serial: string) => eq(equipment.serialNumber, serial);

describe("the office", () => {
	test("sees the tenant's units with their warranty, and the sites' onSite columns and customer", async () => {
		const [unit] = await as(north.member, async () =>
			readUnits(await officeUnits(), bySerial(mine.serial)),
		);
		expect(unit).toMatchObject({
			id: mine.id,
			site: { id: mine.siteId },
			locationId: mine.locationId,
		});
		expect(unit).toHaveProperty("warrantyUntil");
		expect(unit.site).toHaveProperty("accessNotes");
		expect(unit.site.customer.id).toBe(mine.customerId);
		expect(
			await as(north.member, async () => readUnits(await officeUnits(), bySerial(southern.serial))),
		).toEqual([]);
	});

	test("reads a location with its QR code's token and its units, none of another tenant", async () => {
		const read = await as(north.member, async () =>
			readLocation(await officeUnits(), mine.locationId),
		);
		expect(read?.location).toMatchObject({ id: mine.locationId, site: { id: mine.siteId } });
		expect(read?.location).toHaveProperty("qrToken");
		expect(read?.units.map((unit) => unit.id)).toContain(mine.id);
		expect(
			await as(north.member, async () => readLocation(await officeUnits(), southern.locationId)),
		).toBe(undefined);
	});
});

describe("a field engineer", () => {
	/** A unit at a site of one of Erik's orders, and one at a site that isn't. */
	let there: Placed;
	let elsewhere: Placed;

	beforeAll(async () => {
		const erik = await engineerIdOf(north.engineer);
		const sites = (await sitesOfOrdersOf(erik)).map(Number);
		const placed = await placedIn(northId);
		there = placed.find((unit) => sites.includes(unit.siteId))!;
		elsewhere = placed.find((unit) => !sites.includes(unit.siteId))!;
		expect(there && elsewhere, "units at both kinds of site").toBeTruthy();
		// What the engineer needs on a site, so that its absence is the rule's.
		await rows(
			`update customer_site set access_notes = 'Key safe 1234', contact_name = 'Gate keeper' where id in (?, ?)`,
			[there.siteId, elsewhere.siteId],
		);
	});

	test("sees the tenant's units, no warranty or QR token", async () => {
		const [unit] = await as(north.engineer, async () =>
			readUnits(await engineerUnits(), bySerial(mine.serial)),
		);
		expect(unit.id).toBe(mine.id);
		expect(unit).not.toHaveProperty("warrantyUntil");
		// @ts-expect-error An engineer's units have no warranty.
		void unit.warrantyUntil;
		expect(unit.site.customer.id).toBe(mine.customerId);
		const read = await as(north.engineer, async () =>
			readLocation(await engineerUnits(), mine.locationId),
		);
		expect(read?.location).not.toHaveProperty("qrToken");
		expect(
			await as(north.engineer, async () =>
				readLocation(await engineerUnits(), southern.locationId),
			),
		).toBe(undefined);
	});

	test("sees what's needed on a site only where they have an order, else its address", async () => {
		const read = (placed: Placed) =>
			as(north.engineer, async () =>
				readUnits(await engineerUnits(), bySerial(placed.serial)),
			).then(([unit]) => unit);
		const onSite = await read(there);
		expect(onSite.site).toMatchObject({ accessNotes: "Key safe 1234", contactName: "Gate keeper" });
		const off = await read(elsewhere);
		expect(off.site).toMatchObject({
			id: elsewhere.siteId,
			accessNotes: null,
			contactName: null,
			contactPhone: null,
		});
		expect(off.site.address).toBeTruthy();
		// A location shows its site the same way.
		const location = await as(north.engineer, async () =>
			readLocation(await engineerUnits(), elsewhere.locationId),
		);
		expect(location?.location.site.accessNotes).toBeNull();
		expect(location?.units.map((unit) => unit.id)).toContain(elsewhere.id);
	});
});

describe("a customer's contact", () => {
	test("sees their customer's units at their sites, with the sites' address only", async () => {
		const access = contact([mine.siteId]);
		const units = await as(north.customer, async () => readUnits(await customerUnits(access)));
		expect(units.map((unit) => unit.id)).toContain(mine.id);
		expect(units.every((unit) => unit.site.id === mine.siteId)).toBe(true);
		expect(units[0]).not.toHaveProperty("warrantyUntil");
		expect(units[0].site).not.toHaveProperty("accessNotes");
		expect(units[0].site).not.toHaveProperty("customer");
		// @ts-expect-error A contact's units have no warranty.
		void units[0].warrantyUntil;
	});

	test("doesn't see another customer's, another site's or another tenant's", async () => {
		const elsewhere = contact([]);
		for (const [access, unit] of [
			[contact(null), others],
			[contact(null), southern],
			[elsewhere, mine],
		] as const) {
			const scope = () => customerUnits(access);
			expect(
				await as(north.customer, async () => readUnits(await scope(), bySerial(unit.serial))),
			).toEqual([]);
			expect(
				await as(north.customer, async () => readLocation(await scope(), unit.locationId)),
			).toBe(undefined);
		}
	});
});
