/**
 * The photos and the kind of fault of a breakdown a customer's contact reports in the portal: what
 * the report stores and logs, what the portal and the office read back, the limits the server holds
 * the photos to, and who `/photos/<id>` serves a photo to: whoever may read its order (the office,
 * the contact), a 404 for another customer's contact, an engineer not on it and another tenant, also
 * by a tampered id.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isHttpError } from "@sveltejs/kit";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { getOrder } from "#lib/orders/order.remote.ts";
import { MAX_PHOTO_BYTES } from "#lib/orders/photos.ts";
import { getPortalOrder, reportBreakdown } from "#routes/(customer)/portal/client.remote.ts";
import { GET } from "#routes/photos/[id]/+server.ts";
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
	signedOut,
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
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "order-photos-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

/** Riedel's facilities contact, SHLTR's. */
const riedel = shltr.customer;
/** Another of SHLTR's customers' contact. */
const weggemans = demoAccount("rob@weggemans.example");
const shltrId = organizationId("shltr");

const jpeg = (name = "deur.jpg", extra = 16) =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(extra).fill(7)])], name, {
		type: "image/jpeg",
	});
const png = () =>
	new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], "plaat.png", {
		type: "image/png",
	});

let unitId: number;

beforeAll(async () => {
	unitId = await value<number>(
		`select e.id from equipment e join customer c on c.id = e.customer_id
		 where c.name = 'Riedel B.V.' order by e.id limit 1`,
	);
});

const orderCount = () => value<number>(`select count(*) from "order"`);
const photoCount = () => value<number>(`select count(*) from order_photo`);

/** Reports a breakdown of Riedel's unit as Riedel's contact, with `extra` fields. */
const report = (extra: Record<string, unknown>) =>
	as(riedel, () =>
		submit(reportBreakdown, {
			unitId: String(unitId),
			description: "De roldeur sluit niet meer",
			urgency: "urgent",
			...extra,
		}),
	);

/** The latest order's number and id. */
const latest = async () =>
	(
		await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? order by id desc limit 1`,
			[shltrId],
		)
	)[0];

/** `/photos/<id>` as `actor` (signed out if `null`): its status, type and bytes. */
async function photo(actor: Actor | null, id: string) {
	const run = async () => {
		try {
			const response = await GET({ params: { id } } as never);
			return {
				status: response.status,
				type: response.headers.get("content-type"),
				bytes: new Uint8Array(await response.arrayBuffer()),
			};
		} catch (error) {
			if (isHttpError(error)) return { status: error.status, type: null, bytes: null };
			throw error;
		}
	};
	return actor ? as(actor, run) : signedOut(run);
}

describe("a report with photos and a kind of fault", () => {
	let reported: { id: number; number: string };
	let photoIds: string[];

	beforeAll(async () => {
		const answer = await report({ fault: "door_wont_close", photos: [jpeg(), png()] });
		expect(answer).toMatchObject({ status: 303 });
		reported = await latest();
		photoIds = (
			await rows<{ id: number }>(
				`select id from order_photo where order_id = ? order by position`,
				[reported.id],
			)
		).map((row) => String(row.id));
	});

	test("keeps the fault with the report, and the photos in their order under the tenant's keys", async () => {
		expect(await value(`select fault from order_request where order_id = ?`, [reported.id])).toBe(
			"door_wont_close",
		);
		const stored = await rows<{
			object_key: string;
			content_type: string;
			size: number;
			position: number;
			organization_id: string;
		}>(
			`select object_key, content_type, size, position, organization_id from order_photo
			 where order_id = ? order by position`,
			[reported.id],
		);
		expect(stored).toMatchObject([
			{ content_type: "image/jpeg", size: 20, position: 0, organization_id: shltrId },
			{ content_type: "image/png", size: 10, position: 1, organization_id: shltrId },
		]);
		expect(stored[0].object_key).toMatch(new RegExp(`^${shltrId}/orders/[0-9a-f-]+\\.jpg$`));
		expect(stored[1].object_key).toMatch(/\.png$/);
		const file = join(settings.photosFolder, stored[0].object_key);
		expect(existsSync(file)).toBe(true);
		expect(readFileSync(file).byteLength).toBe(20);
	});

	test("logs each photo as created on the order, by the contact", async () => {
		const entries = await rows<{ subject_label: string; parent_label: string; action: string }>(
			`select subject_label, parent_label, action from activity
			 where subject_type = 'order_photo' and parent_id = ? order by id`,
			[String(reported.id)],
		);
		expect(entries).toEqual([
			{ subject_label: "#1", parent_label: reported.number, action: "created" },
			{ subject_label: "#2", parent_label: reported.number, action: "created" },
		]);
	});

	test("the portal and the office read the fault and the photos back", async () => {
		const portal = await as(riedel, () => data(getPortalOrder, reported.number));
		expect(portal.order).toMatchObject({
			fault: "door_wont_close",
			photos: photoIds.map((id) => ({ id: Number(id) })),
		});
		const office = await as(shltr.member, () => data(getOrder, reported.number));
		expect(office.request).toMatchObject({
			fault: "door_wont_close",
			photos: photoIds.map((id) => ({ id: Number(id) })),
		});
	});

	test("serves a photo to the contact and the office, as stored", async () => {
		const own = await photo(riedel, photoIds[0]);
		expect(own).toMatchObject({ status: 200, type: "image/jpeg" });
		expect(own.bytes?.slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
		expect(await photo(shltr.member, photoIds[1])).toMatchObject({
			status: 200,
			type: "image/png",
		});
	});

	test("is a 404 for anyone who may not read the order, also by a tampered id", async () => {
		// Another customer's contact of the same tenant.
		expect(await photo(weggemans, photoIds[0])).toMatchObject({ status: 404 });
		// An engineer the order isn't theirs (it awaits acceptance: no one's).
		expect(await photo(shltr.engineer, photoIds[0])).toMatchObject({ status: 404 });
		// Other tenants, their office and their contacts.
		expect(await photo(north.owner, photoIds[0])).toMatchObject({ status: 404 });
		expect(await photo(south.owner, photoIds[0])).toMatchObject({ status: 404 });
		expect(await photo(north.customer, photoIds[0])).toMatchObject({ status: 404 });
		// Not a photo's id at all.
		expect(await photo(riedel, "999999")).toMatchObject({ status: 404 });
		expect(await photo(riedel, "1 or 1=1")).toMatchObject({ status: 404 });
		// Signed out: no tenant to read it in.
		expect((await photo(null, photoIds[0])).status).toBe(401);
	});

	test("another tenant's portal doesn't list them either", async () => {
		expect(await as(north.customer, () => call(getPortalOrder, reported.number))).toMatchObject({
			status: 404,
		});
		expect(await as(south.owner, () => call(getOrder, reported.number))).toMatchObject({
			status: 404,
		});
	});
});

describe("the limits", () => {
	const refusedOnPhotos = async (photos: File[], message: string) => {
		const [orders, stored] = [await orderCount(), await photoCount()];
		const answer = await report({ photos });
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(expect.objectContaining({ name: "photos", message }));
		expect([await orderCount(), await photoCount()]).toEqual([orders, stored]);
	};

	test("at most five photos", async () => {
		await refusedOnPhotos(
			Array.from({ length: 6 }, (_, i) => jpeg(`${i}.jpg`)),
			"Add at most 5 photos.",
		);
	});

	test("images only, by their bytes, whatever type they claim", async () => {
		const fake = new File(["<svg onload=alert(1)>"], "deur.jpg", { type: "image/jpeg" });
		await refusedOnPhotos([fake], "Only photos can be added (JPEG, PNG or WebP).");
		const svg = new File(["<svg/>"], "deur.svg", { type: "image/svg+xml" });
		await refusedOnPhotos([svg], "Only photos can be added (JPEG, PNG or WebP).");
	});

	test("each at most 2 MB", async () => {
		await refusedOnPhotos([jpeg("groot.jpg", MAX_PHOTO_BYTES)], "A photo can be at most 2 MB.");
	});

	test("a report without photos or a fault is still a report", async () => {
		expect(await report({})).toMatchObject({ status: 303 });
		const { id } = await latest();
		expect(await value(`select fault from order_request where order_id = ?`, [id])).toBeNull();
		expect(await value(`select count(*) from order_photo where order_id = ?`, [id])).toBe(0);
	});

	test("a fault that isn't one of the chips is refused", async () => {
		const answer = await report({ fault: "fire" });
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(expect.objectContaining({ name: "fault" }));
	});
});
