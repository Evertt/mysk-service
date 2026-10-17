import { AsyncLocalStorage } from "node:async_hooks";

import { afterEach, describe, expect, test } from "vite-plus/test";

import type { DurableRequest } from "#lib/server/db/durable.ts";
import { inThisRequest } from "#lib/server/db/index.ts";

describe("inThisRequest", () => {
	afterEach(() => {
		globalThis.durableRequests = undefined;
	});

	test("runs work in the Durable Object request it was made in, from outside it", async () => {
		const requests = new AsyncLocalStorage<DurableRequest>();
		globalThis.durableRequests = requests;
		const request = { storage: {} } as DurableRequest;
		const again = requests.run(request, () => inThisRequest());
		// As a live query's generator is resumed: by the stream, outside the request.
		expect(requests.getStore()).toBeUndefined();
		expect(await again(async () => requests.getStore())).toBe(request);
	});

	test("just runs the work off Cloudflare", () => {
		const again = inThisRequest();
		expect(again(() => 42)).toBe(42);
	});
});
