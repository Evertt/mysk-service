/**
 * The orders' photo files never outlive their rows for long, in a folder (Node) and in an R2 bucket
 * (Cloudflare, here in memory): deleting an order deletes its photos' files once its transaction
 * has committed; a report that fails after its files were stored deletes them again; a file that
 * couldn't be stored takes the others it came with along; and the daily sweep deletes the files no
 * photo points to that are older than a day, of its own tenant only.
 */
import { existsSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { deleteOrder } from "#lib/orders/order.remote.ts";
import { reportOrder } from "#lib/orders/server/acceptance.ts";
import { storeOrderPhotos, sweepOrderPhotos, withStoredPhotos } from "#lib/orders/server/photos.ts";
import { photoKey } from "#lib/server/files/photos.ts";
import { bucketStore, type FileStore, folderStore } from "#lib/server/files/store.ts";
import { runDaily } from "#lib/server/jobs/daily.ts";
import { reportBreakdown } from "#routes/(customer)/portal/client.remote.ts";
import { memoryBucket } from "#unit/lib/server/files/memory-bucket.ts";
import {
	as,
	asSystem,
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
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "photo-cleanup-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

/** The photo store the app uses in this test: a folder, or a bucket in memory (`kinds` below). */
const current = vi.hoisted(() => ({ store: undefined as unknown }));
vi.mock(import("#lib/server/files/photos.ts"), async (original) => ({
	...(await original()),
	photoStore: () => current.store as FileStore,
}));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

const shltrId = organizationId("shltr");
const northId = organizationId("north");
const riedel = shltr.customer;

const jpeg = (name = "deur.jpg") =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], name, { type: "image/jpeg" });

/** A store of each kind, with a way to make one of its files `hours` old. */
const kinds = {
	folder: () => {
		const store = folderStore(settings.photosFolder);
		return {
			store,
			age: (key: string, hours: number) => {
				const at = new Date(Date.now() - hours * 3600_000);
				utimesSync(join(settings.photosFolder, key), at, at);
			},
			has: async (key: string) => existsSync(join(settings.photosFolder, key)),
		};
	},
	bucket: () => {
		const { objects, bucket } = memoryBucket({ pageSize: 2 });
		return {
			store: bucketStore(bucket),
			age: (key: string, hours: number) => {
				objects.get(key)!.uploaded = new Date(Date.now() - hours * 3600_000);
			},
			has: async (key: string) => objects.has(key),
		};
	},
};

let unitId: number;

describe.each(Object.entries(kinds))("in a %s", (_, make) => {
	let kind: ReturnType<(typeof kinds)["folder"]>;

	beforeEach(async () => {
		kind = make();
		current.store = kind.store;
		unitId ??= await value<number>(
			`select e.id from equipment e join customer c on c.id = e.customer_id
			 where c.name = 'Riedel B.V.' order by e.id limit 1`,
		);
	});

	/** Reports a breakdown with `count` photos as Riedel's contact: its id and its photos' keys. */
	async function reported(count: number) {
		const answer = await as(riedel, () =>
			submit(reportBreakdown, {
				unitId: String(unitId),
				description: "De roldeur sluit niet",
				urgency: "normal",
				photos: Array.from({ length: count }, (_, i) => jpeg(`${i}.jpg`)),
			}),
		);
		expect(answer).toMatchObject({ status: 303 });
		const id = await value<number>(
			`select id from "order" where organization_id = ? order by id desc limit 1`,
			[shltrId],
		);
		const keys = (
			await rows<{ object_key: string }>(`select object_key from order_photo where order_id = ?`, [
				id,
			])
		).map((row) => row.object_key);
		return { id, keys };
	}

	test("deleting an order deletes its photos' files", async () => {
		const { id, keys } = await reported(2);
		expect(keys).toHaveLength(2);
		for (const key of keys) expect(await kind.has(key)).toBe(true);
		expect(await as(shltr.member, () => submit(deleteOrder, { id: String(id) }))).toMatchObject({
			status: 303,
		});
		expect(await value(`select count(*) from order_photo where order_id = ?`, [id])).toBe(0);
		for (const key of keys) expect(await kind.has(key)).toBe(false);
	});

	test("a deletion another tenant tries deletes nothing, rows nor files", async () => {
		const { id, keys } = await reported(1);
		expect(await as(south.owner, () => submit(deleteOrder, { id: String(id) }))).toMatchObject({
			status: 404,
		});
		expect(await value(`select count(*) from order_photo where order_id = ?`, [id])).toBe(1);
		expect(await kind.has(keys[0])).toBe(true);
	});

	test("a report that fails after its photos were stored deletes them again", async () => {
		const before = await kind.store.list(`${shltrId}/`);
		const orders = await value<number>(`select count(*) from "order"`);
		// A customer that doesn't exist: the order's transaction fails, after the photos were stored.
		await expect(
			as(riedel, () =>
				reportOrder({
					customerId: 999_999,
					units: [unitId],
					type: "breakdown",
					priority: "normal",
					description: "Kapot",
					photos: [jpeg(), jpeg("2.jpg")],
				}),
			),
		).rejects.toThrow();
		expect(await value<number>(`select count(*) from "order"`)).toBe(orders);
		expect((await kind.store.list(`${shltrId}/`)).length).toBe(before.length);

		// And whatever records them: what it throws is thrown, and nothing stays.
		await expect(
			as(riedel, () =>
				withStoredPhotos([jpeg()], async () => {
					throw new Error("broken");
				}),
			),
		).rejects.toThrow("broken");
		expect((await kind.store.list(`${shltrId}/`)).length).toBe(before.length);
	});

	test("a photo that can't be stored takes the ones stored with it along", async () => {
		const before = (await kind.store.list(`${shltrId}/`)).length;
		let puts = 0;
		current.store = {
			...kind.store,
			put: async (key, data, type) => {
				if (++puts === 2) throw new Error("disk full");
				await kind.store.put(key, data, type);
			},
		} satisfies FileStore;
		await expect(
			as(riedel, () => storeOrderPhotos([jpeg(), jpeg("2.jpg"), jpeg("3.jpg")])),
		).rejects.toThrow("disk full");
		expect((await kind.store.list(`${shltrId}/`)).length).toBe(before);
	});

	test("the sweep deletes the tenant's files no photo points to, once they're a day old", async () => {
		const { keys } = await reported(1);
		const [kept] = keys;
		const orphan = photoKey(shltrId, "jpg");
		const young = photoKey(shltrId, "jpg");
		const northOrphan = photoKey(northId, "jpg");
		for (const key of [orphan, young, northOrphan]) {
			await kind.store.put(key, new Uint8Array([1]), "image/jpeg");
		}
		kind.age(kept, 48);
		kind.age(orphan, 25);
		kind.age(young, 23);
		kind.age(northOrphan, 48);

		expect(await asSystem("shltr", () => sweepOrderPhotos())).toBeGreaterThanOrEqual(1);
		expect(await kind.has(orphan)).toBe(false);
		// Pointed to by a photo, too young (a form may still be recording it), another tenant's.
		expect(await kind.has(kept)).toBe(true);
		expect(await kind.has(young)).toBe(true);
		expect(await kind.has(northOrphan)).toBe(true);

		// North's run sweeps North's.
		expect(await asSystem("north", () => sweepOrderPhotos())).toBe(1);
		expect(await kind.has(northOrphan)).toBe(false);
		// Nothing left to do.
		expect(await asSystem("shltr", () => sweepOrderPhotos())).toBe(0);
	});

	test("the daily run sweeps, and says how many it deleted", async () => {
		const orphan = photoKey(shltrId, "jpg");
		await kind.store.put(orphan, new Uint8Array([1]), "image/jpeg");
		kind.age(orphan, 30);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const results = await signedOut(() => runDaily());
		error.mockRestore();
		const shltrRun = results.find((result) => result.organization.id === shltrId);
		expect(shltrRun?.report).toMatchObject({ "orders.photos_swept": 1 });
		expect(await kind.has(orphan)).toBe(false);
	});
});
