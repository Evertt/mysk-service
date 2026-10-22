/**
 * How many values the engineer's unit and location reads bind per statement. A Durable Object's
 * SQLite takes at most 100 (`maxParameters`), and the engineer's reads carry the most: the rule for
 * the sites of their orders (`engineerSites()`) stands behind each of a site's on-site columns.
 * These specs keep a margin, so one more join or column doesn't push a statement over the limit.
 */
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { engineerUnits, readLocation, readUnits } from "#lib/equipment/server/index.ts";
import { db } from "#lib/server/db/index.ts";
import { getMyLocation, getMyUnit } from "#routes/(field)/my/places.remote.ts";
import { as, data, north, organizationId, rows } from "#unit/lib/server/harness/index.ts";

/** The most one statement may bind in these specs: well under `maxParameters`, 100. */
const margin = 60;

/** Every statement's number of bound values, since the last `heaviest()`. */
const bound: number[] = [];

/** The database's session, whose logger sees each statement (drizzle keeps it there). */
const session = (db as unknown as { session: { logger: unknown } }).session;
const original = session.logger;

/** The most values any one statement of `work` binds. */
async function heaviest(work: () => Promise<unknown>) {
	bound.length = 0;
	await work();
	return Math.max(...bound);
}

let serial: string;
let locationId: number;

afterAll(() => {
	session.logger = original;
});

beforeAll(async () => {
	session.logger = {
		logQuery: (query: string, params: unknown[]) => {
			bound.push(params.length);
			(original as { logQuery(q: string, p: unknown[]): void }).logQuery(query, params);
		},
	};
	[{ serial, locationId }] = await rows<{ serial: string; locationId: number }>(
		`select serial_number as serial, location_id as locationId from equipment
		 where organization_id = ? and location_id is not null limit 1`,
		[organizationId("north")],
	);
});

describe("the engineer's reads of units and locations", () => {
	test("bind well under a Durable Object's limit per statement", async () => {
		const results = {
			readUnits: await heaviest(() =>
				as(north.engineer, async () => readUnits(await engineerUnits())),
			),
			readLocation: await heaviest(() =>
				as(north.engineer, async () => readLocation(await engineerUnits(), locationId)),
			),
			getMyUnit: await heaviest(() => as(north.engineer, () => data(getMyUnit, String(serial)))),
			getMyLocation: await heaviest(() =>
				as(north.engineer, () => data(getMyLocation, String(locationId))),
			),
		};
		for (const count of Object.values(results)) expect(count).toBeLessThanOrEqual(margin);
	});
});
