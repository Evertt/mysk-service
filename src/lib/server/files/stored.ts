/**
 * Records' files in a store (`./store.ts`): the orders' photos (`order_photo`) and the units'
 * documents (`equipment_document`) keep theirs this one way. A row records each file (its key, type
 * and size); the file is in the store under that key, which starts with the tenant's id and the
 * kind's own prefix (`<tenant>/orders/`, `<tenant>/equipment/`), so a sweep of one kind never sees
 * another's. A store is never written inside a transaction (on Cloudflare one holds every other
 * request):
 *
 * - adding: `withStoredFiles()` puts the files first, outside it, then runs what records them in a
 *   transaction of its own; should that fail, the stored files are deleted again;
 * - deleting: the transaction deletes the rows and answers their keys, whose files are deleted once
 *   it has committed (`discardFiles()`);
 * - whatever was missed (a server stopped between the two, a delete that failed, a record deleted
 *   with its parent) the daily run's `sweepFiles()` deletes: stored files no row points to.
 *
 * `serveStoredFile()` answers a file to whoever may read its record (the access registry), a 404
 * for anyone else.
 */
import { error } from "@sveltejs/kit";

import { type RecordRef, readOrNotFound } from "#lib/server/access/index.ts";
import { currentTenant, requireTenant } from "#lib/server/auth/index.ts";
import { orNotFound } from "#lib/server/records.ts";

import type { FileStore } from "./store.ts";

/** A file to put in a store, under the key it will have. */
export interface FileToStore {
	objectKey: string;
	bytes: Uint8Array;
	contentType: string;
}

/** A file put in a store, not yet recorded. */
export interface StoredFile {
	objectKey: string;
	contentType: string;
	size: number;
}

/**
 * Deletes the files `keys` from `store`, once nothing points to them any more: after the
 * transaction that deleted their rows committed, or when the one that was to record them failed. A
 * file that can't be deleted now is logged and left to the daily sweep (`sweepFiles()`), so it never
 * fails what came before.
 */
export async function discardFiles(store: FileStore, keys: readonly string[]) {
	const results = await Promise.allSettled(keys.map((key) => store.delete(key)));
	results.forEach((result, i) => {
		if (result.status === "rejected") {
			console.error(`Couldn't delete the file ${keys[i]}; the daily sweep will:`, result.reason);
		}
	});
}

/**
 * Puts `files` in `store`, outside any transaction. Should one fail to be stored, those that were
 * are deleted again, and its error thrown.
 */
export async function storeFiles(
	store: FileStore,
	files: readonly FileToStore[],
): Promise<StoredFile[]> {
	const results = await Promise.allSettled(
		files.map(async ({ objectKey, bytes, contentType }) => {
			await store.put(objectKey, bytes, contentType);
			return { objectKey, contentType, size: bytes.byteLength };
		}),
	);
	const stored = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
	const failed = results.find((result) => result.status === "rejected");
	if (failed) {
		await discardFiles(
			store,
			stored.map((file) => file.objectKey),
		);
		throw failed.reason;
	}
	return stored;
}

/**
 * Stores `files` (`storeFiles()`, outside any transaction), then runs `record` with them, which
 * records them in a transaction of its own; should it fail, the stored files are deleted again and
 * its error thrown.
 */
export async function withStoredFiles<T>(
	store: FileStore,
	files: readonly FileToStore[],
	record: (stored: StoredFile[]) => Promise<T>,
): Promise<T> {
	const stored = await storeFiles(store, files);
	try {
		return await record(stored);
	} catch (thrown) {
		await discardFiles(
			store,
			stored.map((file) => file.objectKey),
		);
		throw thrown;
	}
}

/** How old a stored file must be before the sweep may delete it: a day, past any form in flight. */
const SWEEP_AFTER = { hours: 24 };

/** What a sweep goes through: one kind's files of the tenant, and which of them rows point to. */
interface Sweep {
	store: FileStore;
	/** The kind's prefix in the tenant (`photoPrefix()`, `documentPrefix()`). */
	prefix: (organizationId: string) => string;
	/** Of `keys`, those a row of the tenant points to (one statement: `inList()`). */
	referenced: (keys: readonly string[]) => Promise<readonly string[]>;
}

/**
 * Deletes the tenant's files under `sweep`'s prefix that no row points to and that were stored more
 * than a day before `now`: those a deletion or a failed form left behind. A younger one may belong
 * to a form still being recorded, so it stays. For the daily run (`runDaily()`), as the system.
 * Answers how many it deleted.
 */
export async function sweepFiles(
	{ store, prefix, referenced }: Sweep,
	now = Temporal.Now.instant(),
): Promise<number> {
	const { organizationId } = currentTenant();
	const before = now.subtract(SWEEP_AFTER);
	const old = (await store.list(prefix(organizationId)))
		.filter((file) => Temporal.Instant.compare(file.storedAt, before) < 0)
		.map((file) => file.key);
	if (!old.length) return 0;
	const pointedTo = new Set(await referenced(old));
	const orphans = old.filter((key) => !pointedTo.has(key));
	await discardFiles(store, orphans);
	return orphans.length;
}

/** A stored file as a record's row has it, and how a browser should take it. */
interface FileRow {
	objectKey: string;
	contentType: string;
	/**
	 * Its name, for the browser to save it by, and whether it opens in the browser (`inline`, a PDF or
	 * an image) or is saved (`attachment`). Without it, it's shown as it is (an order's photo).
	 */
	disposition?: { filename: string; inline: boolean };
}

/** `filename` as a header's quoted string: ASCII only, without quotes or backslashes. */
const asciiName = (filename: string) =>
	filename.normalize("NFKD").replace(/[^\x20-\x7e]|["\\]/g, "_");

/** The `Content-Disposition` of `disposition`, with the name in UTF-8 too (RFC 6266). */
const dispositionHeader = ({ filename, inline }: NonNullable<FileRow["disposition"]>) =>
	`${inline ? "inline" : "attachment"}; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

/**
 * The stored file of `subject` (whose id is a row's, from a URL), for a signed-in member who may
 * read it (the access registry: a 401 signed out, a 404 for anyone else, also another tenant's and
 * a tampered id), found by `find` and read from `store`. Served as stored, cached by their browser
 * only, never sniffed into another type.
 */
export async function serveStoredFile(
	subject: RecordRef & { id: string },
	find: (id: number) => Promise<FileRow | undefined>,
	store: FileStore,
): Promise<Response> {
	requireTenant();
	if (!/^[1-9]\d{0,14}$/.test(subject.id)) error(404, m.common_error_not_found());
	await readOrNotFound(subject);
	const row = orNotFound(await find(Number(subject.id)), m.common_error_not_found());
	const bytes = orNotFound(await store.get(row.objectKey), m.common_error_not_found());
	return new Response(bytes, {
		headers: {
			"content-type": row.contentType,
			"content-length": String(bytes.byteLength),
			"cache-control": "private, max-age=86400",
			"x-content-type-options": "nosniff",
			...(row.disposition && { "content-disposition": dispositionHeader(row.disposition) }),
		},
	});
}
