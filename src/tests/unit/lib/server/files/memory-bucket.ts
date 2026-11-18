import type { Bucket } from "#lib/server/db/durable.ts";

/** An R2 bucket in memory: its objects, and the bucket. */
export function memoryBucket() {
	const objects = new Map<string, { value: Uint8Array; options?: object }>();
	const bucket: Bucket = {
		put: async (key, value, options) => void objects.set(key, { value, options }),
		get: async (key) => {
			const found = objects.get(key);
			return found ? { arrayBuffer: async () => found.value.slice().buffer } : null;
		},
		delete: async (key) => void objects.delete(key),
	};
	return { objects, bucket };
}
