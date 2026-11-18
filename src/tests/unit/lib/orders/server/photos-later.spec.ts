/**
 * Photos added to an order after its report, and deleted: its engineer adds them on site while
 * they work on it, the office while it isn't invoiced; the office deletes any, whoever added one
 * deletes it while the order is still to be done (the access registry's `order_photo` change). Each
 * add and delete is logged on the order, and a deleted photo's file goes. Everyone else is a 404,
 * also by a tampered id: another customer's contact, an engineer the order isn't theirs, another
 * tenant.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { getServiceHistory } from "#lib/equipment/detail/service-history.remote.ts";
import { getOrder } from "#lib/orders/order.remote.ts";
import { addPhotos, deletePhoto } from "#lib/orders/photos.remote.ts";
import {
	getPortalOrder,
	getPortalUnit,
	reportBreakdown,
} from "#routes/(customer)/portal/client.remote.ts";
import { getMyUnit } from "#routes/(field)/my/places.remote.ts";
import { getMyOrder } from "#routes/(field)/my/portal.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
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

const settings = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "photos-later-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

const shltrId = organizationId("shltr");
const riedel = shltr.customer;
const weggemans = demoAccount("rob@weggemans.example");
const lev = shltr.engineer;

const jpeg = (name = "plaat.jpg") =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])], name, { type: "image/jpeg" });

let order: { id: number; number: string; unitId: number; serial: string };
let levId: number;
let otherEngineerId: number;

/** The order's photos: id, who added them and their place, in order. */
const photosOfOrder = () =>
	rows<{ id: number; user_id: string | null; position: number; object_key: string }>(
		`select id, user_id, position, object_key from order_photo where order_id = ? order by position`,
		[order.id],
	);

const userId = (actor: Actor) =>
	value<string>(`select id from user where email = ?`, [actor.email]);

const setOrder = (fields: { status?: string; engineerId?: number }) =>
	value(
		`update "order" set status = coalesce(?, status), engineer_id = coalesce(?, engineer_id)
		 where id = ? returning id`,
		[fields.status ?? null, fields.engineerId ?? null, order.id],
	);

const add = (actor: Actor, id = order.id, photos = [jpeg()]) =>
	as(actor, () => submit(addPhotos, { id: String(id), photos }));
const remove = (actor: Actor, id: number | string) =>
	as(actor, () => submit(deletePhoto, { id: String(id) }));

beforeAll(async () => {
	const [unit] = await rows<{ id: number; serial_number: string }>(
		`select e.id, e.serial_number from equipment e join customer c on c.id = e.customer_id
		 where c.name = 'Riedel B.V.' order by e.id limit 1`,
	);
	// Riedel's contact reports a breakdown with a photo; a planner gives it to Lev, who starts it.
	expect(
		await as(riedel, () =>
			submit(reportBreakdown, {
				unitId: String(unit.id),
				description: "De deur blijft hangen",
				urgency: "high",
				photos: [jpeg("melding.jpg")],
			}),
		),
	).toMatchObject({ status: 303 });
	const [created] = await rows<{ id: number; number: string }>(
		`select id, number from "order" where organization_id = ? order by id desc limit 1`,
		[shltrId],
	);
	order = { ...created, unitId: unit.id, serial: unit.serial_number };
	levId = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id
		 where u.email = ? and e.organization_id = ?`,
		[lev.email, shltrId],
	);
	otherEngineerId = await value<number>(
		`select id from engineer where organization_id = ? and id <> ? and active = 1 order by id limit 1`,
		[shltrId, levId],
	);
	await setOrder({ status: "in_progress", engineerId: levId });
});

describe("adding photos later", () => {
	test("the engineer adds photos to their order on site, after the report's, each logged", async () => {
		expect(await add(lev, order.id, [jpeg("1.jpg"), jpeg("2.jpg")])).toMatchObject({
			status: 200,
		});
		const photos = await photosOfOrder();
		expect(photos.map((photo) => photo.position)).toEqual([0, 1, 2]);
		expect(photos.slice(1).map((photo) => photo.user_id)).toEqual([
			await userId(lev),
			await userId(lev),
		]);
		for (const photo of photos) {
			expect(existsSync(join(settings.photosFolder, photo.object_key))).toBe(true);
		}
		const logged = await rows<{ subject_label: string; parent_label: string }>(
			`select subject_label, parent_label from activity
			 where subject_type = 'order_photo' and action = 'created' and parent_id = ? order by id`,
			[String(order.id)],
		);
		expect(logged).toEqual([
			{ subject_label: "#1", parent_label: order.number },
			{ subject_label: "#2", parent_label: order.number },
			{ subject_label: "#3", parent_label: order.number },
		]);
	});

	test("the office adds photos to the order on its page", async () => {
		expect(await add(shltr.member)).toMatchObject({ status: 200 });
		expect((await photosOfOrder()).at(-1)?.user_id).toBe(await userId(shltr.member));
	});

	test("each shell reads them, each photo deletable by whom the registry says", async () => {
		const ids = (await photosOfOrder()).map((photo) => photo.id);
		// Riedel's, Lev's two, the planner's.
		const office = await as(shltr.member, () => data(getOrder, order.number));
		expect(office.photos).toEqual(ids.map((id) => ({ id, deletable: true })));
		const field = await as(lev, () => data(getMyOrder, order.number));
		expect(field.photos.map((photo) => photo.deletable)).toEqual([false, true, true, false]);
		const portal = await as(riedel, () => data(getPortalOrder, order.number));
		expect(portal.order.photos.map((photo) => photo.deletable)).toEqual([
			true,
			false,
			false,
			false,
		]);
	});

	test("the unit's service history shows them per order, in each shell", async () => {
		const ids = (await photosOfOrder()).map((photo) => photo.id);
		const history = await as(shltr.member, () => data(getServiceHistory, order.serial));
		const event = history.events.find(
			(one) => one.kind === "order" && one.order.number === order.number,
		);
		expect(event?.kind === "order" && event.order.photos.map((photo) => photo.id)).toEqual(ids);
		const field = await as(lev, () => data(getMyUnit, order.serial));
		expect(field.orders.find((one) => one.id === order.id)?.photos).toHaveLength(ids.length);
		const portal = await as(riedel, () => data(getPortalUnit, order.serial));
		expect(portal.orders.find((one) => one.id === order.id)?.photos).toHaveLength(ids.length);
	});

	test("no one else adds any, also by a tampered id", async () => {
		const before = (await photosOfOrder()).length;
		// The customer's contacts add theirs to the report only, and another customer's not at all.
		expect(await add(riedel)).toMatchObject({ status: 404 });
		expect(await add(weggemans)).toMatchObject({ status: 404 });
		// Other tenants: their office, engineer and contact.
		expect(await add(north.owner)).toMatchObject({ status: 404 });
		expect(await add(south.owner)).toMatchObject({ status: 404 });
		expect(await add(north.engineer)).toMatchObject({ status: 404 });
		expect(await add(north.customer)).toMatchObject({ status: 404 });
		// A North order's id, by SHLTR's office and engineer.
		const northOrder = await value<number>(
			`select id from "order" where organization_id = ? order by id limit 1`,
			[organizationId("north")],
		);
		expect(await add(shltr.member, northOrder)).toMatchObject({ status: 404 });
		expect(await add(lev, northOrder)).toMatchObject({ status: 404 });
		expect((await photosOfOrder()).length).toBe(before);
	});

	test("the form must have a photo, and holds the limits", async () => {
		const empty = await add(lev, order.id, []);
		expect(empty.status).toBe(400);
		expect(empty.issues).toContainEqual(
			expect.objectContaining({ name: "photos", message: "Choose one or more photos first." }),
		);
		const fake = await add(lev, order.id, [new File(["<svg/>"], "x.jpg", { type: "image/jpeg" })]);
		expect(fake.issues).toContainEqual(
			expect.objectContaining({ message: "Only photos can be added (JPEG, PNG or WebP)." }),
		);
	});
});

describe("deleting photos", () => {
	let photos: Awaited<ReturnType<typeof photosOfOrder>>;
	const levsPhotos = () => photos.filter((photo) => photo.position === 1 || photo.position === 2);

	beforeAll(async () => {
		photos = await photosOfOrder();
	});

	test("no one deletes another's photo, nor any photo of an order they can't read", async () => {
		const [reported, levs, , planners] = photos;
		// Lev deletes neither the contact's photo nor the planner's, the contact not Lev's.
		expect(await remove(lev, reported.id)).toMatchObject({ status: 404 });
		expect(await remove(lev, planners.id)).toMatchObject({ status: 404 });
		expect(await remove(riedel, levs.id)).toMatchObject({ status: 404 });
		// Another customer's contact, other tenants.
		expect(await remove(weggemans, reported.id)).toMatchObject({ status: 404 });
		expect(await remove(north.owner, reported.id)).toMatchObject({ status: 404 });
		expect(await remove(south.owner, levs.id)).toMatchObject({ status: 404 });
		expect(await remove(north.engineer, levs.id)).toMatchObject({ status: 404 });
		expect(await remove(north.customer, reported.id)).toMatchObject({ status: 404 });
		// Not a photo's id.
		expect(await remove(shltr.member, 999_999)).toMatchObject({ status: 404 });
		expect((await photosOfOrder()).length).toBe(photos.length);
	});

	test("the engineer deletes their own photo while they work on the order: row, file and log", async () => {
		const [own] = levsPhotos();
		expect(await remove(lev, own.id)).toMatchObject({ status: 200 });
		expect((await photosOfOrder()).map((photo) => photo.id)).not.toContain(own.id);
		expect(existsSync(join(settings.photosFolder, own.object_key))).toBe(false);
		expect(
			await rows(
				`select subject_label, parent_label from activity
				 where subject_type = 'order_photo' and action = 'deleted' and subject_id = ?`,
				[String(own.id)],
			),
		).toEqual([{ subject_label: "#2", parent_label: order.number }]);
	});

	test("an engineer the order isn't theirs (any more) neither deletes nor adds", async () => {
		const [, own] = levsPhotos();
		await setOrder({ engineerId: otherEngineerId });
		try {
			expect(await remove(lev, own.id)).toMatchObject({ status: 404 });
			expect(await add(lev)).toMatchObject({ status: 404 });
			expect(await as(lev, () => call(getMyOrder, order.number))).toMatchObject({ status: 404 });
		} finally {
			await setOrder({ engineerId: levId });
		}
	});

	test("once the order is completed, only the office deletes; the engineer adds no more", async () => {
		const [reported, , own, planners] = photos;
		await setOrder({ status: "completed" });
		expect(await remove(lev, own.id)).toMatchObject({ status: 404 });
		expect(await remove(riedel, reported.id)).toMatchObject({ status: 404 });
		const refused = await add(lev);
		expect(refused.status).toBe(400);
		expect(await as(lev, () => data(getMyOrder, order.number))).toMatchObject({
			photos: expect.arrayContaining([expect.objectContaining({ deletable: false })]),
		});
		// The office deletes any, and adds while it isn't invoiced.
		expect(await remove(shltr.member, own.id)).toMatchObject({ status: 200 });
		expect(await remove(shltr.member, planners.id)).toMatchObject({ status: 200 });
		expect(await add(shltr.member)).toMatchObject({ status: 200 });
		await setOrder({ status: "invoiced" });
		expect((await add(shltr.member)).status).toBe(400);
		await setOrder({ status: "in_progress" });
	});

	test("the contact deletes their own report's photo while the order is still to be done", async () => {
		const [reported] = photos;
		expect(await remove(riedel, reported.id)).toMatchObject({ status: 200 });
		expect((await photosOfOrder()).map((photo) => photo.id)).not.toContain(reported.id);
	});
});
