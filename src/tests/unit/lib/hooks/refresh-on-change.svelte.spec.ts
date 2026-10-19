import { flushSync } from "svelte";
import { expect, test } from "vite-plus/test";

import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

/** A stand-in for a live query: its latest answer, `undefined` until the first. */
function liveQuery() {
	const query = $state({ current: undefined as number | undefined });
	return query;
}

/** Runs `refreshOnChange()` as a component would: how often it refreshed, and its stop. */
function mount(...args: Parameters<typeof refreshOnChange>) {
	const counted = { refreshes: 0 };
	const [watch, refresh, readTime] = args;
	const stop = $effect.root(() => {
		refreshOnChange(
			watch,
			() => {
				counted.refreshes++;
				return refresh();
			},
			readTime,
		);
	});
	flushSync();
	return { counted, stop };
}

/** Sets a stand-in's answer, and lets the effects run. */
function answer(query: { current: number | undefined }, value: number) {
	query.current = value;
	flushSync();
}

test("refreshes when the answer changes, not on the first answer", () => {
	const query = liveQuery();
	const { counted, stop } = mount(
		() => query,
		() => {},
	);
	answer(query, 100);
	expect(counted.refreshes).toBe(0);
	answer(query, 200);
	expect(counted.refreshes).toBe(1);
	answer(query, 200);
	expect(counted.refreshes).toBe(1);
	answer(query, 300);
	expect(counted.refreshes).toBe(2);
	stop();
});

test("with the data's read time, refreshes on a first answer later than it", () => {
	const later = liveQuery();
	const one = mount(
		() => later,
		() => {},
		() => 150,
	);
	answer(later, 151);
	expect(one.counted.refreshes).toBe(1);
	one.stop();

	const same = liveQuery();
	const other = mount(
		() => same,
		() => {},
		() => 150,
	);
	answer(same, 150);
	expect(other.counted.refreshes).toBe(0);
	answer(same, 160);
	expect(other.counted.refreshes).toBe(1);
	other.stop();
});

test("waits for a live query the getter doesn't give yet", () => {
	const query = liveQuery();
	let ready = $state(false);
	const { counted, stop } = mount(
		() => (ready ? query : undefined),
		() => {},
	);
	answer(query, 100);
	expect(counted.refreshes).toBe(0);
	ready = true;
	flushSync();
	expect(counted.refreshes).toBe(0);
	answer(query, 200);
	expect(counted.refreshes).toBe(1);
	stop();
});

test("takes another live query's first answer as its first, not as a change", () => {
	const first = liveQuery();
	const second = liveQuery();
	let current = $state(first);
	const { counted, stop } = mount(
		() => current,
		() => {},
	);
	answer(first, 100);
	answer(second, 900);
	current = second;
	flushSync();
	expect(counted.refreshes).toBe(0);
	answer(second, 950);
	expect(counted.refreshes).toBe(1);
	stop();
});

test("after a reconnection, refreshes only if the answer is another than before", () => {
	const query = liveQuery();
	const { counted, stop } = mount(
		() => query,
		() => {},
	);
	answer(query, 100);
	answer(query, 200);
	expect(counted.refreshes).toBe(1);
	query.current = undefined;
	flushSync();
	answer(query, 200);
	expect(counted.refreshes).toBe(1);
	query.current = undefined;
	flushSync();
	answer(query, 300);
	expect(counted.refreshes).toBe(2);
	stop();
});
