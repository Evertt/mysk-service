/**
 * Where the recordings of bug reports are kept: on Cloudflare the `BUG_REPORTS` R2 bucket
 * (`wrangler.jsonc`), elsewhere a folder (`BUG_REPORTS_DIR`, `.bug-reports` by default): a file
 * store (`#lib/server/files/store.ts`) of gzipped recordings, so the upload and the replay pages
 * don't care which.
 */
import type { Bucket } from "#lib/server/db/durable.ts";
import * as files from "#lib/server/files/store.ts";

import { bugReportSettings } from "./settings.ts";

/** A store of recordings, by key. */
export interface BugReportStore {
	put(key: string, data: Uint8Array): Promise<void>;
	/** The recording under `key`, or `null` if there's none. */
	get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
}

/** `store`, for gzipped recordings. */
const ofRecordings = (store: files.FileStore): BugReportStore => ({
	put: (key, data) => store.put(key, data, "application/gzip"),
	get: (key) => store.get(key),
});

/** A store in an R2 bucket. */
export const bucketStore = (bucket: Bucket) => ofRecordings(files.bucketStore(bucket));

/** A store in a folder, each key a path in it. */
export const folderStore = (folder: string) => ofRecordings(files.folderStore(folder));

/**
 * The request's store: on Cloudflare the R2 bucket, which `cloudflare/entry.ts` passes with each
 * request in `durableRequests` (SvelteKit's adapter passes no `platform`), else the folder.
 */
export const bugReportStore = () =>
	ofRecordings(files.storeOf("bugReports", bugReportSettings.folder));

/** The key of a report's recording, by when it was made: `<year>/<month>/<id>.json.gz` (UTC). */
export function objectKey(id: string, at: Temporal.Instant) {
	const { year, month } = at.toZonedDateTimeISO("UTC");
	return `${year}/${String(month).padStart(2, "0")}/${id}.json.gz`;
}
