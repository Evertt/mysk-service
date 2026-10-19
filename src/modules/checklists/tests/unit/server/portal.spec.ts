/**
 * The checklists in the engineer portal, on the seeded demo database, as SHLTR's engineer (Lev)
 * fills in those of one of his inspection orders: to read until the job's started; each answer,
 * remark and remark for the customer saved as it's given; a checklist completed once every point
 * is answered and each rejection says what's wrong (on record then: by him, valid for its months,
 * logged against the order, and the unit's score recorded by the condition module's hook); the
 * order completed only once every checklist is. Another engineer's checklist or another tenant's is
 * a 404, and the portal's functions are only for engineers. A customer's contact sees only completed
 * checklists, who completed one by the engineer's first name only, and on the printed work order
 * the engineer's full name but not who in the office. The server side of
 * `checklists.portal.test.ts`, which keeps the phone's page, the signatures and one tampered id.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getWorkOrder } from "#modules/checklists/checklists.remote.ts";
import {
	getClientOrderChecklists,
	getClientUnitInspection,
	getClientWorkOrder,
} from "#modules/checklists/client/client-checklists.remote.ts";
import {
	answer,
	complete,
	getFieldChecklists,
	remarkForCustomer,
	remarkOn,
} from "#modules/checklists/portal/field-checklists.remote.ts";
import { completeWork, startWork } from "#routes/(field)/my/portal.remote.ts";
import {
	as,
	call,
	data,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];
const lev = shltr.engineer;

/** A tiny PNG, as the signature pad sends one. */
const drawn =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Today in the seed's (and Lev's) time zone, as stored. */
const today = () => Temporal.Now.plainDateISO("Europe/Amsterdam");

/** An order's checklists as stored, in its units' order. */
const checklistsOfOrder = (orderId: number) =>
	rows<{
		id: number;
		equipment_id: number;
		serial_number: string;
		kind: string;
		status: string;
		remarks: string | null;
		completed_by: number | null;
		completed_by_user: string | null;
		valid_until: string | null;
		validity_months: number;
	}>(
		`select c.id, c.equipment_id, e.serial_number, c.kind, c.status, c.remarks, c.completed_by,
			c.completed_by_user, c.valid_until, c.validity_months
		 from checklist c join equipment e on e.id = c.equipment_id
		 join order_unit u on u.order_id = c.order_id and u.equipment_id = c.equipment_id
		 where c.order_id = ? order by u.position`,
		[orderId],
	);

/** A checklist's points as stored, in their order. */
const resultsOf = (checklistId: number) =>
	rows<{ id: number; result: string | null; remark: string | null }>(
		`select id, result, remark from checklist_result where checklist_id = ? order by position`,
		[checklistId],
	);

/** Answers each of a checklist's points that has no result yet OK, as Lev. */
async function answerTheRest(checklistId: number) {
	for (const point of await resultsOf(checklistId)) {
		if (point.result) continue;
		const answered = await as(lev, () => call(answer, { id: point.id, result: "ok" }));
		expect(answered.status).toBe(200);
	}
}

let levId: number;
let levUser: string;
let job: { id: number; number: string };

beforeAll(async () => {
	[{ id: levId, user_id: levUser }] = await rows<{ id: number; user_id: string }>(
		`select e.id, e.user_id from engineer e join user u on u.id = e.user_id
		 where u.email = ? and e.organization_id = ?`,
		[lev.email, shltrId],
	);
	[job] = await rows<{ id: number; number: string }>(
		`select o.id, o.number from "order" o where o.engineer_id = ? and o.status = 'scheduled'
		 and o.type = 'inspection'
		 and (select count(*) from checklist c where c.order_id = o.id) > 1
		 order by o.scheduled_for limit 1`,
		[levId],
	);
});

describe("Lev's planned inspection", () => {
	test("has a checklist per unit with a template, to read until the job's started", async () => {
		const stored = await checklistsOfOrder(job.id);
		const before = await as(lev, () => data(getFieldChecklists, job.number));
		expect(before.canChange).toBe(false);
		expect(before.checklists.map((checklist) => checklist.unit.serialNumber)).toEqual(
			stored.map((checklist) => checklist.serial_number),
		);
		const [point] = await resultsOf(stored[0].id);
		expect(await as(lev, () => call(answer, { id: point.id, result: "ok" }))).toMatchObject({
			status: 400,
			message: `${job.number} isn't in progress: its checklists can't be changed.`,
		});

		expect(await as(lev, () => submit(startWork, { id: String(job.id) }))).toMatchObject({
			status: 200,
		});
		expect((await as(lev, () => data(getFieldChecklists, job.number))).canChange).toBe(true);
	});

	test("each answer, remark and remark for the customer is saved as it's given", async () => {
		const [first] = await checklistsOfOrder(job.id);
		const [a, b] = await resultsOf(first.id);
		await as(lev, async () => {
			expect(await call(answer, { id: a.id, result: "nok" })).toMatchObject({ status: 200 });
			await call(answer, { id: b.id, result: "na" });
			// Taken back, and given again.
			await call(answer, { id: b.id, result: null });
			expect((await resultsOf(first.id))[1].result).toBeNull();
			await call(answer, { id: b.id, result: "ok" });
			await call(remarkOn, { id: a.id, remark: "Draadbreuk zichtbaar bij trommel." });
			await call(remarkForCustomer, { id: first.id, remarks: "Kabelset vervangen." });
		});
		expect((await resultsOf(first.id)).slice(0, 2)).toEqual([
			{ id: a.id, result: "nok", remark: "Draadbreuk zichtbaar bij trommel." },
			{ id: b.id, result: "ok", remark: null },
		]);
		expect((await checklistsOfOrder(job.id))[0].remarks).toBe("Kabelset vervangen.");
	});

	test("the order can't be completed while a checklist isn't", async () => {
		const answered = await as(lev, () =>
			submit(completeWork, {
				id: String(job.id),
				signerName: "M. Verhoeven",
				signature: drawn,
				engineerName: "Lev Hoekstra",
				engineerSignature: drawn,
			}),
		);
		expect(answered.status).toBe(400);
		expect(JSON.stringify(answered)).toMatch(
			new RegExp(`${job.number} can't be completed yet: the checklists? of`),
		);
		expect(await value(`select status from "order" where id = ?`, [job.id])).toBe("in_progress");
		expect(await rows(`select * from order_signoff where order_id = ?`, [job.id])).toEqual([]);
	});

	test("a checklist completes once every point is answered and each rejection says what's wrong", async () => {
		const [first] = await checklistsOfOrder(job.id);
		const id = first.id;
		const points = await resultsOf(first.id);
		const unanswered = points.filter((point) => !point.result).length;
		expect(unanswered).toBeGreaterThan(1);
		expect(await as(lev, () => call(complete, { id }))).toMatchObject({
			status: 400,
			message: `${unanswered} points have no answer yet.`,
		});

		await answerTheRest(first.id);
		const last = points.at(-1)!;
		await as(lev, () => call(answer, { id: last.id, result: "nok" }));
		expect(await as(lev, () => call(complete, { id }))).toMatchObject({
			status: 400,
			message: "1 rejected point doesn't say what's wrong.",
		});
		expect((await checklistsOfOrder(job.id))[0].status).toBe("draft");
		await as(lev, () => call(answer, { id: last.id, result: "ok" }));

		const conditions = Number(
			await value(`select count(*) from unit_condition where equipment_id = ?`, [
				first.equipment_id,
			]),
		);
		expect(await as(lev, () => call(complete, { id }))).toMatchObject({
			status: 200,
			refreshed: ["getFieldChecklists"],
		});
		const [done] = await checklistsOfOrder(job.id);
		expect(done).toMatchObject({
			status: "completed",
			kind: "inspection",
			completed_by: levId,
			completed_by_user: levUser,
			valid_until: today().add({ months: first.validity_months }).toString(),
		});
		// Logged against the order, with what it rejected.
		expect(
			await rows(
				`select action, note, user_id from activity where subject_type = 'checklist'
				 and subject_id = ? and parent_id = ?`,
				[String(id), String(job.id)],
			),
		).toEqual([{ action: "completed", note: "1 point rejected", user_id: levUser }]);
		// The condition module's hook: the unit's score from its points, on the order, by Lev.
		const answers = await resultsOf(first.id);
		const ok = answers.filter((point) => point.result === "ok").length;
		const counted = ok + answers.filter((point) => point.result === "nok").length;
		const [score] = await rows(
			`select score, source, order_id, engineer_id from unit_condition
			 where equipment_id = ? and component_id is null order by id desc limit 1`,
			[first.equipment_id],
		);
		expect(score).toEqual({
			score: Math.round((100 * ok) / counted),
			source: "checklist",
			order_id: job.id,
			engineer_id: levId,
		});
		expect(
			Number(
				await value(`select count(*) from unit_condition where equipment_id = ?`, [
					first.equipment_id,
				]),
			),
		).toBeGreaterThan(conditions);

		// On record: it isn't changed any more.
		expect(await as(lev, () => call(answer, { id: last.id, result: "nok" }))).toMatchObject({
			status: 400,
			message: expect.stringContaining("is completed already"),
		});
	});

	test("then the rest, and the order completes with both signatures", async () => {
		for (const checklist of (await checklistsOfOrder(job.id)).slice(1)) {
			await answerTheRest(checklist.id);
			expect(await as(lev, () => call(complete, { id: checklist.id }))).toMatchObject({
				status: 200,
			});
		}
		expect(
			await as(lev, () =>
				submit(completeWork, {
					id: String(job.id),
					signerName: "M. Verhoeven",
					signature: drawn,
					engineerName: "Lev Hoekstra",
					engineerSignature: drawn,
				}),
			),
		).toMatchObject({ status: 200 });
		expect(await value(`select status from "order" where id = ?`, [job.id])).toBe("completed");
		expect(
			await rows(`select signer_name, engineer_name from order_signoff where order_id = ?`, [
				job.id,
			]),
		).toEqual([{ signer_name: "M. Verhoeven", engineer_name: "Lev Hoekstra" }]);
		// Closed: its checklists aren't changed any more.
		expect((await as(lev, () => data(getFieldChecklists, job.number))).canChange).toBe(false);
	});
});

describe("whose checklists Lev may change", () => {
	test("another engineer's, or another tenant's, are a 404, also by their ids, and stay as they were", async () => {
		const [others] = await rows<{ number: string; checklist: number; point: number }>(
			`select o.number, c.id as checklist, min(r.id) as point from "order" o
			 join checklist c on c.order_id = o.id join checklist_result r on r.checklist_id = c.id
			 where o.organization_id = ? and o.engineer_id <> ? and c.status = 'draft'
			 group by c.id order by c.id limit 1`,
			[shltrId, levId],
		);
		const [northern] = await rows<{ number: string; checklist: number; point: number }>(
			`select o.number, c.id as checklist, min(r.id) as point from "order" o
			 join checklist c on c.order_id = o.id join checklist_result r on r.checklist_id = c.id
			 where o.organization_id = ? group by c.id order by c.id limit 1`,
			[northId],
		);
		const state = async () => ({
			checklists: await rows(`select * from checklist where id in (?, ?)`, [
				others.checklist,
				northern.checklist,
			]),
			results: await rows(
				`select * from checklist_result where checklist_id in (?, ?) order by id`,
				[others.checklist, northern.checklist],
			),
		});
		const before = await state();
		await as(lev, async () => {
			for (const target of [others, northern]) {
				const { point, checklist } = target;
				const answers = {
					getFieldChecklists: await call(getFieldChecklists, target.number),
					answer: await call(answer, { id: point, result: "ok" }),
					remarkOn: await call(remarkOn, { id: point, remark: "Overgenomen" }),
					remarkForCustomer: await call(remarkForCustomer, {
						id: checklist,
						remarks: "Overgenomen",
					}),
					complete: await call(complete, { id: checklist }),
				};
				for (const [name, answered] of Object.entries(answers)) {
					expect(answered.status, `${target.number} ${name}`).toBe(404);
				}
			}
		});
		expect(await state()).toEqual(before);
	});

	test("an order that isn't theirs is the portal's 404, naming the order", async () => {
		// North's, by a number none of Lev's orders has (numbers repeat across tenants).
		const [northern] = await rows<{ number: string }>(
			`select o.number from "order" o where o.organization_id = ? and not exists
			 (select 1 from "order" s where s.engineer_id = ? and s.number = o.number) limit 1`,
			[northId, levId],
		);
		expect(await as(lev, () => call(getFieldChecklists, northern.number))).toMatchObject({
			status: 404,
			message: `Order ${northern.number} not found`,
		});
	});

	test("the portal's checklists are an engineer's: an office member is refused them", async () => {
		const [point] = await rows<{ id: number }>(
			`select r.id from checklist_result r where r.organization_id = ? limit 1`,
			[shltrId],
		);
		await as(shltr.member, async () => {
			expect(await call(answer, { id: point.id, result: "ok" })).toMatchObject({
				status: 403,
			});
			expect(await call(getFieldChecklists, job.number)).toMatchObject({ status: 403 });
		});
	});
});

describe("the customer portal's checklists", () => {
	test("say who completed them by the engineer's first name, and of the office not who", async () => {
		const [done] = await rows<{ number: string; serial_number: string }>(
			`select o.number, e.serial_number from checklist c
			 join "order" o on o.id = c.order_id
			 join equipment e on e.id = c.equipment_id
			 join portal_contact p on p.customer_id = o.customer_id and p.organization_id = o.organization_id
			 join user u on u.id = p.user_id
			 where u.email = ? and c.status = 'completed' and c.completed_by is not null limit 1`,
			[shltr.customer.email],
		);
		await as(shltr.customer, async () => {
			const { checklists } = await data(getClientOrderChecklists, done.number);
			const inspection = await data(getClientUnitInspection, done.serial_number);
			for (const checklist of [...checklists, ...inspection.checklists]) {
				expect(checklist.engineer ?? "").not.toContain(" ");
				expect(typeof checklist.office).toBe("boolean");
			}
			expect(checklists.some((checklist) => checklist.engineer)).toBe(true);
		});
	});

	/** Of the contact's customer's units at the sites they see, the checklists with `status`. */
	const contactsChecklists = (status: string) =>
		rows<{ id: number; serial_number: string; number: string; order_status: string }>(
			`select c.id, e.serial_number, o.number, o.status as order_status from checklist c
			 join "order" o on o.id = c.order_id
			 join equipment e on e.id = c.equipment_id
			 join portal_contact p on p.customer_id = e.customer_id and p.organization_id = e.organization_id
			 join user u on u.id = p.user_id
			 where u.email = ? and c.status = ? and (p.all_sites or e.site_id in
				(select s.site_id from portal_contact_site s where s.contact_id = p.id))
			 order by c.id`,
			[shltr.customer.email, status],
		);

	test("of a unit, are only its completed ones: a draft's half-typed remarks stay in the office", async () => {
		const [draft] = await contactsChecklists("draft");
		expect(draft).toBeDefined();
		const inspection = await as(shltr.customer, () =>
			data(getClientUnitInspection, draft.serial_number),
		);
		expect(inspection.checklists.map((checklist) => checklist.id)).not.toContain(draft.id);
		expect(inspection.checklists.every((checklist) => checklist.status === "completed")).toBe(true);
	});

	test("of an order, are only its completed ones: its drafts' answers stay in the office too", async () => {
		const [draft] = await contactsChecklists("draft");
		const [done] = await contactsChecklists("completed");
		await as(shltr.customer, async () => {
			const open = await data(getClientOrderChecklists, draft.number);
			expect(open.checklists.map((checklist) => checklist.id)).not.toContain(draft.id);
			expect(open.checklists.every((checklist) => checklist.status === "completed")).toBe(true);
			const closed = await data(getClientOrderChecklists, done.number);
			expect(closed.checklists.map((checklist) => checklist.id)).toContain(done.id);
		});
	});

	test("print an order's work order once it's done, and before that it's a 404", async () => {
		const drafts = await contactsChecklists("draft");
		const open = drafts.find((each) => each.order_status === "scheduled");
		const [done] = await contactsChecklists("completed");
		expect(open).toBeDefined();
		expect(["completed", "invoiced"]).toContain(done.order_status);
		await as(shltr.customer, async () => {
			expect(await call(getClientWorkOrder, open!.number)).toMatchObject({ status: 404 });
			expect(await call(getClientWorkOrder, done.number)).toMatchObject({
				status: 200,
				data: { order: { number: done.number } },
			});
		});
	});

	test("print the engineer's full name on the work order, as signed, but of the office not who", async () => {
		const [done] = await contactsChecklists("completed");
		const [jan] = await rows<{ id: string; name: string }>(
			`select id, name from user where email = ?`,
			[shltr.member.email],
		);
		const engineer = String(
			await value(
				`select e.name from "order" o join engineer e on e.id = o.engineer_id where o.number = ?`,
				[done.number],
			),
		);
		expect(engineer).toContain(" ");
		// The office completed it for the engineer.
		await rows(`update checklist set completed_by = null, completed_by_user = ? where id = ?`, [
			jan.id,
			done.id,
		]);
		const workOrder = await as(shltr.customer, () => data(getClientWorkOrder, done.number));
		expect(workOrder.order.engineer).toBe(engineer);
		expect(workOrder.checklists.find((checklist) => checklist.id === done.id)).toMatchObject({
			engineer: null,
			office: true,
		});
		expect(JSON.stringify(workOrder)).not.toContain(jan.name);
		// The office's own work order says who.
		const office = await as(shltr.member, () => data(getWorkOrder, done.number));
		expect(office.checklists.find((checklist) => checklist.id === done.id)?.office).toBe(jan.name);
	});
});
