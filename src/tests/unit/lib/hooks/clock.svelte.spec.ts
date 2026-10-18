import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { Clock } from "#lib/hooks/clock.svelte.ts";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** Reads `clock.now` in an effect, as a template does: the moments it read, and its stop. */
function watch(clock: Clock) {
	const read: number[] = [];
	const stop = $effect.root(() => {
		$effect(() => {
			read.push(clock.now.epochMilliseconds);
		});
	});
	flushSync();
	return { read, stop };
}

/** Lets the time pass, and the effects it set off run. */
function pass(ms: number) {
	vi.advanceTimersByTime(ms);
	flushSync();
}

test("runs what reads it again every interval, with the moment then", () => {
	const started = Date.now();
	const { read, stop } = watch(new Clock(1000));

	pass(999);
	expect(read).toEqual([started]);
	pass(1);
	expect(read).toEqual([started, started + 1000]);
	pass(1000);
	pass(1000);
	expect(read).toEqual([started, started + 1000, started + 2000, started + 3000]);
	stop();
});

test("keeps its own interval", () => {
	const started = Date.now();
	const { read, stop } = watch(new Clock(15_000));

	pass(14_999);
	expect(read).toEqual([started]);
	pass(1);
	expect(read).toEqual([started, started + 15_000]);
	stop();
});

test("starts a timer for its first reader and stops it after its last", async () => {
	const clock = new Clock(1000);
	expect(clock.now.epochMilliseconds).toBe(Date.now());
	expect(vi.getTimerCount()).toBe(0);

	const first = watch(clock);
	const second = watch(clock);
	expect(vi.getTimerCount()).toBe(1);

	first.stop();
	await Promise.resolve();
	expect(vi.getTimerCount()).toBe(1);
	second.stop();
	await Promise.resolve();
	expect(vi.getTimerCount()).toBe(0);
});
