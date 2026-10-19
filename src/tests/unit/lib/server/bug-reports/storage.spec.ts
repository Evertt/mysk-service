import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect, test } from "vite-plus/test";

import { bucketStore, folderStore, objectKey } from "#lib/server/bug-reports/storage.ts";

const folder = mkdtempSync(join(tmpdir(), "bug-reports-spec-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("keys a recording by the year and month it was made, in UTC", () => {
	expect(objectKey("abc", Temporal.Instant.from("2026-10-19T09:30:00Z"))).toBe(
		"2026/10/abc.json.gz",
	);
	expect(objectKey("abc", Temporal.Instant.from("2026-12-31T23:30:00-02:00"))).toBe(
		"2027/01/abc.json.gz",
	);
});

test("keeps recordings in a folder, by their keys as paths", async () => {
	const store = folderStore(folder);
	const data = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);
	await store.put("2026/10/abc.json.gz", data);
	expect(readFileSync(join(folder, "2026/10/abc.json.gz"))).toEqual(Buffer.from(data));
	expect(await store.get("2026/10/abc.json.gz")).toEqual(data);
	expect(await store.get("2026/10/missing.json.gz")).toBeNull();
});

test("never reads or writes outside its folder", async () => {
	const store = folderStore(folder);
	await expect(store.put("../outside.json.gz", new Uint8Array([1]))).rejects.toThrow(
		"Not a bug report's key",
	);
	await expect(store.get("../../etc/passwd")).rejects.toThrow("Not a bug report's key");
});

test("keeps recordings in an R2 bucket, as gzip", async () => {
	const objects = new Map<string, { value: Uint8Array; options?: object }>();
	const store = bucketStore({
		put: async (key, value, options) => void objects.set(key, { value, options }),
		get: async (key) => {
			const found = objects.get(key);
			return found ? { arrayBuffer: async () => found.value.slice().buffer } : null;
		},
	});
	const data = new Uint8Array([0x1f, 0x8b, 9]);
	await store.put("2026/10/r2.json.gz", data);
	expect(objects.get("2026/10/r2.json.gz")?.options).toEqual({
		httpMetadata: { contentType: "application/gzip" },
	});
	expect(await store.get("2026/10/r2.json.gz")).toEqual(data);
	expect(await store.get("nothing")).toBeNull();
});
