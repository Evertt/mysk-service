/**
 * A unit's condition as a customer's contact reads it in the customer portal (the badge on the
 * unit's page, `client.unit.badges`), on the seeded demo database: its status and what's behind a
 * planned one, as the office's card has them, and nothing else (no scores, advice or thresholds).
 * Another customer's unit (Weggemans' for Riedel's contact), another tenant's and one at a site
 * the contact doesn't see are a 404, also by a tampered serial number; a tenant without the module
 * (South) and the office are refused.
 */
import { describe, expect, test } from "vite-plus/test";

import { getClientUnitCondition } from "#modules/condition/client/client-condition.remote.ts";
import { getUnitCondition } from "#modules/condition/condition.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
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

/** The serial number of a unit of the customer `name`'s, its worst by condition first. */
const serialOf = (name: string) =>
	value<string>(
		`select e.serial_number from equipment e join customer c on c.id = e.customer_id
		 where c.name = ? order by (select max(score) from unit_condition u where u.equipment_id = e.id) desc,
		 e.id limit 1`,
		[name],
	);

/** The serial number of the first unit of a tenant's, of a customer other than `not`. */
const serialIn = (organization: string, not = 0) =>
	value<string>(
		`select serial_number from equipment where organization_id = ? and customer_id <> ?
		 order by id limit 1`,
		[organization, not],
	);

describe("a unit's condition in the customer portal", () => {
	test("is its score and status as the office has them, and nothing more", async () => {
		const serial = await serialOf("Riedel B.V.");
		const office = await as(shltr.member, () => data(getUnitCondition, serial));
		const answer = await as(riedel, () => data(getClientUnitCondition, serial));
		expect(answer).toEqual({
			unitId: office.unit.id,
			score: office.score,
			status: office.status,
			concern: office.concern,
		});
		// Riedel's worst, the dock 07 door with its broken torsion spring: 5 (Slecht).
		expect(answer.score).toBe(5);
	});

	test("of the unit at 3 · Redelijk, as the mockup's slide 6 has it", async () => {
		const serial = await value<string>(
			`select e.serial_number from equipment e join customer c on c.id = e.customer_id
			 where c.name = 'Riedel B.V.' and e.name = 'Sectionaaldeur D-09'`,
		);
		expect(await as(riedel, () => data(getClientUnitCondition, serial))).toMatchObject({
			score: 3,
		});
	});

	test("of another customer's unit or another tenant's is a 404, by a tampered serial too", async () => {
		const own = await serialOf("Riedel B.V.");
		const theirs = await serialOf("Weggemans Logistiek");
		await as(riedel, async () => {
			expect(await call(getClientUnitCondition, theirs)).toMatchObject({ status: 404 });
			expect(await call(getClientUnitCondition, await serialIn(northId))).toMatchObject({
				status: 404,
			});
		});
		await as(weggemans, async () => {
			expect(await call(getClientUnitCondition, own)).toMatchObject({ status: 404 });
			expect(await call(getClientUnitCondition, theirs)).toMatchObject({ status: 200 });
		});
		// North's contact: none of SHLTR's, nor another North customer's.
		const northern = await value<number>(
			`select id from customer where organization_id = ? order by id limit 1`,
			[northId],
		);
		await as(north.customer, async () => {
			expect(await call(getClientUnitCondition, own)).toMatchObject({ status: 404 });
			expect(await call(getClientUnitCondition, await serialIn(northId, northern))).toMatchObject({
				status: 404,
			});
		});
	});

	test("is refused to South (no module), to a tenant that switched it off and to the office", async () => {
		const own = await serialOf("Riedel B.V.");
		await as(south.customer, async () => {
			expect(await call(getClientUnitCondition, await serialIn(southId))).toMatchObject({
				status: 404,
			});
		});
		await withoutModule("shltr", "condition", () =>
			as(riedel, async () => {
				expect(await call(getClientUnitCondition, own)).toMatchObject({ status: 404 });
			}),
		);
		const office = await as(shltr.member, () => call(getClientUnitCondition, own));
		expect(office.status).not.toBe(200);
	});

	test("of a unit at a site a site-limited contact doesn't see is a 404", async () => {
		await expectSiteLimited((serial) => as(riedel, () => call(getClientUnitCondition, serial)));
	});
});
