import { expect, test } from "vite-plus/test";

import type { RecordedRequest } from "#lib/bug-reports/events.ts";
import { describeRequest, trackRequests } from "#lib/bug-reports/requests.ts";

const origin = "http://localhost:5173";

test("names a remote function's call by the function, and a page's data by its path", () => {
	expect(describeRequest("/_app/remote/1x2y3z/getOrder?payload=abc", origin)).toEqual({
		kind: "remote",
		name: "getOrder",
	});
	expect(describeRequest(`${origin}/_app/remote/1x2y3z/updateOrder`, origin)).toEqual({
		kind: "remote",
		name: "updateOrder",
	});
	expect(describeRequest("/docks/__data.json?x-sveltekit-invalidated=01", origin)).toEqual({
		kind: "data",
		name: "/docks",
	});
	expect(describeRequest("/__data.json", origin)).toEqual({ kind: "data", name: "/" });
});

test("leaves out other requests: assets, other origins, the report itself", () => {
	expect(describeRequest("/_app/immutable/chunks/x.js", origin)).toBeUndefined();
	expect(describeRequest("https://example.com/_app/remote/a/b", origin)).toBeUndefined();
	expect(describeRequest("/bug-reports", origin)).toBeUndefined();
});

/** A window whose `fetch` answers `respond`'s response, and a clock that moves 25 ms a call. */
function fakeWindow(respond: () => Promise<Response>) {
	let time = 0;
	const target = { fetch: (() => respond()) as typeof fetch, location: { origin } };
	return { target, now: () => (time += 25) };
}

test("notes each request's status, duration and size, but passes it on untouched", async () => {
	const answer = new Response("{}", { status: 200, headers: { "content-length": "2" } });
	const { target, now } = fakeWindow(async () => answer);
	const original = target.fetch;
	const noted: RecordedRequest[] = [];
	const stop = trackRequests((request) => noted.push(request), target, now);

	expect(await target.fetch("/_app/remote/h/getOrders")).toBe(answer);
	await target.fetch("/_app/remote/h/saveOrder", { method: "post" });
	await target.fetch("/favicon.svg");
	expect(noted).toEqual([
		{ kind: "remote", name: "getOrders", method: "GET", status: 200, durationMs: 25, size: 2 },
		{ kind: "remote", name: "saveOrder", method: "POST", status: 200, durationMs: 25, size: 2 },
	]);

	stop();
	expect(target.fetch).toBe(original);
});

test("notes a request that failed without a response, and still fails it", async () => {
	const { target, now } = fakeWindow(() => Promise.reject(new TypeError("Failed to fetch")));
	const noted: RecordedRequest[] = [];
	trackRequests((request) => noted.push(request), target, now);
	await expect(target.fetch("/orders/__data.json")).rejects.toThrow("Failed to fetch");
	expect(noted).toEqual([
		{ kind: "data", name: "/orders", method: "GET", status: null, durationMs: 25, size: null },
	]);
});

test("stops noting when undone, also when something wrapped fetch since", async () => {
	const { target, now } = fakeWindow(async () => new Response(""));
	const noted: RecordedRequest[] = [];
	const stop = trackRequests((request) => noted.push(request), target, now);
	const tracking = target.fetch;
	const wrapper: typeof fetch = (input, init) => tracking(input, init);
	target.fetch = wrapper;
	stop();
	// The later wrapper stays, and what it calls passes requests through.
	expect(target.fetch).toBe(wrapper);
	await target.fetch("/_app/remote/h/getOrders");
	expect(noted).toEqual([]);
});
