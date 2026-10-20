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
		const [unit] = await as(north.member, () => readUnits(officeUnits(), bySerial(mine.serial)));
		expect(unit).toMatchObject({
			id: mine.id,
			site: { id: mine.siteId },
			locationId: mine.locationId,
		});
		expect(unit).toHaveProperty("warrantyUntil");
		expect(unit.site).toHaveProperty("accessNotes");
		expect(unit.site.customer.id).toBe(mine.customerId);
		expect(
			await as(north.member, () => readUnits(officeUnits(), bySerial(southern.serial))),
		).toEqual([]);
	});

	test("reads a location with its QR code's token and its units, none of another tenant", async () => {
		const read = await as(north.member, () => readLocation(officeUnits(), mine.locationId));
		expect(read?.location).toMatchObject({ id: mine.locationId, site: { id: mine.siteId } });
		expect(read?.location).toHaveProperty("qrToken");
		expect(read?.units.map((unit) => unit.id)).toContain(mine.id);
		expect(await as(north.member, () => readLocation(officeUnits(), southern.locationId))).toBe(
			undefined,
		);
	});
});

describe("a field engineer", () => {
	test("sees the tenant's units and the sites' onSite columns, no warranty or QR token", async () => {
		const [unit] = await as(north.engineer, () =>
			readUnits(engineerUnits(), bySerial(mine.serial)),
		);
		expect(unit.id).toBe(mine.id);
		expect(unit).not.toHaveProperty("warrantyUntil");
		// @ts-expect-error An engineer's units have no warranty.
		void unit.warrantyUntil;
		expect(unit.site).toHaveProperty("accessNotes");
		expect(unit.site.customer.id).toBe(mine.customerId);
		const read = await as(north.engineer, () => readLocation(engineerUnits(), mine.locationId));
		expect(read?.location).not.toHaveProperty("qrToken");
		expect(await as(north.engineer, () => readLocation(engineerUnits(), southern.locationId))).toBe(
			undefined,
		);
	});
});

describe("a customer's contact", () => {
	test("sees their customer's units at their sites, with the sites' address only", async () => {
		const access = contact([mine.siteId]);
		const units = await as(north.customer, () => readUnits(customerUnits(access)));
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
			expect(await as(north.customer, () => readUnits(scope(), bySerial(unit.serial)))).toEqual([]);
			expect(await as(north.customer, () => readLocation(scope(), unit.locationId))).toBe(
				undefined,
			);
		}
	});
});
