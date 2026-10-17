import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { asc, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	createLocation,
	locationAt,
	removeLocation,
	updateLocation,
} from "#lib/equipment/server/locations.ts";
import {
	findQrTarget,
	newQrToken,
	qrDestination,
	resolveQrCode,
} from "#lib/equipment/server/qr.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipmentLocation } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/log.ts", async (importOriginal) => ({
	...(await importOriginal<object>()),
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));

// A temporary database made by the app's migrations (see `categories.spec.ts`).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "locations-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into user (id, name, email) values
			('office', 'Olga', 'olga@north.test'), ('field', 'Frits', 'frits@north.test'),
			('both', 'Bo', 'bo@north.test'), ('southern', 'Sam', 'sam@south.test');
		insert into member (id, organization_id, user_id, role, created_at) values
			('m1', 'north', 'office', 'member', 0), ('m2', 'north', 'field', 'engineer', 0),
			('m3', 'north', 'both', 'admin,engineer', 0), ('m4', 'south', 'southern', 'owner', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Utrecht', 'Utrecht', 'NL'), (3, 'north', 1, 'Ede', 'Ede', 'NL'),
			(2, 'south', 2, 'Breda', 'Breda', 'NL');
		insert into equipment_category (id, organization_id, name, position) values
			(10, 'north', 'Deur', 0), (20, 'south', 'Deur', 0);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["owner"],
	modules: [],
});

/** The name field's issue, as a remote form's `issue.name` makes it: here, the message. */
const nameIssue = (message: string) => message;

const unitToken = "aaaaaaaaaaaaaaaaaaaaaaaa";
const locationToken = "bbbbbbbbbbbbbbbbbbbbbbbb";
const southToken = "cccccccccccccccccccccccc";

beforeEach(async () => {
	locals.user = { id: "office", name: "Olga" };
	locals.tenant = tenant("north");
	logged.mockClear();
	await db.run(sql`delete from equipment`);
	await db.run(sql`delete from equipment_location`);
	// North's site 1 has two locations, the first with a unit; South's site one with a unit.
	await db.run(sql`insert into equipment_location (id, organization_id, site_id, name, position, qr_token)
		values (50, 'north', 1, 'Dock 03', 0, ${locationToken}), (51, 'north', 1, 'Hal A', 1, 'dddddddddddddddddddddddd'),
			(60, 'south', 2, 'Kantine', 0, 'eeeeeeeeeeeeeeeeeeeeeeee')`);
	await db.run(sql`insert into equipment (id, organization_id, serial_number, model, manufacturer,
			category_id, status, customer_id, site_id, location_id, installed_at, warranty_until, qr_token)
		values (100, 'north', 'SN-1', 'M', 'Make', 10, 'operational', 1, 1, 50, '2024-01-01', '2027-01-01', ${unitToken}),
			(200, 'south', 'SN-1', 'M', 'Make', 20, 'operational', 2, 2, 60, '2024-01-01', '2027-01-01', ${southToken})`);
});

/** A site's locations in their order. */
const locationsAt = (siteId: number) =>
	db
		.select({
			name: equipmentLocation.name,
			description: equipmentLocation.description,
			position: equipmentLocation.position,
			organizationId: equipmentLocation.organizationId,
		})
		.from(equipmentLocation)
		.where(sql`site_id = ${siteId}`)
		.orderBy(asc(equipmentLocation.position), asc(equipmentLocation.id));

/** How `change` failed: its status for an HTTP error, its messages when refused. */
async function failure(change: () => Promise<unknown>) {
	try {
		await change();
		return null;
	} catch (error) {
		if (isHttpError(error)) return error.status;
		if (isValidationError(error)) return error.issues.map((issue) => issue.message);
		throw error;
	}
}

describe("locations", () => {
	test("a new one comes last at its site, with a token of its own, logged against the customer", async () => {
		const { id, customerCode } = await createLocation(
			1,
			{ name: "Expeditie noord", description: "Achter de kantine" },
			nameIssue,
		);
		expect(customerCode).toBe("C-1");
		expect(await locationsAt(1)).toEqual([
			{ name: "Dock 03", description: null, position: 0, organizationId: "north" },
			{ name: "Hal A", description: null, position: 1, organizationId: "north" },
			{
				name: "Expeditie noord",
				description: "Achter de kantine",
				position: 2,
				organizationId: "north",
			},
		]);
		const [{ token }] = await db.all<{ token: string }>(
			sql`select qr_token as token from equipment_location where id = ${id}`,
		);
		expect(token).toMatch(/^[0-9a-f]{24}$/);
		expect(logged).toHaveBeenCalledWith({
			action: "created",
			subject: { type: "location", id, label: "Expeditie noord" },
			parent: { type: "customer", id: 1, label: "C-1" },
		});
		// Another site starts at 0.
		await createLocation(3, { name: "Dock 03", description: null }, nameIssue);
		expect((await locationsAt(3)).map((location) => location.position)).toEqual([0]);
	});

	test("a site has each name once, whatever the case", async () => {
		expect(
			await failure(() => createLocation(1, { name: "dock 03", description: null }, nameIssue)),
		).toEqual(["The site has a location called “Dock 03” already"]);
		expect(
			await failure(() => updateLocation(51, { name: "DOCK 03", description: null }, nameIssue)),
		).toEqual(["The site has a location called “Dock 03” already"]);
		// Its own name, in another case, is fine.
		await updateLocation(51, { name: "hal a", description: "Links" }, nameIssue);
		expect((await locationsAt(1))[1]).toMatchObject({ name: "hal a", description: "Links" });
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "updated",
				subject: { type: "location", id: 51, label: "hal a" },
				after: { name: "hal a", description: "Links" },
			}),
		);
	});

	test("one with units can't be deleted; one without can", async () => {
		expect(await failure(() => removeLocation(50))).toEqual([
			"1 unit is there: move it to another location first",
		]);
		expect(await removeLocation(51)).toBe("C-1");
		expect((await locationsAt(1)).map((location) => location.name)).toEqual(["Dock 03"]);
		expect(logged).toHaveBeenCalledWith({
			action: "deleted",
			subject: { type: "location", id: 51, label: "Hal A" },
			parent: { type: "customer", id: 1, label: "C-1" },
		});
	});

	test("the equipment form's new location is the site's of that name, or made", async () => {
		const id = await db.transaction((tx) => locationAt(tx, 1, "HAL A"));
		expect(id).toBe(51);
		const made = await db.transaction((tx) => locationAt(tx, 1, "Serverruimte"));
		expect((await locationsAt(1)).map((location) => location.name)).toEqual([
			"Dock 03",
			"Hal A",
			"Serverruimte",
		]);
		expect(made).toBeGreaterThan(60);
	});

	test("another tenant's sites and locations are a 404, also by their ids", async () => {
		expect(
			await failure(() => createLocation(2, { name: "Stolen", description: null }, nameIssue)),
		).toBe(404);
		expect(
			await failure(() => updateLocation(60, { name: "Stolen", description: null }, nameIssue)),
		).toBe(404);
		expect(await failure(() => removeLocation(60))).toBe(404);
		expect(await failure(() => db.transaction((tx) => locationAt(tx, 2, "Stolen")))).toBe(404);
		expect(await locationsAt(2)).toEqual([
			{ name: "Kantine", description: null, position: 0, organizationId: "south" },
		]);
		expect(logged).not.toHaveBeenCalled();
	});

	test("a unit's location must be at its own site", async () => {
		/** Why the database refused a statement. */
		const refusal = (statement: ReturnType<typeof sql>) =>
			db.run(statement).then(
				() => null,
				(error: Error) => String(error.cause),
			);
		// Site 3 is the same customer's, but location 50 is at site 1.
		expect(await refusal(sql`update equipment set site_id = 3 where id = 100`)).toMatch(
			/FOREIGN KEY/,
		);
		expect(await refusal(sql`update equipment set location_id = 60 where id = 100`)).toMatch(
			/FOREIGN KEY/,
		);
	});
});

describe("QR codes", () => {
	test("a new token is 24 hex digits, a different one each time", () => {
		const tokens = new Set(Array.from({ length: 100 }, newQrToken));
		expect(tokens.size).toBe(100);
		for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{24}$/);
	});

	test("a token is found whichever the tenant, and not one that isn't a token", async () => {
		expect(await findQrTarget(unitToken)).toEqual({
			kind: "unit",
			organizationId: "north",
			id: 100,
			serialNumber: "SN-1",
		});
		expect(await findQrTarget(locationToken)).toEqual({
			kind: "location",
			organizationId: "north",
			id: 50,
		});
		expect(await findQrTarget(southToken)).toMatchObject({ organizationId: "south", id: 200 });
		expect(await findQrTarget("ffffffffffffffffffffffff")).toBeUndefined();
		expect(await findQrTarget("100")).toBeUndefined();
		expect(await findQrTarget(unitToken.toUpperCase())).toBeUndefined();
	});

	test("it leads the office to its page, a field engineer into the portal", async () => {
		expect(await resolveQrCode(unitToken, "office")).toMatchObject({ viewer: "office" });
		expect(await resolveQrCode(unitToken, "field")).toMatchObject({ viewer: "engineer" });
		// An admin who's an engineer too works in the office.
		expect(await resolveQrCode(locationToken, "both")).toMatchObject({ viewer: "office" });
		const unit = {
			kind: "unit",
			organizationId: "north",
			id: 100,
			serialNumber: "SN 1/2",
		} as const;
		const location = { kind: "location", organizationId: "north", id: 50 } as const;
		expect(qrDestination(unit, "office")).toBe("/equipment/SN%201%2F2");
		expect(qrDestination(unit, "engineer")).toBe("/my/equipment/SN%201%2F2");
		expect(qrDestination(location, "office")).toBe("/equipment/locations/50");
		expect(qrDestination(location, "engineer")).toBe("/my/locations/50");
	});

	test("another tenant's code is nothing for who isn't a member there", async () => {
		expect(await resolveQrCode(southToken, "office")).toBeUndefined();
		expect(await resolveQrCode(unitToken, "southern")).toBeUndefined();
		expect(await resolveQrCode(southToken, "southern")).toMatchObject({
			target: { organizationId: "south" },
			viewer: "office",
		});
	});
});
