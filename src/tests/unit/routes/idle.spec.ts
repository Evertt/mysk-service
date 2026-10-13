import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { watchActivity, whenIdle } from "#routes/idle.ts";

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;

/** A stand-in for the document: an event target that's shown or hidden. */
function fakePage() {
	return Object.assign(new EventTarget(), {
		visibilityState: "visible" as DocumentVisibilityState,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("watchActivity", () => {
	test("answers with when the user last did something", () => {
		const target = new EventTarget();
		const lastActive = watchActivity(target);
		const started = Date.now();
		vi.advanceTimersByTime(5 * minute);
		expect(lastActive()).toBe(started);
		target.dispatchEvent(new Event("keydown"));
		expect(lastActive()).toBe(started + 5 * minute);
		vi.advanceTimersByTime(minute);
		target.dispatchEvent(new Event("scroll"));
		expect(lastActive()).toBe(started + 6 * minute);
	});
});

describe("whenIdle", () => {
	test("acts once the user has done nothing for the time given", () => {
		const target = new EventTarget();
		const then = vi.fn();
		whenIdle(watchActivity(target), hour, then, fakePage());
		vi.advanceTimersByTime(hour - 1);
		expect(then).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(then).toHaveBeenCalledOnce();
	});

	test("counts from what the user did last, also before it started waiting", () => {
		const target = new EventTarget();
		const lastActive = watchActivity(target);
		vi.advanceTimersByTime(50 * minute);
		const then = vi.fn();
		whenIdle(lastActive, hour, then, fakePage());
		vi.advanceTimersByTime(10 * minute);
		expect(then).toHaveBeenCalledOnce();
	});

	test("waits longer whenever the user does something", () => {
		const target = new EventTarget();
		const then = vi.fn();
		whenIdle(watchActivity(target), hour, then, fakePage());
		vi.advanceTimersByTime(50 * minute);
		target.dispatchEvent(new Event("pointermove"));
		vi.advanceTimersByTime(50 * minute);
		expect(then).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10 * minute);
		expect(then).toHaveBeenCalledOnce();
	});

	test("acts at once when started after an idle hour", () => {
		const lastActive = watchActivity(new EventTarget());
		vi.advanceTimersByTime(2 * hour);
		const then = vi.fn();
		whenIdle(lastActive, hour, then, fakePage());
		expect(then).toHaveBeenCalledOnce();
	});

	test("checks again when the tab is shown, in case its timers ran late", () => {
		const lastActive = watchActivity(new EventTarget());
		const page = fakePage();
		const then = vi.fn();
		whenIdle(lastActive, hour, then, page);
		// The clock moves on while the hidden tab's timer doesn't fire.
		vi.setSystemTime(Date.now() + 2 * hour);
		expect(then).not.toHaveBeenCalled();
		page.dispatchEvent(new Event("visibilitychange"));
		expect(then).toHaveBeenCalledOnce();
	});

	test("does nothing once stopped", () => {
		const page = fakePage();
		const then = vi.fn();
		const stop = whenIdle(watchActivity(new EventTarget()), hour, then, page);
		stop();
		vi.advanceTimersByTime(2 * hour);
		page.dispatchEvent(new Event("visibilitychange"));
		expect(then).not.toHaveBeenCalled();
	});
});
