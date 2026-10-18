/**
 * The engineer portal's remote functions on the seeded demo database, as North's field engineer
 * (Erik) uses them: their work is their own orders only; completing needs their own signature
 * too, which is in their own name, logged once it's in; and another engineer's order, or South's, is a 404 to read and to change, also by its id in
 * the forms of their own order. The server side of `src/tests/e2e/portal.test.ts`, which keeps the
 * job's story, a page's 404 and one tampered form.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
	addNote,
	completeWork,
	getMyOrder,
	getMyWork,
	logHours,
	startWork,
} from "#routes/(field)/my/portal.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const erik = north.engineer;

/** An order as stored, with its notes, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select o.*, (select count(*) from order_note n where n.order_id = o.id) as notes
		 from "order" o where o.id = ?`,
		[id],
	);

/** A tiny PNG, as the signature pad sends one. */
const drawn =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

interface Order {
	id: number;
	number: string;
}

let mine: number;
/** An order of theirs under way, another North engineer's, and one of South's. */
let own: Order;
let others: Order;
let southern: Order;

beforeAll(async () => {
	mine = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ?
		 and e.organization_id = ?`,
		[erik.email, northId],
	);
	const inProgress = (where: string, args: (string | number)[]) =>
		rows<Order>(
			`select id, number from "order" where status = 'in_progress' and ${where} order by id limit 1`,
			args,
		).then(([found]) => found);
	own = await inProgress("engineer_id = ?", [mine]);
	others = await inProgress("organization_id = ? and engineer_id <> ?", [northId, mine]);
	southern = await inProgress("organization_id = ?", [southId]);
	expect([own, others, southern].every(Boolean)).toBe(true);
});

describe("an engineer's work", () => {
	test("is their own orders, open and done", async () => {
		const { open, recent } = await as(erik, () => data(getMyWork));
		const theirs = new Set(
			(
				await rows<{ number: string }>(`select number from "order" where engineer_id = ?`, [mine])
			).map((row) => row.number),
		);
		expect(open.length).toBeGreaterThan(0);
		for (const order of [...open, ...recent])
			expect(theirs.has(order.number), order.number).toBe(true);
		expect(open.map((order) => order.number)).toContain(own.number);
	});

	test("is completed with the customer's and their own signature", async () => {
		const before = await snapshot(own.id);
		const answer = await as(erik, () =>
			submit(completeWork, {
				id: String(own.id),
				signerName: "Robin Customer",
				signature: drawn,
				engineerSignature: "",
			}),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(
			expect.objectContaining({
				name: "engineerSignature",
				message: "Sign the work order yourself too",
			}),
		);
		expect(await snapshot(own.id)).toEqual(before);
	});

	test("is signed off in their own name, whatever name the form sends", async () => {
		const answer = await as(erik, () =>
			submit(completeWork, {
				id: String(own.id),
				signerName: "Robin Customer",
				signature: drawn,
				engineerName: "Someone Else",
				engineerSignature: drawn,
			}),
		);
		expect(answer).toMatchObject({ status: 200 });
		const name = await value<string>(`select name from engineer where id = ?`, [mine]);
		expect(
			await rows(`select signer_name, engineer_name from order_signoff where order_id = ?`, [
				own.id,
			]),
		).toEqual([{ signer_name: "Robin Customer", engineer_name: name }]);
		// Logged once the sign-off is in, with who signed for the customer as a change of its own.
		expect(
			await rows(
				`select action, changes, note from activity where subject_type = 'order'
				 and subject_id = ? order by id desc limit 1`,
				[String(own.id)],
			),
		).toEqual([
			{
				action: "completed",
				changes: JSON.stringify({
					status: ["in_progress", "completed"],
					signedBy: [null, "Robin Customer"],
				}),
				note: null,
			},
		]);
	});
});

describe("another engineer's order, or South's", () => {
	test("is a 404 to read", async () => {
		await as(erik, async () => {
			for (const order of [others, southern]) {
				expect(await call(getMyOrder, order.number), order.number).toMatchObject({ status: 404 });
			}
			expect(await call(getMyOrder, own.number)).toMatchObject({ status: 200 });
		});
	});

	test("is a 404 to change, also by its id in the forms of their own order", async () => {
		const victims = [others, southern];
		const before = await Promise.all([...victims, own].map((order) => snapshot(order.id)));
		await as(erik, async () => {
			for (const victim of victims) {
				const id = String(victim.id);
				for (const answer of [
					await submit(addNote, { id, text: "1" }),
					await submit(logHours, { id, laborHours: 1 }),
					await submit(startWork, { id }),
					await submit(completeWork, {
						id,
						signerName: "Robin Customer",
						signature: drawn,
						engineerSignature: drawn,
					}),
				]) {
					expect(answer, victim.number).toMatchObject({ status: 404 });
				}
			}
		});
		expect(await Promise.all([...victims, own].map((order) => snapshot(order.id)))).toEqual(before);
	});
});
