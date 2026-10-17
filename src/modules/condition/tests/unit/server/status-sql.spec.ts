/**
 * The status in SQL (`status-sql.ts`, `list-sql.ts`) against the pure rules (`rolledUpStatus()`,
 * `componentStatus()` in `model.ts`): units with components and without, conditions as a whole and
 * of components at random moments, planned work or not, in a temporary database made by the app's
 * migrations, with a second tenant's that mustn't count.
 */
import { rmSync } from "node:fs";

import { Faker, en } from "@faker-js/faker";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import {
	type ComponentFacts,
	componentStatus,
	defaultThresholds,
	rolledUpStatus,
	type UnitFacts,
} from "#modules/condition/model.ts";
import { rowsSql } from "#modules/condition/server/list-sql.ts";
import { component, unitCondition } from "#modules/condition/server/schema.ts";
import { componentSql, conditionSql } from "#modules/condition/server/status-sql.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
// No other modules: no inspection status, no next visit.
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "condition-status-spec-"));
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
	await client.execute("pragma foreign_keys = on");
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Riedel', 'Ann', 'ann@riedel.test', '1', 'Ede', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Other', 'Bob', 'bob@other.test', '1', 'Ede', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Ede', 'Ede', 'NL'), (2, 'south', 2, 'Ede', 'Ede', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Sectionaaldeuren', null, 0), (2, 'south', 'Sectionaaldeuren', null, 0);
		insert into equipment (id, organization_id, serial_number, name, model, manufacturer,
			category_id, status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'SN-10', 'Deur 10', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(11, 'north', 'SN-11', 'Deur 11', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(12, 'north', 'SN-12', 'Deur 12', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(13, 'north', 'SN-13', 'Deur 13', 'M', 'Make', 1, 'decommissioned', 1, 1, '2020-01-01', '2030-01-01'),
			(20, 'south', 'SN-20', 'Deur 20', 'M', 'Make', 2, 'operational', 2, 2, '2020-01-01', '2030-01-01');
		insert into component (id, organization_id, equipment_id, number, name, position) values
			(1, 'north', 10, 'OC-0001', 'Torsieveerpakket', 0),
			(2, 'north', 10, 'OC-0002', 'Staaldraadkabels', 1),
			(3, 'north', 11, 'OC-0003', 'Bodemafdichting', 0),
			(4, 'north', 13, 'OC-0004', 'Fotocel', 0),
			(5, 'south', 20, 'OC-0001', 'Torsieveerpakket', 0);
		insert into "order" (id, organization_id, number, customer_id, type, status, priority, description)
		values (100, 'north', 'ORD-1', 1, 'maintenance', 'quote', 'normal', 'Onderhoud'),
			(200, 'south', 'ORD-1', 2, 'maintenance', 'scheduled', 'normal', 'Onderhoud');
		insert into order_unit (organization_id, order_id, customer_id, equipment_id, position)
		values ('north', 100, 1, 10, 0), ('south', 200, 2, 20, 0);
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

beforeEach(() => {
	locals.user = { id: "u1", name: "Ann" };
	locals.tenant = {
		organizationId: "north",
		name: "North",
		slug: "north",
		roles: ["member"],
		modules: ["condition"],
	};
});

/** The north units' ids, and their components' by unit. */
const units = [10, 11, 12];
const parts: Record<number, number[]> = { 10: [1, 2], 11: [3], 12: [] };

/** A random condition: a score, sometimes advice; recorded at a random moment. */
function randomCondition(random: Faker, equipmentId: number, componentId: number | null) {
	return {
		organizationId: "north",
		equipmentId,
		componentId,
		score: random.number.int({ min: 0, max: 100 }),
		advice: random.datatype.boolean(0.2) ? "Meenemen bij de volgende beurt." : null,
		source: "office" as const,
		recordedAt: Temporal.Instant.fromEpochMilliseconds(
			random.number.int({ min: 1, max: 1_000 }) * 60_000,
		),
	};
}

/** The latest of `rows` (by moment, then id), as the status takes it. */
const latestOf = (
	rows: { score: number; advice: string | null; recordedAt: Temporal.Instant; id: number }[],
) =>
	rows.toSorted((a, b) => Temporal.Instant.compare(b.recordedAt, a.recordedAt) || b.id - a.id)[0];

describe("the status in SQL", () => {
	test("is the pure rules' for units and their components, whatever they recorded", async () => {
		const random = new Faker({ locale: [en] });
		random.seed(7);
		for (let round = 0; round < 25; round++) {
			await db.delete(unitCondition);
			const planned = random.datatype.boolean(0.3);
			await db.run(
				sql`update "order" set status = ${planned ? "scheduled" : "quote"} where id = 100`,
			);
			const rows = [
				...units.flatMap((unit) =>
					Array.from({ length: random.number.int({ min: 0, max: 3 }) }, () =>
						randomCondition(random, unit, null),
					),
				),
				...Object.entries(parts).flatMap(([unit, ids]) =>
					ids.flatMap((id) =>
						Array.from({ length: random.number.int({ min: 0, max: 3 }) }, () =>
							randomCondition(random, Number(unit), id),
						),
					),
				),
				// Another tenant's, which mustn't count.
				{ ...randomCondition(random, 20, 5), organizationId: "south", score: 1 },
			];
			const stored = rows.length ? await db.insert(unitCondition).values(rows).returning() : [];

			const unit = conditionSql();
			const part = componentSql(unit);
			const found = await db
				.select({ id: equipment.id, status: unit.status, concern: unit.concern, score: unit.score })
				.from(equipment)
				.where(eq(equipment.organizationId, "north"))
				.orderBy(asc(equipment.id));
			const foundParts = await db
				.select({ id: component.id, status: part.status, concern: part.concern, score: part.score })
				.from(component)
				.innerJoin(
					equipment,
					and(
						eq(equipment.organizationId, component.organizationId),
						eq(equipment.id, component.equipmentId),
					),
				)
				.where(eq(component.organizationId, "north"))
				.orderBy(asc(component.id));

			for (const id of units) {
				const own = latestOf(stored.filter((row) => row.equipmentId === id && !row.componentId));
				const facts: UnitFacts = {
					score: own?.score ?? null,
					advice: own?.advice ?? null,
					inspection: null,
					planned: planned && id === 10,
				};
				const components: ComponentFacts[] = parts[id].map((partId) => {
					const latest = latestOf(stored.filter((row) => row.componentId === partId));
					return { score: latest?.score ?? null, advice: latest?.advice ?? null };
				});
				const expected = rolledUpStatus(facts, components, defaultThresholds);
				const row = found.find((each) => each.id === id)!;
				expect(
					{ status: row.status, concern: row.concern, score: row.score },
					`${round}: ${id}`,
				).toEqual({ ...expected, score: facts.score });
				parts[id].forEach((partId, i) => {
					const expectedPart = componentStatus(components[i], facts, defaultThresholds);
					const got = foundParts.find((each) => each.id === partId)!;
					expect(
						{ status: got.status, concern: got.concern, score: got.score },
						`${round}: ${partId}`,
					).toEqual({ ...expectedPart, score: components[i].score });
				});
			}
		}
	});

	test("the Connect list has a row per component, and one per unit in care without", async () => {
		await db.delete(unitCondition);
		const listSql = rowsSql();
		const found = await listSql
			.from({ id: listSql.rowId, unit: equipment.id, component: component.id })
			.where(listSql.scope())
			.orderBy(asc(equipment.id));
		// Unit 13 is decommissioned, unit 20 another tenant's.
		expect(found.map((row) => [row.unit, row.component, Number(row.id)])).toEqual([
			[10, 1, -1],
			[10, 2, -2],
			[11, 3, -3],
			[12, null, 12],
		]);
	});
});
