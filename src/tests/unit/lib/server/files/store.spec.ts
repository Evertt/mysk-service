import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, expect, test, vi } from "vite-plus/test";

import type { DurableRequest } from "#lib/server/db/durable.ts";
import { photoKey, photoStore } from "#lib/server/files/photos.ts";
import { bucketStore, folderStore } from "#lib/server/files/store.ts";

import { memoryBucket } from "./memory-bucket.ts";

const folder = mkdtempSync(join(tmpdir(), "file-store-spec-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const settings = vi.hoisted(() => ({ photosFolder: "" }));
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));
settings.photosFolder = join(folder, "photos");

afterEach(() => {
	globalThis.durableRequests = undefined;
});

test("keeps files in a folder, by their keys as paths, and removes them", async () => {
	const store = folderStore(folder);
	const data = new Uint8Array([1, 2, 3]);
	await store.put("org/orders/a.jpg", data, "image/jpeg");
	expect(readFileSync(join(folder, "org/orders/a.jpg"))).toEqual(Buffer.from(data));
	expect(await store.get("org/orders/a.jpg")).toEqual(data);
	await store.delete("org/orders/a.jpg");
	expect(await store.get("org/orders/a.jpg")).toBeNull();
	// Removing what isn't there is no error.
	await store.delete("org/orders/a.jpg");
});

test("never reads, writes or removes outside its folder", async () => {
	const store = folderStore(folder);
	await expect(store.put("../outside.jpg", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
		"Not a key of the store",
	);
	await expect(store.get("../../etc/passwd")).rejects.toThrow("Not a key of the store");
	await expect(store.delete("../x")).rejects.toThrow("Not a key of the store");
});

test("keeps files in an R2 bucket with their content type", async () => {
	const { objects, bucket } = memoryBucket();
	const store = bucketStore(bucket);
	await store.put("org/orders/b.webp", new Uint8Array([9]), "image/webp");
	expect(objects.get("org/orders/b.webp")?.options).toEqual({
		httpMetadata: { contentType: "image/webp" },
	});
	expect(await store.get("org/orders/b.webp")).toEqual(new Uint8Array([9]));
	await store.delete("org/orders/b.webp");
	expect(objects.size).toBe(0);
});

test("on Cloudflare, the photos go to the bucket the Durable Object passes along; else the folder", async () => {
	const { objects, bucket } = memoryBucket();
	const requests = new AsyncLocalStorage<DurableRequest>();
	globalThis.durableRequests = requests;
	const request = { storage: {}, bugReports: memoryBucket().bucket, photos: bucket };
	await requests.run(request as DurableRequest, () =>
		photoStore().put("org/orders/cf.jpg", new Uint8Array([1]), "image/jpeg"),
	);
	expect(objects.has("org/orders/cf.jpg")).toBe(true);
	expect(existsSync(settings.photosFolder)).toBe(false);

	globalThis.durableRequests = undefined;
	await photoStore().put("org/orders/node.jpg", new Uint8Array([2]), "image/jpeg");
	expect(readFileSync(join(settings.photosFolder, "org/orders/node.jpg"))).toEqual(
		Buffer.from([2]),
	);
});

test("keys a photo by its tenant, uniquely", () => {
	const key = photoKey("org-1", "jpg");
	expect(key).toMatch(/^org-1\/orders\/[0-9a-f-]{36}\.jpg$/);
	expect(photoKey("org-1", "jpg")).not.toBe(key);
});
