/**
 * Where the app keeps files: on Cloudflare an R2 bucket (a binding in `wrangler.jsonc`, which
 * `cloudflare/entry.ts` passes along with each request in `durableRequests`, since every request
 * runs inside the one Durable Object and SvelteKit's adapter passes no `platform`), elsewhere a
 * folder. One small interface over both, so the code that stores and serves a file doesn't care
 * which. The bug reports' recordings (`#lib/server/bug-reports/storage.ts`) and the orders' photos
 * (`./photos.ts`) are kept in one each.
 *
 * Never write to a store inside a database transaction: on Cloudflare a transaction holds every
 * other request until it's done. Store the file first, then record its row; delete a file once the
 * transaction that let go of its row has committed.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { Bucket, DurableRequest } from "#lib/server/db/durable.ts";

/** A file in a store: its key, and when it was stored (last written). */
interface StoredFile {
	key: string;
	storedAt: Temporal.Instant;
}

/** A store of files, by key. */
export interface FileStore {
	put(key: string, data: Uint8Array, contentType: string): Promise<void>;
	/** The file under `key`, or `null` if there's none. */
	get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
	/** Removes the file under `key`, if there is one. */
	delete(key: string): Promise<void>;
	/** The files whose keys start with `prefix`, each with when it was stored, in no order. */
	list(prefix: string): Promise<StoredFile[]>;
}

/** A store in an R2 bucket, each file with its content type. */
export function bucketStore(bucket: Bucket): FileStore {
	return {
		async put(key, data, contentType) {
			await bucket.put(key, data, { httpMetadata: { contentType } });
		},
		async get(key) {
			const object = await bucket.get(key);
			return object ? new Uint8Array(await object.arrayBuffer()) : null;
		},
		async delete(key) {
			await bucket.delete(key);
		},
		async list(prefix) {
			const found: StoredFile[] = [];
			let cursor: string | undefined;
			// A page at a time (R2 answers 1,000 at most), until the last.
			do {
				const page = await bucket.list({ prefix, cursor });
				for (const object of page.objects) {
					found.push({
						key: object.key,
						storedAt: Temporal.Instant.fromEpochMilliseconds(object.uploaded.getTime()),
					});
				}
				cursor = page.truncated ? page.cursor : undefined;
			} while (cursor);
			return found;
		},
	};
}

/** A store in a folder, each key a path in it (the content type isn't kept). */
export function folderStore(folder: string): FileStore {
	const root = resolve(folder);
	const pathOf = (key: string) => {
		const path = resolve(root, key);
		// Keys are made by the server, but never leave the folder whatever they are.
		if (!path.startsWith(root + sep)) throw new Error(`Not a key of the store: ${key}`);
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
		async delete(key) {
			await rm(pathOf(key), { force: true });
		},
		async list(prefix) {
			// From the deepest folder the prefix names (`org/orders/` reads `<folder>/org/orders`), so
			// listing a tenant's files reads no one else's.
			const slash = prefix.lastIndexOf("/");
			const start = slash > 0 ? pathOf(prefix.slice(0, slash)) : root;
			let names: string[];
			try {
				names = await readdir(start, { recursive: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
				throw error;
			}
			const found: StoredFile[] = [];
			for (const name of names) {
				const path = join(start, name);
				const key = relative(root, path).split(sep).join("/");
				if (!key.startsWith(prefix)) continue;
				const stats = await stat(path);
				if (!stats.isFile()) continue;
				found.push({
					key,
					storedAt: Temporal.Instant.fromEpochMilliseconds(Math.floor(stats.mtimeMs)),
				});
			}
			return found;
		},
	};
}

/** The buckets the entry passes with each request on Cloudflare, by their name there. */
export type BucketName = Exclude<keyof DurableRequest, "storage">;

/**
 * The request's store of `bucket`: on Cloudflare the R2 bucket the entry passes along, else the
 * folder `folder`.
 */
export function storeOf(bucket: BucketName, folder: string): FileStore {
	const found = globalThis.durableRequests?.getStore()?.[bucket];
	return found ? bucketStore(found) : folderStore(folder);
}
