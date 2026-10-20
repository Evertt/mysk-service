/**
 * The office tab's registry of who follows which record (`ChangeFeed`): which listeners the feed's
 * answers reach, once each, and what it asks for when the feed can't tell (before it watched).
 * `onRecordChange()` ties a listener to a component; the e2e tests (`orders.live.test.ts`) keep
 * that and the stream it shares.
 */
import { describe, expect, test, vi } from "vite-plus/test";

import type { TenantChange, TenantChanges } from "#lib/components/activity/activity.remote.ts";
import { ChangeFeed } from "#lib/components/activity/change-feed.ts";

const order = { type: "order", id: 7 } as const;

/** A change to `order` 7 (or another record) at `at`. */
const change = (at: number, fields: Partial<TenantChange> = {}): TenantChange => ({
	type: "order",
	id: "7",
	action: "updated",
	name: "Pieter",
	mine: false,
	at,
	...fields,
});

/** An answer of the stream that started at `since`. */
const answer = (since: number, now: number, changes: TenantChange[] = []): TenantChanges => ({
	since,
	now,
	changes,
});

/** A feed whose record last changed at `changedAt`, with a listener on `order` 7. */
function setUp(changedAt = 0) {
	const asked = vi.fn(() => Promise.resolve(changedAt));
	const feed = new ChangeFeed(asked);
	const heard: (number | null)[] = [];
	const listen = (readTime?: number) =>
		feed.subscribe(order, (change) => heard.push(change?.at ?? null), readTime);
	return { feed, asked, heard, listen };
}

/** Lets the catch-up's answer arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a listener", () => {
	test("hears each change to its record once, though the window repeats it", () => {
		const { feed, heard, listen } = setUp();
		feed.receive(answer(100, 100));
		listen();
		feed.receive(answer(100, 110, [change(110)]));
		feed.receive(answer(100, 120, [change(110), change(120, { type: "customer" })]));
		feed.receive(answer(100, 130, [change(110), change(125, { id: "8" }), change(130)]));
		expect(heard).toEqual([110, 130]);
	});

	test("hears nothing once unsubscribed", () => {
		const { feed, heard, listen } = setUp();
		feed.receive(answer(100, 100));
		const stop = listen();
		stop();
		feed.receive(answer(100, 110, [change(110)]));
		expect(heard).toEqual([]);
	});

	test("subscribed before the feed's first answer hears from that answer on", () => {
		const { feed, heard, listen, asked } = setUp();
		listen();
		feed.receive(answer(100, 100, [change(90)]));
		feed.receive(answer(100, 110, [change(90), change(110)]));
		expect(heard).toEqual([110]);
		expect(asked).not.toHaveBeenCalled();
	});

	test("with a read time, hears a change the feed told before it subscribed", () => {
		const { feed, heard, listen } = setUp();
		feed.receive(answer(100, 100));
		feed.receive(answer(100, 120, [change(115)]));
		listen(110);
		listen(118);
		expect(heard).toEqual([115]);
	});
});

describe("coming back to a record", () => {
	test("with what it read before, hears of a change made while no one watched it", () => {
		const { feed, heard, listen } = setUp();
		feed.receive(answer(100, 100));
		feed.receive(answer(100, 110, [change(110)]));
		// Long after the window let it go.
		feed.receive(answer(100, 200, [change(200, { id: "8" })]));
		listen(105);
		listen(115);
		expect(heard).toEqual([110]);
	});

	test("read before the feed watched, asks only the first time", async () => {
		const { feed, heard, listen, asked } = setUp(95);
		const stop = listen(90);
		feed.receive(answer(100, 100));
		await settle();
		stop();
		listen(90);
		await settle();
		expect(asked).toHaveBeenCalledOnce();
		expect(heard).toEqual([null, null]);
	});
});

describe("what the feed can't tell", () => {
	test("read before the feed watched (the first load): asks, and hears of a later change", async () => {
		const { feed, heard, listen, asked } = setUp(95);
		listen(90);
		feed.receive(answer(100, 100));
		await settle();
		expect(asked).toHaveBeenCalledWith(order);
		expect(heard).toEqual([null]);
	});

	test("asks once for the listeners of one record", async () => {
		const { feed, heard, listen, asked } = setUp(95);
		listen(90);
		listen(92);
		feed.receive(answer(100, 100));
		await settle();
		expect(asked).toHaveBeenCalledOnce();
		expect(heard).toEqual([null, null]);
	});

	test("asks, and hears nothing when the record didn't change after it was read", async () => {
		const { feed, heard, listen } = setUp(80);
		feed.receive(answer(100, 100));
		listen(90);
		await settle();
		expect(heard).toEqual([]);
	});

	test("while the feed reconnected: asks about the gap", async () => {
		const { feed, heard, listen, asked } = setUp(150);
		feed.receive(answer(100, 100));
		listen();
		feed.receive(answer(100, 120));
		expect(asked).not.toHaveBeenCalled();
		feed.receive(answer(200, 200));
		await settle();
		expect(asked).toHaveBeenCalledOnce();
		expect(heard).toEqual([null]);
	});

	test("an answer for a listener gone meanwhile is dropped", async () => {
		const { feed, heard, listen } = setUp(95);
		const stop = listen(90);
		feed.receive(answer(100, 100));
		stop();
		await settle();
		expect(heard).toEqual([]);
	});
});
