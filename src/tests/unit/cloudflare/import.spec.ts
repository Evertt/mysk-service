/**
 * `POST /_ops/import` on Cloudflare (`cloudflare/import.ts`), with the `PHOTOS` bucket in memory:
 * only with the ops token (no token set, a wrong one, another method: nothing read, nothing
 * written); an export's files put in the bucket under their keys and types before its tables are
 * replaced; and an export it refuses (no files list, a key outside the store's) writes nothing.
 */
import { describe, expect, test, vi } from "vite-plus/test";

import { memoryBucket } from "#unit/lib/server/files/memory-bucket.ts";

import { answerImport, type DatabaseExport } from "../../../../cloudflare/import.ts";

const pdf = new TextEncoder().encode("%PDF-1.4 demo");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const anExport: DatabaseExport = {
	tables: { organization: { columns: ["id", "name"], rows: [["org-shltr", "SHLTR"]] } },
	files: [
		{ key: "org-shltr/equipment/seed-1.pdf", contentType: "application/pdf", base64: base64(pdf) },
		{ key: "org-shltr/orders/seed-story-1.png", contentType: "image/png", base64: base64(png) },
	],
};

/** A request to the import, with `authorization` if given. */
const request = (body: unknown, { authorization = "Bearer ops", method = "POST" } = {}) =>
	new Request("https://worker.example/_ops/import", {
		method,
		headers: { "content-type": "application/json", ...(authorization && { authorization }) },
		...(method === "POST" && { body: JSON.stringify(body) }),
	});

/** The import with the bucket in memory, the token `token`, and the tables' import a spy. */
function worker(token: string | undefined = "ops") {
	const { objects, bucket } = memoryBucket();
	const importTables = vi.fn(async (tables: DatabaseExport["tables"]) => ({
		counts: Object.fromEntries(Object.entries(tables).map(([name, t]) => [name, t.rows.length])),
	}));
	const answer = (req: Request) => answerImport(req, { token, photos: bucket, importTables });
	return { objects, importTables, answer };
}

describe("the ops token", () => {
	test.each([
		["no token is set", undefined, "Bearer "],
		["no token is set, whatever is sent", undefined, "Bearer undefined"],
		["the token is wrong", "ops", "Bearer other"],
		["the token is longer", "ops", "Bearer opss"],
		["it's not a bearer", "ops", "ops"],
		["none is sent", "ops", ""],
	])("is refused when %s, and nothing is read or written", async (_, token, authorization) => {
		const { objects, importTables, answer } = worker(token);
		const response = await answer(request(anExport, { authorization }));
		expect(response.status).toBe(403);
		expect(objects.size).toBe(0);
		expect(importTables).not.toHaveBeenCalled();
	});

	test("only takes a POST", async () => {
		const { objects, importTables, answer } = worker();
		expect((await answer(request(undefined, { method: "GET" }))).status).toBe(405);
		expect(objects.size).toBe(0);
		expect(importTables).not.toHaveBeenCalled();
	});
});

describe("with the token", () => {
	test("puts the export's files in the bucket, then replaces the tables", async () => {
		const { objects, importTables, answer } = worker();
		const response = await answer(request(anExport));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ counts: { organization: 1 }, files: 2 });
		expect(importTables).toHaveBeenCalledWith(anExport.tables);
		expect([...objects.keys()].toSorted()).toEqual([
			"org-shltr/equipment/seed-1.pdf",
			"org-shltr/orders/seed-story-1.png",
		]);
		const stored = objects.get("org-shltr/equipment/seed-1.pdf")!;
		expect(stored.value).toEqual(pdf);
		expect(stored.options).toEqual({ httpMetadata: { contentType: "application/pdf" } });
		expect(objects.get("org-shltr/orders/seed-story-1.png")!.value).toEqual(png);
	});

	test("overwrites a file under the same key, and leaves the others", async () => {
		const { objects, answer } = worker();
		objects.set("org-shltr/equipment/seed-1.pdf", { value: png, uploaded: new Date(0) });
		objects.set("org-shltr/orders/kept.jpg", { value: png, uploaded: new Date(0) });
		expect((await answer(request(anExport))).status).toBe(200);
		expect(objects.get("org-shltr/equipment/seed-1.pdf")!.value).toEqual(pdf);
		expect(objects.has("org-shltr/orders/kept.jpg")).toBe(true);
	});

	test.each([
		["no files list", { tables: anExport.tables }],
		["no tables", { files: [] }],
		[
			"a key outside the store's",
			{ ...anExport, files: [{ ...anExport.files[0], key: "org-shltr/../../etc/passwd" }] },
		],
		["an absolute key", { ...anExport, files: [{ ...anExport.files[0], key: "/org/x.pdf" }] }],
	])("refuses an export with %s, saying why, and writes nothing", async (_, body) => {
		const { objects, importTables, answer } = worker();
		const response = await answer(request(body));
		expect(response.status).toBe(500);
		expect(await response.text()).toMatch(/^Not /);
		expect(objects.size).toBe(0);
		expect(importTables).not.toHaveBeenCalled();
	});

	test("answers why the tables' import failed", async () => {
		const { answer, importTables } = worker();
		importTables.mockRejectedValueOnce(new Error("Not tables of the database: nope"));
		const response = await answer(request(anExport));
		expect(response.status).toBe(500);
		expect(await response.text()).toBe("Not tables of the database: nope");
	});
});
