/**
 * A unit's timeline on the seeded demo: SHLTR's Sectionaaldeur D-07 at Riedel has the slide's day
 * (a 14-minute opening, a fault reported through the QR code, an order created and planned at once,
 * then completed with two photos), told to each shell as it may read it: the office in full, the
 * customer's contact without anyone's name but the engineer's first, an engineer of what's theirs.
 * Another customer's contact, a contact limited to other sites, another tenant and a tampered
 * serial get a 404. The pages follow each other without gaps or repeats.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
	getFieldUnitTimeline,
	getPortalUnitTimeline,
	getUnitTimeline,
} from "#lib/equipment/timeline/timeline.remote.ts";
import { compareEntries, type TimelineEntry } from "#lib/equipment/timeline/timeline.ts";
import { STORY_UNIT } from "#lib/server/db/seed/unit-story.ts";
import { reportBreakdown } from "#routes/(customer)/portal/client.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");
const weggemans = demoAccount("rob@weggemans.example");

let serial: string;
/** The story's order, its engineer and its planner. */
let story: { number: string; engineer: string; planner: string };

beforeAll(async () => {
	serial = await value<string>(
		`select serial_number from equipment where organization_id = ? and name = ?`,
		[shltrId, STORY_UNIT],
	);
	[story] = await rows<{ number: string; engineer: string; planner: string }>(
		`select o.number, e.name as engineer, u.name as planner from "order" o
		 join order_request r on r.order_id = o.id join engineer e on e.id = o.engineer_id
		 join user u on u.id = r.decided_by
		 join order_unit ou on ou.order_id = o.id join equipment q on q.id = ou.equipment_id
		 where q.serial_number = ? and q.organization_id = ? and r.via = 'qr'`,
		[serial, shltrId],
	);
});

const kinds = (entries: TimelineEntry[]) => entries.map((entry) => entry.kind);
const ofStory = (entries: TimelineEntry[]) =>
	entries.filter((entry) => entry.order === story.number);

describe("the office", () => {
	test("reads the slide's day: the opening, the report, the planning and the completion", async () => {
		const page = await as(shltr.member, () => data(getUnitTimeline, { serial }));
		const own = ofStory(page.entries);
		expect(kinds(own)).toEqual([
			"order.completed",
			"order.started",
			"order.departed",
			"order.planned",
			"order.reported",
		]);
		const [completed, , , planned, reported] = own;
		expect(reported.title).toBe("Fault reported via the QR code");
		expect(reported.detail).toContain("Marieke Verhoeven");
		expect(planned.title).toBe("Order created, engineer scheduled");
		expect(planned.detail).toContain(story.engineer);
		expect(completed.title).toBe("Order completed, with 2 photos");
		expect(completed.photos).toHaveLength(2);
		expect(completed.photos!.every((photo) => photo.src.startsWith("/photos/"))).toBe(true);
		// The photos are the completion's, not an entry of their own as well.
		expect(kinds(own)).not.toContain("order.photos");

		const opening = page.entries.find(
			(entry) => entry.kind === "energy.opening" && entry.title.startsWith("14 min open"),
		);
		expect(opening?.title).toBe("14 min open — energy loss measured");
		expect(kinds(page.entries)).toContain("energy.alert");
		expect(page.figures?.map((figure) => figure.key)).toEqual(
			expect.arrayContaining(["energy.opened", "energy.lost"]),
		);
		expect(page.liveTypes).toEqual(
			expect.arrayContaining(["order", "equipment", "energy_reading"]),
		);
	});

	test("reads the timeline page by page, in order, without gaps or repeats", async () => {
		const seen: TimelineEntry[] = [];
		let before: { at: string; id: string } | undefined;
		for (let pages = 0; pages < 200; pages++) {
			const page = await as(shltr.member, () => data(getUnitTimeline, { serial, before }));
			seen.push(...page.entries);
			if (!page.next) break;
			before = { at: page.next.at.toString(), id: page.next.id };
		}
		expect(seen.length).toBeGreaterThan(25);
		expect(new Set(seen.map((entry) => entry.id)).size).toBe(seen.length);
		expect(seen).toEqual(seen.toSorted(compareEntries));
		// Down to the unit's installation.
		expect(seen.filter((entry) => entry.kind === "unit.installed")).toHaveLength(1);
		// The figures are the first page's only.
		const second = await as(shltr.member, () =>
			data(getUnitTimeline, { serial, before: { at: seen[0].at.toString(), id: seen[0].id } }),
		);
		expect(second.figures).toBeNull();
	});
});

describe("the customer's contact", () => {
	test("reads their unit without the planner's or reporter's name, the engineer by first name", async () => {
		const page = await as(shltr.customer, () => data(getPortalUnitTimeline, { serial }));
		const own = ofStory(page.entries);
		expect(kinds(own)).toContain("order.reported");
		const planned = own.find((entry) => entry.kind === "order.planned")!;
		const [first, ...rest] = story.engineer.split(" ");
		expect(planned.detail).toContain(first);
		if (rest.length) expect(planned.detail).not.toContain(story.engineer);
		const text = JSON.stringify(page.entries);
		expect(text).not.toContain(story.planner);
		expect(text).not.toContain("Marieke Verhoeven");
		// The office's: its alerts and the warranty.
		expect(kinds(page.entries)).not.toContain("energy.alert");
		expect(kinds(page.entries)).not.toContain("unit.warranty");
		// Their own door's figures.
		expect(page.figures?.map((figure) => figure.key)).toContain("energy.opened");
	});

	test("another customer's contact, another tenant and a tampered serial get a 404", async () => {
		expect(await as(weggemans, () => call(getPortalUnitTimeline, { serial }))).toMatchObject({
			status: 404,
		});
		expect(await as(north.customer, () => call(getPortalUnitTimeline, { serial }))).toMatchObject({
			status: 404,
		});
		expect(await as(south.owner, () => call(getUnitTimeline, { serial }))).toMatchObject({
			status: 404,
		});
		expect(
			await as(shltr.customer, () => call(getPortalUnitTimeline, { serial: `${serial}-x` })),
		).toMatchObject({ status: 404 });
		// A tampered cursor is refused by the schema.
		expect(
			await as(shltr.member, () =>
				call(getUnitTimeline, { serial, before: { at: "yesterday", id: "x" } }),
			),
		).toMatchObject({ status: 400 });
	});
});

describe("an engineer", () => {
	test("reads the unit, but not orders that aren't theirs, and names by first name", async () => {
		const page = await as(shltr.engineer, () => data(getFieldUnitTimeline, { serial }));
		expect(ofStory(page.entries)).toEqual([]);
		expect(kinds(page.entries)).toContain("unit.installed");
		// Energy is the office's and the customer's, not the field's.
		expect(kinds(page.entries)).not.toContain("energy.opening");
	});
});

describe("a report", () => {
	test("says whether it came in through the QR code or the portal", async () => {
		const unitId = await value<number>(
			`select id from equipment where serial_number = ? and organization_id = ?`,
			[serial, shltrId],
		);
		const report = (via?: string) =>
			as(shltr.customer, () =>
				submit(reportBreakdown, {
					unitId: String(unitId),
					description: `Melding ${via ?? "zonder kanaal"}`,
					urgency: "normal",
					...(via && { via }),
				}),
			);
		const newest = async () =>
			(await as(shltr.customer, () => data(getPortalUnitTimeline, { serial }))).entries.find(
				(entry) => entry.kind === "order.reported",
			);
		expect(await report("qr")).toMatchObject({ status: 303 });
		expect(await newest()).toMatchObject({
			title: "Fault reported via the QR code",
			detail: "Melding qr",
		});
		expect(await report()).toMatchObject({ status: 303 });
		expect(await newest()).toMatchObject({ title: "Fault reported in the customer portal" });
		expect(await report("phone")).toMatchObject({ status: 400 });
	});
});

describe("a contact limited to other sites", () => {
	test("gets a 404 for a unit at a site they don't see", async () => {
		const [contact] = await rows<{ id: number; customer_id: number }>(
			`select c.id, c.customer_id from portal_contact c join user u on u.id = c.user_id
			 where u.email = ? and c.organization_id = ?`,
			["facilitair@riedel.example", shltrId],
		);
		// Another site of their customer's, the only one they see.
		await rows(
			`insert into customer_site (organization_id, customer_id, name, city, country)
			 values (?, ?, 'Riedel Zwolle', 'Zwolle', 'Netherlands')`,
			[shltrId, contact.customer_id],
		);
		const other = await value<number>(`select max(id) from customer_site`, []);
		await rows(`update portal_contact set all_sites = 0 where id = ?`, [contact.id]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values (?, ?, ?, ?)`,
			[shltrId, contact.id, contact.customer_id, other],
		);
		expect(await as(shltr.customer, () => call(getPortalUnitTimeline, { serial }))).toMatchObject({
			status: 404,
		});
	});
});
