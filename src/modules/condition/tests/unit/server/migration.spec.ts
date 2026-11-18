/**
 * The move to NEN 2767 (`0037_condition-nen2767`, the Durable Object's `0029_condition-nen2767`):
 * conditions get a score of 1–6 by their percentage's band and keep the percentage, the table's
 * sequence stays, and the tenants' thresholds map the same way, on sample rows in a database made by
 * the migrations before it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, test } from "vite-plus/test";

import { scoreOfPercent } from "#modules/condition/nen2767.ts";
import {
	durableFolder,
	migrationScratch,
	migrationsFolder,
} from "#unit/lib/server/db/migrations.test-support.ts";

const { folder, streamBefore } = migrationScratch();

/** Percentages on and around each band's edges. */
const percents = [100, 90, 89, 80, 79, 72, 70, 69, 40, 39, 20, 19, 0];

/**
 * Two tenants' units with conditions as percentages (one a component's, with advice), the newest
 * (the highest id yet) deleted, and their thresholds: the defaults, a stricter pair and a pair that
 * would map onto one score.
 */
const before = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2), ('c', 'C', 'c', 3);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment)
	values (1, 'a', 'C-1', 'Riedel', 'Ann', 'ann@riedel.test', '1', 'Ede', 'NL', 'enterprise');
	insert into customer_site (id, organization_id, customer_id, name, city, country)
	values (1, 'a', 1, 'Ede', 'Ede', 'NL');
	insert into equipment_category (id, organization_id, name, specialty, position)
	values (1, 'a', 'Sectionaaldeuren', null, 0);
	insert into equipment (id, organization_id, serial_number, name, model, manufacturer, category_id, status, customer_id, site_id, installed_at, warranty_until)
	values (10, 'a', 'SN-10', 'Deur 10', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01');
	insert into component (id, organization_id, equipment_id, number, name, position)
	values (1, 'a', 10, 'OC-0001', 'Torsieveerpakket', 0);
	insert into unit_condition (id, organization_id, equipment_id, score, advice, source, recorded_at)
	values ${percents.map((percent, i) => `(${i + 1}, 'a', 10, ${percent}, null, 'office', ${100 + i})`).join(", ")};
	insert into unit_condition (id, organization_id, equipment_id, component_id, score, advice, source, recorded_at)
	values (50, 'a', 10, 1, 22, 'Veerpakket vervangen', 'checklist', 500), (51, 'a', 10, null, 50, null, 'office', 600);
	delete from unit_condition where id = 51;
	insert into condition_settings (organization_id, critical_below, attention_below, auto_plan)
	values ('a', 40, 70, 1), ('b', 50, 80, 0), ('c', 75, 79, 0);
`;

/** What became of them: the conditions, the id a new one gets, and the thresholds. */
async function after(client: ReturnType<typeof createClient>) {
	const all = async (sql: string) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	await client.execute(
		"insert into unit_condition (organization_id, equipment_id, score, source, recorded_at) values ('a', 10, 2, 'office', 700)",
	);
	return {
		conditions: await all(
			"select id, component_id, score, legacy_percent, advice, source from unit_condition order by id",
		),
		settings: await all(
			"select organization_id, critical_from, attention_from, auto_plan from condition_settings order by organization_id",
		),
		keys: await all("pragma foreign_key_check"),
	};
}

const expected = {
	conditions: [
		...percents.map((percent, i) => ({
			id: i + 1,
			component_id: null,
			score: scoreOfPercent(percent),
			legacy_percent: percent,
			advice: null,
			source: "office",
		})),
		{
			id: 50,
			component_id: 1,
			score: 5,
			legacy_percent: 22,
			advice: "Veerpakket vervangen",
			source: "checklist",
		},
		// After the deleted one's id: the sequence is kept. Recorded since, so not converted.
		{ id: 52, component_id: null, score: 2, legacy_percent: null, advice: null, source: "office" },
	],
	settings: [
		// The defaults become 5 and 4.
		{ organization_id: "a", critical_from: 5, attention_from: 4, auto_plan: 1 },
		{ organization_id: "b", critical_from: 4, attention_from: 3, auto_plan: 0 },
		// 74% and 78% are both 3: attention moves below critical.
		{ organization_id: "c", critical_from: 3, attention_from: 2, auto_plan: 0 },
	],
	keys: [],
};

test("the bands map each percentage to its score", () => {
	expect(percents.map(scoreOfPercent)).toEqual([1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test("0037_condition-nen2767 converts the conditions and thresholds by band", async () => {
	const stream = streamBefore(migrationsFolder, "0037_condition-nen2767", "before-nen");
	const client = createClient({ url: `file:${join(folder, "nen.db")}` });
	await migrate(drizzle(client), { migrationsFolder: stream });
	await client.executeMultiple(before);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await after(client)).toEqual(expected);
	// A score off the scale is refused.
	await expect(
		client.execute(
			"insert into unit_condition (organization_id, equipment_id, score, source, recorded_at) values ('a', 10, 7, 'office', 800)",
		),
	).rejects.toThrow(/unit_condition_score/);
	client.close();
});

test("the Durable Object's 0029_condition-nen2767 does the same with its foreign keys on", async () => {
	const stream = streamBefore(durableFolder, "0029_condition-nen2767", "before-nen-durable");
	const client = createClient({ url: `file:${join(folder, "nen-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: stream });
	await client.executeMultiple(before);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0029_condition-nen2767.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await after(client)).toEqual(expected);
	client.close();
});
