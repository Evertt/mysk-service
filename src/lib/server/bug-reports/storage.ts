/**
 * Where the recordings of bug reports are kept: on Cloudflare the `BUG_REPORTS` R2 bucket
 * (`wrangler.jsonc`), elsewhere a folder (`BUG_REPORTS_DIR`, `.bug-reports` by default). One small
 * interface over both, so the upload and the replay pages don't care which.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import type { Bucket } from "#lib/server/db/durable.ts";

import { bugReportSettings } from "./settings.ts";

/** A store of recordings, by key. */
export interface BugReportStore {
	put(key: string, data: Uint8Array): Promise<void>;
	/** The recording under `key`, or `null` if there's none. */
	get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
}

/** A store in an R2 bucket. */
export function bucketStore(bucket: Bucket): BugReportStore {
	return {
		async put(key, data) {
			await bucket.put(key, data, { httpMetadata: { contentType: "application/gzip" } });
		},
		async get(key) {
			const object = await bucket.get(key);
			return object ? new Uint8Array(await object.arrayBuffer()) : null;
		},
	};
}

/** A store in a folder, each key a path in it. */
export function folderStore(folder: string): BugReportStore {
	const root = resolve(folder);
	const pathOf = (key: string) => {
		const path = resolve(root, key);
		// Keys are made by the server, but never leave the folder whatever they are.
		if (!path.startsWith(root + sep)) throw new Error(`Not a bug report's key: ${key}`);
		return path;
	};
	return {
		async put(key, data) {
			const path = pathOf(key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, data);
		},
		async get(key) {
			try {
				return new Uint8Array(await readFile(pathOf(key)));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
		},
	};
}

/**
 * The request's store: on Cloudflare the R2 bucket, which `cloudflare/entry.ts` passes with each
 * request in `durableRequests` (SvelteKit's adapter passes no `platform`), else the folder.
 */
export function bugReportStore(): BugReportStore {
	const bucket = globalThis.durableRequests?.getStore()?.bugReports;
	return bucket ? bucketStore(bucket) : folderStore(bugReportSettings.folder);
}

/** The key of a report's recording, by when it was made: `<year>/<month>/<id>.json.gz` (UTC). */
export function objectKey(id: string, at: Temporal.Instant) {
	const { year, month } = at.toZonedDateTimeISO("UTC");
	return `${year}/${String(month).padStart(2, "0")}/${id}.json.gz`;
}
