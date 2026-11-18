import type { Bucket } from "#lib/server/db/durable.ts";

/**
 * An R2 bucket in memory: its objects (each with when it was uploaded, which a spec may set back),
 * and the bucket. It lists `pageSize` objects a page, as R2 does 1,000, so a spec sees the paging.
 */
export function memoryBucket({ pageSize = 1000 } = {}) {
	const objects = new Map<string, { value: Uint8Array; options?: object; uploaded: Date }>();
	const bucket: Bucket = {
		put: async (key, value, options) =>
			void objects.set(key, { value, options, uploaded: new Date() }),
		get: async (key) => {
			const found = objects.get(key);
			return found ? { arrayBuffer: async () => found.value.slice().buffer } : null;
		},
		delete: async (key) => void objects.delete(key),
		list: async ({ prefix = "", cursor }) => {
			const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
			const start = cursor ? Number(cursor) : 0;
			const page = keys.slice(start, start + pageSize);
			const next = start + pageSize;
			return {
				objects: page.map((key) => ({ key, uploaded: objects.get(key)!.uploaded })),
				truncated: next < keys.length,
				...(next < keys.length && { cursor: String(next) }),
			};
		},
	};
	return { objects, bucket };
}
