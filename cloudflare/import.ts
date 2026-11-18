/**
 * `POST /_ops/import` on Cloudflare (`entry.ts`): replaces the Durable Object's data with an export
 * of a libsql database and the files of its file store (`export-database.ts`), with
 * `Authorization: Bearer <OPS_TOKEN>`. The files go to the `PHOTOS` bucket first, under their keys
 * (as a store is always written: before the rows that point to them), then the rows replace the
 * tables'. A file already in the bucket under a key is overwritten; the others stay, and the daily
 * sweep deletes those no row points to any more (`sweepFiles()`). So staging's demo documents and
 * photos (the seed's, `src/lib/server/db/seed/`) are there as they are locally.
 *
 * Apart from `entry.ts`, which needs Cloudflare's runtime, so a spec runs it in Node.
 */
import type { Bucket } from "../src/lib/server/db/durable.ts";

/** A table of an export: its columns, and its rows' values in that order. */
export interface ExportedTable {
	columns: string[];
	rows: (string | number | null)[][];
}

/** A file of an export: its key in the store, its type, and its bytes in base64. */
export interface ExportedFile {
	key: string;
	contentType: string;
	base64: string;
}

/** What `export-database.ts` writes: the tables (parents first) and the store's files. */
export interface DatabaseExport {
	tables: Record<string, ExportedTable>;
	files: ExportedFile[];
}

/** What the import needs of the Worker: its token, its photo bucket, and the object's import. */
interface Importing {
	token: string | undefined;
	photos: Bucket;
	/** Replaces the tables' data (`AppDatabase.import()`), answering what it did. */
	importTables: (tables: DatabaseExport["tables"]) => Promise<object>;
}

/** Whether `request` carries the ops token, compared in constant time (in Node too, for the spec). */
function authorized(request: Request, token: string | undefined) {
	if (!token) return false;
	const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
	const wanted = new TextEncoder().encode(`Bearer ${token}`);
	let difference = given.byteLength ^ wanted.byteLength;
	for (let i = 0; i < wanted.byteLength; i++) difference |= (given[i] ?? 0) ^ wanted[i];
	return difference === 0;
}

/** A key of the store: a relative path of plain parts, as the app makes them (`<tenant>/…`). */
const fileKey = /^[\w-]+(?:\/[\w.-]+)+$/;

/** `body` as an export, checked: else it throws, saying what's wrong. */
function exportOf(body: unknown): DatabaseExport {
	const { tables, files } = (body ?? {}) as Partial<DatabaseExport>;
	if (typeof tables !== "object" || tables === null || !Array.isArray(files)) {
		throw new Error("Not an export: it has no tables and files (cloudflare/export-database.ts)");
	}
	const bad = files.filter(
		(file) =>
			typeof file?.key !== "string" ||
			!fileKey.test(file.key) ||
			file.key.split("/").includes("..") ||
			typeof file.contentType !== "string" ||
			typeof file.base64 !== "string",
	);
	if (bad.length) throw new Error(`Not files of the store: ${bad.map((f) => f?.key).join(", ")}`);
	return { tables, files };
}

/** The bytes of `base64`. */
const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

/**
 * Answers `POST /_ops/import`: a 405 for another method, a 403 without the ops token (before the
 * body is read), else the files put in the bucket and the tables replaced, answered as JSON (the
 * rows per table and the files stored); a 500 with the reason when the export is refused or fails,
 * for whoever imports (CI prints it), not Cloudflare's bare 1101.
 */
export async function answerImport(
	request: Request,
	{ token, photos, importTables }: Importing,
): Promise<Response> {
	if (request.method !== "POST") return new Response(null, { status: 405 });
	if (!authorized(request, token)) return new Response(null, { status: 403 });
	try {
		const { tables, files } = exportOf(await request.json());
		for (const { key, contentType, base64 } of files) {
			await photos.put(key, bytesOf(base64), { httpMetadata: { contentType } });
		}
		return Response.json({ ...(await importTables(tables)), files: files.length });
	} catch (error) {
		return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
	}
}
