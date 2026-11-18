/**
 * A unit's documents: what the office's upload stores and logs, the limits and the file's own
 * bytes the server holds it to, how `/documents/<id>` serves it (inline or saved, by its name,
 * never sniffed), renaming and deleting, and who reads them: the office, every engineer, the
 * customer's contacts who see the unit's site; a 404 for anyone else (another customer's contact,
 * another tenant, a site-limited contact for a unit at another site), also by tampered ids. Then
 * the clean-up: a deleted unit's files, and the daily sweep of the documents' files, which the
 * photos' sweep leaves alone (and the other way round). The seed's demo documents are checked too.
 */
import { existsSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { isHttpError } from "@sveltejs/kit";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import {
	addDocument,
	deleteDocument,
	editDocument,
	getUnitDocuments,
} from "#lib/equipment/documents/documents.remote.ts";
import { MAX_DOCUMENT_BYTES } from "#lib/equipment/documents/documents.ts";
import { deleteEquipment } from "#lib/equipment/equipment.remote.ts";
import { sweepUnitDocuments } from "#lib/equipment/server/documents.ts";
import { sweepOrderPhotos } from "#lib/orders/server/photos.ts";
import { demoPdf } from "#lib/server/db/seed/documents.ts";
import { documentKey, photoKey } from "#lib/server/files/keys.ts";
import { folderStore } from "#lib/server/files/store.ts";
import { sniffType } from "#lib/server/files/types.ts";
import { runDaily } from "#lib/server/jobs/daily.ts";
import { GET } from "#routes/documents/[id]/+server.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	asSystem,
	call,
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

import { expectSiteLimited } from "../../server/site-limited.test-support.ts";

const settings = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "unit-documents-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

const shltrId = organizationId("shltr");
const northId = organizationId("north");
/** Riedel's facilities contact (all of Riedel's sites), SHLTR's. */
const riedel = shltr.customer;
/** Another of SHLTR's customers' contact. */
const weggemans = demoAccount("rob@weggemans.example");

const pdf = (name = "handleiding.pdf", size = 0) =>
	new File([demoPdf(["Handleiding"]), new Uint8Array(size)], name, { type: "application/pdf" });

/** Bytes of a ZIP whose central directory names `entries`: an Office file's shape, for the sniff. */
const zip = (entries: string[]) =>
	new Uint8Array([
		0x50,
		0x4b,
		0x03,
		0x04,
		...[...`${entries.join("\0")}\0`].map((char) => char.charCodeAt(0)),
	]);
const docx = () =>
	new File([zip(["[Content_Types].xml", "word/document.xml"])], "schema.docx", {
		type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	});

/** SHLTR's Sectionaaldeur D-07 at Riedel ("Sectionaaldeur laaddok 07"). */
let unit: { id: number; serial: string };

beforeAll(async () => {
	[unit] = await rows<{ id: number; serial: string }>(
		`select id, serial_number as serial from equipment
		 where organization_id = ? and name = 'Sectionaaldeur laaddok 07'`,
		[shltrId],
	);
});

/** Uploads `file` to `unitId` as `actor`. */
const upload = (
	actor: Actor,
	file: File,
	{ unitId = unit.id, title = "Installatiehandleiding", kind = "manual" } = {},
) => as(actor, () => submit(addDocument, { unitId: String(unitId), title, kind, file }));

/** The latest document's row. */
const latest = async () =>
	(
		await rows<{
			id: number;
			equipment_id: number;
			title: string;
			kind: string;
			object_key: string;
			content_type: string;
			size: number;
			filename: string;
			user_id: string | null;
		}>(`select * from equipment_document order by id desc limit 1`)
	)[0];

const documentCount = () => value<number>(`select count(*) from equipment_document`);

/** `/documents/<id>` as `actor` (signed out if `null`): its status and headers. */
async function download(actor: Actor | null, id: string) {
	const run = async () => {
		try {
			const response = await GET({ params: { id } } as never);
			return {
				status: response.status,
				type: response.headers.get("content-type"),
				disposition: response.headers.get("content-disposition"),
				nosniff: response.headers.get("x-content-type-options"),
				bytes: new Uint8Array(await response.arrayBuffer()),
			};
		} catch (error) {
			if (isHttpError(error)) return { status: error.status };
			throw error;
		}
	};
	return actor ? as(actor, run) : signedOut(run);
}

describe("the seed", () => {
	test("gives SHLTR's D-07 a manual and a CE declaration, as PDFs", async () => {
		const seeded = await rows<{ kind: string; content_type: string; object_key: string }>(
			`select kind, content_type, object_key from equipment_document
			 where equipment_id = ? order by kind`,
			[unit.id],
		);
		expect(seeded.map((row) => row.kind)).toEqual(["declaration", "manual"]);
		for (const row of seeded) {
			expect(row.content_type).toBe("application/pdf");
			expect(row.object_key.startsWith(`${shltrId}/equipment/`)).toBe(true);
		}
		const bytes = demoPdf(["Titel", "Een regel met ö"]);
		expect(sniffType(bytes, ["application/pdf"])).toBe("application/pdf");
		expect(new TextDecoder().decode(bytes.slice(-6))).toBe("%%EOF\n");
	});
});

describe("uploading", () => {
	let id: string;

	beforeAll(async () => {
		expect(await upload(shltr.member, pdf())).toMatchObject({ status: 200 });
		id = String((await latest()).id);
	});

	test("records it on the unit by the uploader, its file under the documents' prefix", async () => {
		const row = await latest();
		expect(row).toMatchObject({
			equipment_id: unit.id,
			title: "Installatiehandleiding",
			kind: "manual",
			content_type: "application/pdf",
			filename: "handleiding.pdf",
		});
		expect(row.user_id).not.toBeNull();
		expect(row.object_key).toMatch(new RegExp(`^${shltrId}/equipment/[0-9a-f-]+\\.pdf$`));
		const file = join(settings.photosFolder, row.object_key);
		expect(readFileSync(file).byteLength).toBe(row.size);
	});

	test("logs it as created on the unit", async () => {
		expect(
			await rows(
				`select action, subject_label, parent_type, parent_label from activity
				 where subject_type = 'equipment_document' and subject_id = ?`,
				[id],
			),
		).toEqual([
			{
				action: "created",
				subject_label: "Installatiehandleiding",
				parent_type: "equipment",
				parent_label: unit.serial,
			},
		]);
	});

	test("the office, the unit's engineers and its customer's contact read it", async () => {
		for (const actor of [shltr.member, shltr.engineer, riedel]) {
			const answer = await as(actor, () => call(getUnitDocuments, unit.serial));
			expect(answer).toMatchObject({ status: 200 });
			const { documents } = (answer as { data: { documents: { id: number }[] } }).data;
			expect(documents.map((document) => document.id)).toContain(Number(id));
		}
	});

	test("serves a PDF to open in the browser, by its name, never sniffed", async () => {
		for (const actor of [shltr.member, shltr.engineer, riedel]) {
			const answer = await download(actor, id);
			expect(answer).toMatchObject({
				status: 200,
				type: "application/pdf",
				disposition: `inline; filename="handleiding.pdf"; filename*=UTF-8''handleiding.pdf`,
				nosniff: "nosniff",
			});
		}
	});

	test("serves a Word file to save, by its name in UTF-8 too", async () => {
		const file = docx();
		const named = new File([file], "Schéma deur.docx", { type: file.type });
		expect(await upload(shltr.member, named, { kind: "drawing" })).toMatchObject({ status: 200 });
		const row = await latest();
		expect(row.content_type).toBe(
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		);
		expect(row.object_key).toMatch(/\.docx$/);
		expect(await download(riedel, String(row.id))).toMatchObject({
			status: 200,
			disposition: `attachment; filename="Sche_ma deur.docx"; filename*=UTF-8''Sch%C3%A9ma%20deur.docx`,
		});
	});

	test("is a 404 for anyone who may not read the unit, also by a tampered id", async () => {
		const unitCases: [Actor, number][] = [
			[weggemans, 404],
			[north.owner, 404],
			[south.owner, 404],
			[north.customer, 404],
		];
		for (const [actor, status] of unitCases) {
			expect(await as(actor, () => call(getUnitDocuments, unit.serial))).toMatchObject({ status });
			expect(await download(actor, id)).toMatchObject({ status });
		}
		expect(await download(null, id)).toMatchObject({ status: 401 });
		expect(await download(riedel, "999999")).toMatchObject({ status: 404 });
		expect(await download(riedel, "abc")).toMatchObject({ status: 404 });
	});
});

describe("what the server takes", () => {
	test("refuses a file that's no PDF, image, Word or Excel file by its bytes, and stores nothing", async () => {
		const before = await documentCount();
		const files = [
			new File(["<html>not a pdf</html>"], "nep.pdf", { type: "application/pdf" }),
			new File([zip(["[Content_Types].xml", "ppt/slide1.xml"])], "dia.docx"),
			new File([], "leeg.pdf", { type: "application/pdf" }),
		];
		for (const file of files) {
			const answer = await upload(shltr.member, file);
			expect(answer).toMatchObject({ status: 400, issues: [{ path: ["file"] }] });
		}
		expect(await documentCount()).toBe(before);
	});

	test("refuses a file over 25 MB", async () => {
		const big = pdf("groot.pdf", MAX_DOCUMENT_BYTES);
		expect(await upload(shltr.member, big)).toMatchObject({
			status: 400,
			issues: [{ path: ["file"], message: "A document may be at most 25 MB." }],
		});
	});

	test("refuses a document without a title or kind", async () => {
		expect(await upload(shltr.member, pdf(), { title: " " })).toMatchObject({ status: 400 });
		expect(await upload(shltr.member, pdf(), { kind: "brochure" })).toMatchObject({
			status: 400,
		});
	});

	test("is the office's: engineers and contacts are refused, other tenants get a 404", async () => {
		const before = await documentCount();
		const files = () => folderStore(settings.photosFolder).list(`${shltrId}/equipment/`);
		const stored = (await files()).length;
		expect(await upload(shltr.engineer, pdf())).toMatchObject({ status: 403 });
		expect(await upload(riedel, pdf())).toMatchObject({ status: 403 });
		// SHLTR's unit's id, tampered into South's and North's forms.
		expect(await upload(south.owner, pdf())).toMatchObject({ status: 404 });
		expect(await upload(north.member, pdf())).toMatchObject({ status: 404 });
		expect(await documentCount()).toBe(before);
		expect((await files()).length).toBe(stored);
	});
});

describe("renaming and deleting", () => {
	let id: string;

	beforeAll(async () => {
		await upload(shltr.member, pdf(), { title: "Tekening oud" });
		id = String((await latest()).id);
	});

	test("another tenant can't, also by a tampered id; nor can a contact or an engineer", async () => {
		const edit = { id, title: "Overgenomen", kind: "other" };
		expect(await as(south.owner, () => submit(editDocument, edit))).toMatchObject({ status: 404 });
		expect(await as(riedel, () => submit(editDocument, edit))).toMatchObject({ status: 403 });
		expect(await as(shltr.engineer, () => submit(deleteDocument, { id }))).toMatchObject({
			status: 403,
		});
		expect(await as(north.owner, () => submit(deleteDocument, { id }))).toMatchObject({
			status: 404,
		});
		expect(await value(`select title from equipment_document where id = ?`, [id])).toBe(
			"Tekening oud",
		);
	});

	test("the office renames it and says its kind, logged on the unit", async () => {
		expect(
			await as(shltr.member, () =>
				submit(editDocument, { id, title: "Maatschets", kind: "drawing" }),
			),
		).toMatchObject({ status: 200 });
		expect(await rows(`select title, kind from equipment_document where id = ?`, [id])).toEqual([
			{ title: "Maatschets", kind: "drawing" },
		]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where subject_type = 'equipment_document'
			 and subject_id = ? and action = 'updated'`,
			[id],
		);
		expect(JSON.parse(entry.changes)).toEqual({
			title: ["Tekening oud", "Maatschets"],
			kind: ["manual", "drawing"],
		});
	});

	test("the office deletes it, its file once that has committed, logged on the unit", async () => {
		const key = await value<string>(`select object_key from equipment_document where id = ?`, [id]);
		expect(existsSync(join(settings.photosFolder, key))).toBe(true);
		expect(await as(shltr.member, () => submit(deleteDocument, { id }))).toMatchObject({
			status: 200,
		});
		expect(await value(`select count(*) from equipment_document where id = ?`, [id])).toBe(0);
		expect(existsSync(join(settings.photosFolder, key))).toBe(false);
		expect(
			await value(
				`select count(*) from activity where subject_type = 'equipment_document'
				 and subject_id = ? and action = 'deleted' and parent_id = ?`,
				[id, String(unit.id)],
			),
		).toBe(1);
	});
});

describe("clean-up", () => {
	test("deleting a unit deletes its documents' files", async () => {
		// A unit no order refers to, so it may be deleted.
		const spare = await value<number>(
			`select id from equipment e where organization_id = ?
			 and not exists (select 1 from order_unit u where u.equipment_id = e.id)
			 and not exists (select 1 from equipment_document d where d.equipment_id = e.id)
			 order by id limit 1`,
			[shltrId],
		);
		expect(await upload(shltr.member, pdf(), { unitId: spare })).toMatchObject({ status: 200 });
		const key = (await latest()).object_key;
		expect(existsSync(join(settings.photosFolder, key))).toBe(true);
		expect(
			await as(shltr.member, () => submit(deleteEquipment, { id: String(spare) })),
		).toMatchObject({ status: 303 });
		expect(
			await value(`select count(*) from equipment_document where equipment_id = ?`, [spare]),
		).toBe(0);
		expect(existsSync(join(settings.photosFolder, key))).toBe(false);
	});

	test("the sweep deletes the tenant's day-old document files no row points to, not the photos'", async () => {
		const store = folderStore(settings.photosFolder);
		const age = (key: string, hours: number) => {
			const at = new Date(Date.now() - hours * 3600_000);
			utimesSync(join(settings.photosFolder, key), at, at);
		};
		await upload(shltr.member, pdf());
		const kept = (await latest()).object_key;
		const orphan = documentKey(shltrId, "pdf");
		const young = documentKey(shltrId, "pdf");
		const northOrphan = documentKey(northId, "pdf");
		const photo = photoKey(shltrId, "jpg");
		for (const key of [orphan, young, northOrphan, photo]) {
			await store.put(key, new Uint8Array([1]), "application/pdf");
		}
		for (const [key, hours] of [
			[kept, 48],
			[orphan, 25],
			[young, 23],
			[northOrphan, 48],
			[photo, 48],
		] as const) {
			age(key, hours);
		}

		expect(await asSystem("shltr", () => sweepUnitDocuments())).toBe(1);
		expect(await store.get(orphan)).toBeNull();
		// Pointed to, too young (a form may still be recording it), another tenant's, a photo.
		for (const key of [kept, young, northOrphan, photo]) {
			expect(await store.get(key)).not.toBeNull();
		}

		// The photos' sweep deletes the orphan photo, and leaves the documents alone.
		expect(await asSystem("shltr", () => sweepOrderPhotos())).toBe(1);
		expect(await store.get(photo)).toBeNull();
		expect(await store.get(kept)).not.toBeNull();
		expect(await store.get(young)).not.toBeNull();

		// The daily run sweeps both, and says how many of each.
		const another = documentKey(shltrId, "pdf");
		await store.put(another, new Uint8Array([1]), "application/pdf");
		age(another, 30);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const results = await signedOut(() => runDaily());
		error.mockRestore();
		const shltrRun = results.find((result) => result.organization.id === shltrId);
		expect(shltrRun?.report).toMatchObject({ "equipment.documents_swept": 1 });
		expect(await store.get(another)).toBeNull();
		const northRun = results.find((result) => result.organization.id === northId);
		expect(northRun?.report).toMatchObject({ "equipment.documents_swept": 1 });
	});
});

describe("a contact limited to some sites", () => {
	test("reads the documents of the units at their sites only (changes the database: last)", async () => {
		await expectSiteLimited((serial) => as(riedel, () => call(getUnitDocuments, serial)));
	});
});
