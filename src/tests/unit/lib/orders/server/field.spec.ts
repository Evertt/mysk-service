/**
 * `findEngineerOrder()` on the seeded database, as North's field engineer (Erik): an order of
 * theirs is found by id or number; another engineer's, South's and a missing one are the same 404
 * (with the number when the request named it); with an `action`, the order's status decides.
 */
import { isHttpError } from "@sveltejs/kit";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { fieldActions } from "#lib/orders/lifecycle.ts";
import { findEngineerOrder } from "#lib/orders/server/field.ts";
import { db } from "#lib/server/db/index.ts";
import { Refused } from "#lib/server/refused.ts";
import { as, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";

const erik = north.engineer;

interface Order {
	id: number;
	number: string;
	status: string;
}

let own: Order;
let others: Order;
let southern: Order;

beforeAll(async () => {
	const mine = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ?
		 and e.organization_id = ?`,
		[erik.email, organizationId("north")],
	);
	const first = (where: string, args: (string | number)[]) =>
		rows<Order>(
			`select id, number, status from "order" where ${where} order by id limit 1`,
			args,
		).then(([found]) => found);
	own = await first("engineer_id = ?", [mine]);
	others = await first("organization_id = ? and engineer_id <> ?", [organizationId("north"), mine]);
	// By a number none of Erik's orders has (numbers repeat across tenants).
	southern = await first(
		`organization_id = ? and engineer_id is not null and not exists
		 (select 1 from "order" s where s.engineer_id = ? and s.number = "order".number)`,
		[organizationId("south"), mine],
	);
	expect([own, others, southern].every(Boolean)).toBe(true);
});

/** What a call refuses with: its status and message. */
async function refusal(call: () => Promise<unknown>) {
	try {
		await call();
	} catch (thrown) {
		if (isHttpError(thrown)) return { status: thrown.status, message: thrown.body.message };
		throw thrown;
	}
	return undefined;
}

describe("findEngineerOrder()", () => {
	test("finds the engineer's own order by id or by number", async () => {
		await as(erik, async () => {
			expect((await findEngineerOrder(db, { id: own.id })).id).toBe(own.id);
			expect((await findEngineerOrder(db, { number: own.number })).id).toBe(own.id);
		});
	});

	test("reads another engineer's, South's and a missing order alike", async () => {
		await as(erik, async () => {
			for (const ref of [
				{ id: others.id },
				{ number: others.number },
				{ id: southern.id },
				{ number: southern.number },
				{ id: 999999 },
				{ number: "NO-SUCH" },
			]) {
				const refused = await refusal(() => findEngineerOrder(db, ref));
				expect(refused?.status, JSON.stringify(ref)).toBe(404);
			}
			// The message names the number only when the request did.
			const byNumber = await refusal(() => findEngineerOrder(db, { number: others.number }));
			expect(byNumber?.message).toContain(others.number);
			const byId = await refusal(() => findEngineerOrder(db, { id: others.id }));
			expect(byId?.message).not.toContain(others.number);
		});
	});

	test("with an action, refuses the status that doesn't allow it, and only then", async () => {
		await as(erik, async () => {
			const allowed = fieldActions(own.status as never).work;
			const refused = await findEngineerOrder(db, { id: own.id }, "work").then(
				() => undefined,
				(thrown: unknown) => thrown,
			);
			expect(refused === undefined).toBe(allowed);
			if (!allowed) expect(refused).toBeInstanceOf(Refused);
		});
	});
});
