/**
 * A door's dock (`doorDock()` in `server/docks.ts`), for the energy module's door card: the dock
 * whose door the unit is, with its live state and the plate of the truck at it; none for a
 * leveller, a unit that's no dock's, or another tenant's dock.
 */
import { rmSync } from "node:fs";

import { afterAll, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { doorDock } from "#modules/docks/server/docks.ts";

vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

// North has three docks at a site: DOCK 05 (door 10, leveller 11) locked with a truck at it,
// DOCK 06 (door 12) without any events yet; South a dock of its own at door 20.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "docks-door-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const { drizzleQueued } = await import("#lib/server/db/serialize.ts");
	const schema = await import("#lib/server/db/schema.ts");
	const moduleSchema = await import("#lib/server/db/modules.gen.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Utrecht', 'Utrecht', 'NL'), (2, 'south', 2, 'Breda', 'Breda', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Door', 'mechanical', 0), (2, 'south', 'Door', 'mechanical', 0);
		insert into equipment (id, organization_id, serial_number, model, manufacturer, category_id,
			status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'D-17', 'X', 'Y', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(11, 'north', 'L-17', 'X', 'Y', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(12, 'north', 'D-18', 'X', 'Y', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(13, 'north', 'F-01', 'X', 'Y', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(20, 'south', 'D-99', 'X', 'Y', 2, 'operational', 2, 2, '2020-01-01', '2022-01-01');
		insert into dock_position (id, organization_id, site_id, code, door_id, door_organization_id,
			leveller_id, leveller_organization_id, scp_code)
		values
			(1, 'north', 1, 'DOCK 05', 10, 'north', 11, 'north', 'SCP-05'),
			(2, 'north', 1, 'DOCK 06', 12, 'north', null, null, 'SCP-06'),
			(3, 'south', 2, 'DOCK 09', 20, 'south', null, null, 'SCP-09');
		insert into dock_state (organization_id, dock_id, locked, scp_online) values
			('north', 1, 1, 1), ('south', 3, 0, 1);
		insert into dock_session (organization_id, dock_id, plate, checked_in_at) values
			('north', 1, '84-BNX-7', 1000), ('south', 3, 'XX-99-XX', 1000);
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const north = <T>(work: () => Promise<T>) =>
	asSystem(
		{
			organizationId: "north",
			name: "North",
			slug: "north",
			roles: [],
			modules: ["docks"],
		} satisfies Tenant,
		work,
	);

describe("a door's dock", () => {
	test("is the dock whose door it is, with its live state and the truck's plate", async () => {
		expect(await north(() => doorDock(10))).toEqual({
			code: "DOCK 05",
			siteId: 1,
			doorOpenSince: null,
			plate: "84-BNX-7",
			reported: true,
			locked: true,
			scpOnline: true,
			occupied: true,
		});
	});

	test("that never reported is free and unlocked, and says so", async () => {
		expect(await north(() => doorDock(12))).toMatchObject({
			code: "DOCK 06",
			reported: false,
			locked: false,
			occupied: false,
			plate: null,
		});
	});

	test("is none for a leveller, a unit that's no dock's, or another tenant's door", async () => {
		expect(await north(() => doorDock(11))).toBeNull();
		expect(await north(() => doorDock(13))).toBeNull();
		expect(await north(() => doorDock(20))).toBeNull();
	});
});
