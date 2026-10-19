/**
 * A live query's answers (`live()`): when its records last changed, or what its `answer` makes of
 * each change, from its first answer until its request ends. As a tenant's request, made up: the
 * request event is a stand-in, the change bus the real one.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { announceChange } from "#lib/server/changes.ts";
import type { DurableRequest } from "#lib/server/db/durable.ts";
import { live, readAt } from "#lib/server/live.ts";

const event = vi.hoisted(() => ({
	locals: {} as Record<string, unknown>,
	request: { signal: new AbortController().signal },
}));
vi.mock("$app/server", () => ({ getRequestEvent: () => event }));

let request: AbortController;
/** Starts a request of the tenant `organizationId`'s (each test its own, so their changes don't meet). */
function signIn(organizationId: string) {
	request = new AbortController();
	event.request.signal = request.signal;
	event.locals = {
		user: { id: "u1", name: "Avery" },
		tenant: { organizationId, roles: ["owner"], modules: [] },
	};
}

/** Lets pending promise callbacks run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** The next answer, or "waiting" if there's none yet (the same `pending` one, if given). */
const nextOf = <T>(answers: AsyncGenerator<T, void>, pending = answers.next()) =>
	Promise.race([pending, tick().then(() => "waiting" as const)]);

afterEach(() => {
	request.abort();
	vi.useRealTimers();
	globalThis.durableRequests = undefined;
});

describe("live(types)", () => {
	beforeEach(() => signIn("org-types"));

	test("answers when its types last changed, then again on each change", async () => {
		announceChange("org-types", "order");
		const answers = live(["order", "customer"]);
		const first = await answers.next();
		expect(first.value).toBeGreaterThan(0);
		const pending = answers.next();
		expect(await nextOf(answers, pending)).toBe("waiting");

		await new Promise((resolve) => setTimeout(resolve, 2));
		announceChange("org-types", "customer");
		expect((await pending).value).toBeGreaterThan(first.value as number);
	});

	test("answers 0 for types that haven't changed since the server started", async () => {
		expect((await live(["engineer"]).next()).value).toBe(0);
	});

	test("ignores changes of other types and other tenants", async () => {
		const answers = live(["equipment"]);
		await answers.next();
		announceChange("org-types", "order");
		announceChange("org-elsewhere", "equipment");
		expect(await nextOf(answers)).toBe("waiting");
	});

	test("doesn't miss a change between the call and its first answer", async () => {
		const answers = live(["site"]);
		announceChange("org-types", "site");
		await answers.next();
		expect(await nextOf(answers)).toMatchObject({ done: false });
	});

	test("answers once for a burst of changes", async () => {
		const answers = live(["location"]);
		await answers.next();
		announceChange("org-types", "location");
		announceChange("org-types", "location");
		announceChange("org-types", "location");
		await answers.next();
		expect(await nextOf(answers)).toBe("waiting");
	});
});

describe("live(watched, answer)", () => {
	beforeEach(() => signIn("org-answer"));

	test("answers with what `answer` makes of nothing first, then of each change", async () => {
		const answers = live(["order"], (change) => change?.action ?? "first");
		expect((await answers.next()).value).toBe("first");
		announceChange("org-answer", "order", { action: "updated" });
		expect((await answers.next()).value).toBe("updated");
	});

	test("watches one record: its changes only, with who made them", async () => {
		const answers = live({ type: "customer", id: 7 }, (change) => change?.user?.name ?? null);
		expect((await answers.next()).value).toBeNull();
		const pending = answers.next();
		announceChange("org-answer", "customer", { id: "8", user: { id: "u2", name: "Bo" } });
		expect(await nextOf(answers, pending)).toBe("waiting");
		announceChange("org-answer", "customer", { id: "7", user: { id: "u2", name: "Bo" } });
		expect((await pending).value).toBe("Bo");
	});

	test("ends with the error its answer throws", async () => {
		const answers = live(["order"], () => {
			throw new Error("Not found");
		});
		await expect(answers.next()).rejects.toThrow("Not found");
		expect(await answers.next()).toEqual({ value: undefined, done: true });
	});

	test("answers changes inside the Cloudflare request it was made in", async () => {
		const requests = new AsyncLocalStorage<DurableRequest>();
		globalThis.durableRequests = requests;
		const durable = { storage: {} } as DurableRequest;
		const answers = requests.run(durable, () => live(["order"], () => requests.getStore()));
		// The first, where it's asked for: in the request itself.
		expect((await answers.next()).value).toBeUndefined();
		announceChange("org-answer", "order");
		expect((await answers.next()).value).toBe(durable);
	});
});

describe("when its request ends", () => {
	beforeEach(() => signIn("org-end"));

	test("stops answering, also while waiting for a change", async () => {
		const answers = live(["order"]);
		await answers.next();
		const waiting = answers.next();
		request.abort();
		expect(await waiting).toEqual({ value: undefined, done: true });
	});

	test("stops watching though nothing ever asked for an answer (server-side rendering)", async () => {
		const answers = live(["order"]);
		request.abort();
		announceChange("org-end", "order");
		await answers.next();
		expect(await nextOf(answers)).toEqual({ value: undefined, done: true });
	});
});

describe("readAt", () => {
	beforeEach(() => signIn("org-read"));

	test("is when the types last changed, or a millisecond before in that same millisecond", () => {
		vi.useFakeTimers({ now: 1_000_000 });
		expect(readAt(["order"])).toBe(0);
		announceChange("org-read", "order");
		expect(readAt(["order", "customer"])).toBe(999_999);
		vi.setSystemTime(1_000_005);
		expect(readAt(["order"])).toBe(1_000_000);
	});
});
