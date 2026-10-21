/**
 * The engineer portal's remote functions on the seeded demo database, as North's field engineer
 * (Erik) uses them: their work is their own orders only; completing needs their own signature
 * too, which is in their own name, logged once it's in; and South's order is a 404 to read and to change (another engineer's is the scope's, `engineer.spec.ts`), also by its id in
 * the forms of their own order. The server side of `src/tests/e2e/portal.test.ts`, which keeps the
 * job's story, a page's 404 and one tampered form.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getCurrentUser } from "#lib/auth/session.remote.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { announceChange, type Change, watchEvery } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { feedFor, liveFeed } from "#lib/server/live.ts";
import { getMyUnit } from "#routes/(field)/my/places.remote.ts";
import {
	addNote,
	completeWork,
	getMyOrder,
	getMyWork,
	logHours,
	startWork,
	watchFieldChanges,
} from "#routes/(field)/my/portal.remote.ts";
import { sitesOfOrdersOf } from "#unit/lib/server/access/support.ts";
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
import { drawn } from "#unit/signature.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const erik = north.engineer;

/** An order as stored, with its notes, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select o.*, (select count(*) from order_note n where n.order_id = o.id) as notes
		 from "order" o where o.id = ?`,
		[id],
	);

interface Order {
	id: number;
	number: string;
}

let mine: number;
/** An order of theirs under way, and one of South's. */
let own: Order;
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
	southern = await inProgress("organization_id = ?", [southId]);
	expect([own, southern].every(Boolean)).toBe(true);
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

	test("is theirs by the name the tenant knows them by, their record's", async () => {
		// The account's name made to differ from the record's, as when the office renames the record.
		const [user] = await rows<{ id: string; name: string }>(
			`select id, name from user where email = ?`,
			[erik.email],
		);
		await rows(`update user set name = ? where id = ?`, ["Erik's account", user.id]);
		try {
			const me = await as(erik, () => data(getCurrentUser));
			const name = await value<string>(`select name from engineer where id = ?`, [mine]);
			expect(me).toMatchObject({ name, organization: expect.any(String), customer: null });
			expect(me.name).not.toBe("Erik's account");
		} finally {
			await rows(`update user set name = ? where id = ?`, [user.name, user.id]);
		}
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

describe("an engineer's order in any status", () => {
	test("is theirs to read, though their work list shows only the planned and under way", async () => {
		const [cancelled] = await rows<Order>(
			`select id, number from "order" where engineer_id = ? and id <> ? order by id limit 1`,
			[mine, own.id],
		);
		await rows(`update "order" set status = 'cancelled' where id = ?`, [cancelled.id]);
		await as(erik, async () => {
			expect(await call(getMyOrder, cancelled.number)).toMatchObject({ status: 200 });
			const { open, recent } = await data(getMyWork);
			expect([...open, ...recent].map((one) => one.number)).not.toContain(cancelled.number);
		});
	});
});

describe("a scanned unit", () => {
	test("shows its site's access notes only at a site of their orders, else the address", async () => {
		const sites = (await sitesOfOrdersOf(mine)).map(Number);
		const units = await rows<{ serial: string; siteId: number }>(
			`select serial_number as serial, site_id as siteId from equipment where organization_id = ? order by id`,
			[northId],
		);
		const there = units.find((unit) => sites.includes(unit.siteId))!;
		const elsewhere = units.find((unit) => !sites.includes(unit.siteId))!;
		await rows(`update customer_site set access_notes = 'Key safe 1234' where id in (?, ?)`, [
			there.siteId,
			elsewhere.siteId,
		]);
		await as(erik, async () => {
			expect((await data(getMyUnit, there.serial)).unit.site.accessNotes).toBe("Key safe 1234");
			const off = (await data(getMyUnit, elsewhere.serial)).unit;
			expect(off.site.accessNotes).toBeNull();
			expect(off.site.address).toBeTruthy();
		});
	});
});

describe("South's order", () => {
	test("is a 404 to read", async () => {
		await as(erik, async () => {
			expect(await call(getMyOrder, southern.number)).toMatchObject({ status: 404 });
			expect(await call(getMyOrder, own.number)).toMatchObject({ status: 200 });
		});
	});

	test("is a 404 to change, also by its id in the forms of their own order", async () => {
		const before = await Promise.all([southern, own].map((order) => snapshot(order.id)));
		const id = String(southern.id);
		await as(erik, async () => {
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
				expect(answer).toMatchObject({ status: 404 });
			}
		});
		expect(await Promise.all([southern, own].map((order) => snapshot(order.id)))).toEqual(before);
	});
});

describe("the portal's feed of changes", () => {
	const change = (type: Change["type"], id: number, action = "updated"): Change => ({
		type,
		id: String(id),
		action,
		user: { id: "someone-else", name: "Pieter" },
		at: 1,
	});

	test("starts with none", async () => {
		expect(await as(erik, () => data(watchFieldChanges))).toMatchObject({ changes: [] });
	});

	test("tells the engineer of their own orders and of units, not who did it", async () => {
		const [others] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and engineer_id is not ? limit 1`,
			[northId, mine],
		);
		const [unit] = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? limit 1`,
			[northId],
		);
		const told = await as(erik, () =>
			feedFor()([
				change("order", own.id, "scheduled"),
				change("order", others.id),
				change("order", southern.id),
				change("equipment", unit.id),
				change("member", 1),
			]),
		);
		expect(told.map((heard) => `${heard.type}/${heard.id}`)).toEqual([
			`order/${own.id}`,
			`equipment/${unit.id}`,
		]);
		// Neither who made it nor what was done, only that it changed.
		expect(told[0]).toEqual({
			type: "order",
			id: String(own.id),
			action: "updated",
			name: "",
			mine: false,
			at: 1,
		});
	});

	test("tells that a change is their own, and a deletion as one", async () => {
		const [user] = await rows<{ id: string }>(`select id from user where email = ?`, [erik.email]);
		const told = await as(erik, () =>
			feedFor()([{ ...change("order", own.id, "deleted"), user: { id: user.id, name: "Erik" } }]),
		);
		expect(told).toEqual([
			{ type: "order", id: String(own.id), action: "deleted", name: "", mine: true, at: 1 },
		]);
	});

	test("keeps only what they read of a burst that mixes both", async () => {
		const burst = [change("order", southern.id), change("member", 1)];
		expect(await as(erik, () => feedFor()(burst))).toEqual([]);
		const mixed = await as(erik, () => feedFor()([...burst, change("order", own.id)]));
		expect(mixed.map((heard) => heard.id)).toEqual([String(own.id)]);
	});

	test("doesn't tell of a change for its type only", async () => {
		const mixed: Change[] = [change("order", own.id), { type: "order", at: 1 }];
		expect(await as(erik, () => feedFor()(mixed))).toHaveLength(1);
	});

	describe("when an order is taken off the engineer", () => {
		/** The change that took the order off engineer `from`. */
		const revoking = (from: number, id = own.id): Change => ({
			...change("order", id, "updated"),
			revokedFrom: [{ audience: "engineer", id: from }],
		});

		/** Takes `own` off Erik for the length of `work`. */
		async function released<T>(work: () => Promise<T>) {
			await rows(`update "order" set engineer_id = null where id = ?`, [own.id]);
			try {
				return await work();
			} finally {
				await rows(`update "order" set engineer_id = ? where id = ?`, [mine, own.id]);
			}
		}

		test("tells the engineer once, as the minimum: that it is gone from them, not who did it", async () => {
			await released(async () => {
				// An ordinary change to it is no longer heard, the one that took it is.
				const told = await as(erik, () => feedFor()([revoking(mine), change("order", own.id)]));
				expect(told).toEqual([
					{
						type: "order",
						id: String(own.id),
						action: "access_revoked",
						name: "",
						mine: false,
						at: 1,
					},
				]);
				expect(await as(erik, () => feedFor()([change("order", own.id)]))).toEqual([]);
			});
		});

		test("is no reason to read it: the next refresh is a 404", async () => {
			await released(async () => {
				await as(erik, async () => {
					expect(await call(getMyOrder, own.number)).toMatchObject({ status: 404 });
				});
			});
		});

		test("tells no other engineer, and no one of an order that was never theirs", async () => {
			const [another] = await rows<{ id: number }>(
				`select id from engineer where organization_id = ? and id is not ? limit 1`,
				[northId, mine],
			);
			await released(async () => {
				// Taken from another engineer: not Erik's to hear.
				expect(await as(erik, () => feedFor()([revoking(another.id)]))).toEqual([]);
			});
			// The order of South, taken from someone: never Erik's.
			expect(await as(erik, () => feedFor()([revoking(another.id, southern.id)]))).toEqual([]);
		});

		test("is told to the office as any change, with who made it", async () => {
			const told = await as(north.member, () => feedFor()([revoking(mine)]));
			expect(told).toEqual([
				{
					type: "order",
					id: String(own.id),
					action: "updated",
					name: "Pieter",
					mine: false,
					at: 1,
				},
			]);
		});

		test("is still told once when a later change to the order comes in the same burst", async () => {
			const heard = watchEvery(northId, ["order"]);
			const pending = heard.next();
			announceChange(northId, "order", {
				id: String(own.id),
				action: "updated",
				user: { id: "someone-else", name: "Pieter" },
				revokedFrom: [{ audience: "engineer", id: mine }],
			});
			announceChange(northId, "order", {
				id: String(own.id),
				action: "cancelled",
				user: { id: "someone-else", name: "Pieter" },
			});
			const batch = (await pending).value as Change[];
			heard.stop();
			// The later change replaced the first in the batch, and kept what the first revoked.
			expect(batch).toHaveLength(1);
			expect(batch[0]).toMatchObject({ action: "cancelled", revokedFrom: [{ id: mine }] });
			await released(async () => {
				expect(await as(erik, () => feedFor()(batch))).toEqual([
					expect.objectContaining({ id: String(own.id), action: "access_revoked", name: "" }),
				]);
			});
			// The office hears the latest change as it is.
			expect(await as(north.member, () => feedFor()(batch))).toEqual([
				expect.objectContaining({ id: String(own.id), action: "cancelled", name: "Pieter" }),
			]);
		});

		test("stays the engineer's latest news of the order when a later change comes in a later burst", async () => {
			await released(async () => {
				await as(erik, async () => {
					const feed = liveFeed(["order"], feedFor());
					await feed.next();
					const revoked = feed.next();
					announceChange(northId, "order", {
						id: String(own.id),
						action: "updated",
						revokedFrom: [{ audience: "engineer", id: mine }],
					});
					expect((await revoked).value?.changes).toEqual([
						expect.objectContaining({ id: String(own.id), action: "access_revoked" }),
					]);
					// A later change to the order is unreadable to them: nothing to say, the notice stays.
					const next = feed.next();
					announceChange(northId, "order", { id: String(own.id), action: "cancelled" });
					announceChange(northId, "order", { id: String(southern.id), action: "cancelled" });
					const idle = await Promise.race([
						next,
						new Promise((r) => setTimeout(() => r("waiting"), 50)),
					]);
					expect(idle).toBe("waiting");
				});
			});
		});

		test("is announced with the engineer it was taken from, by the log", async () => {
			const heard = watchEvery(northId, ["order"]);
			const pending = heard.next();
			await as(north.member, () =>
				db.transaction((tx) =>
					recordActivity(tx, {
						action: "updated",
						subject: { type: "order", id: own.id, label: own.number },
						before: { engineerId: mine },
						after: { engineerId: null },
					}),
				),
			);
			const { value } = await pending;
			heard.stop();
			expect(value).toEqual([
				expect.objectContaining({
					id: String(own.id),
					revokedFrom: [{ audience: "engineer", id: mine }],
				}),
			]);
			// A change that doesn't take it from anyone says so by saying nothing.
			const again = watchEvery(northId, ["order"]);
			const next = again.next();
			await as(north.member, () =>
				db.transaction((tx) =>
					recordActivity(tx, {
						action: "updated",
						subject: { type: "order", id: own.id, label: own.number },
						before: { engineerId: null, laborHours: 1 },
						after: { engineerId: mine, laborHours: 2 },
					}),
				),
			);
			const second = (await next).value as Change[];
			again.stop();
			expect(second[0].revokedFrom).toBeUndefined();
		});
	});
});
