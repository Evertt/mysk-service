/**
 * A live query's answers (`live()`): when its records last changed, or what its `answer` makes of
 * each change, from its first answer until its request ends. As a tenant's request, made up: the
 * request event is a stand-in, the change bus the real one.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { announceChange } from "#lib/server/changes.ts";
import type { DurableRequest } from "#lib/server/db/durable.ts";
import { FEED_WINDOW, live, liveFeed, readAt } from "#lib/server/live.ts";

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

describe("live(record)", () => {
	beforeEach(() => signIn("org-record"));

	test("answers when the record last changed, then again on each change but its deletion", async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		expect((await live({ type: "order", id: 3 }).next()).value).toBe(0);
		announceChange("org-record", "order", { id: "3", action: "updated" });
		announceChange("org-record", "order", { id: "4", action: "updated" });
		const answers = live({ type: "order", id: 3 });
		expect((await answers.next()).value).toBe(1_000_000);

		vi.setSystemTime(1_000_010);
		announceChange("org-record", "order", { id: "3", action: "deleted" });
		expect((await answers.next()).value).toBe(1_000_000);
		vi.setSystemTime(1_000_020);
		announceChange("org-record", "order", { id: "3", action: "updated" });
		expect((await answers.next()).value).toBe(1_000_020);
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
		// The first runs where it's asked for: here outside the stubbed request (on Cloudflare, in it).
		expect((await answers.next()).value).toBeUndefined();
		announceChange("org-answer", "order");
		expect((await answers.next()).value).toBe(durable);
	});
});

describe("liveFeed(present)", () => {
	beforeEach(() => signIn("org-feed"));

	test("answers no changes at first, then each burst's, as `present` makes them", async () => {
		vi.useFakeTimers({ now: 3_000_000, toFake: ["Date"] });
		announceChange("org-feed", "order", { id: "1" });
		const answers = liveFeed((change) => `${change.type}/${change.id}`);
		expect((await answers.next()).value).toEqual({ since: 3_000_000, now: 3_000_000, changes: [] });

		vi.setSystemTime(3_000_010);
		const pending = answers.next();
		announceChange("org-feed", "order", { id: "2" });
		announceChange("org-elsewhere", "order", { id: "3" });
		expect((await pending).value).toEqual({
			since: 3_000_000,
			now: 3_000_010,
			changes: ["order/2"],
		});
	});

	test("repeats the changes of its window, the latest of each record, then lets them go", async () => {
		vi.useFakeTimers({ now: 4_000_000, toFake: ["Date"] });
		const answers = liveFeed((change) => [`${change.type}/${change.id}`, change.action]);
		await answers.next();
		announceChange("org-feed", "order", { id: "1", action: "updated" });
		expect((await answers.next()).value?.changes).toEqual([["order/1", "updated"]]);

		vi.setSystemTime(4_000_000 + FEED_WINDOW - 1);
		announceChange("org-feed", "customer", { id: "1", action: "updated" });
		announceChange("org-feed", "order", { id: "1", action: "scheduled" });
		expect((await answers.next()).value?.changes).toEqual([
			["customer/1", "updated"],
			["order/1", "scheduled"],
		]);

		vi.setSystemTime(4_000_000 + 2 * FEED_WINDOW);
		announceChange("org-feed", "engineer", { id: "1", action: "updated" });
		expect((await answers.next()).value?.changes).toEqual([["engineer/1", "updated"]]);
	});

	test("stops when its request ends", async () => {
		const answers = liveFeed((change) => change);
		await answers.next();
		const waiting = answers.next();
		request.abort();
		expect(await waiting).toEqual({ value: undefined, done: true });
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

test("readAt is a millisecond before now, so a change in the same millisecond counts", () => {
	vi.useFakeTimers({ now: 1_000_000 });
	expect(readAt()).toBe(999_999);
});
