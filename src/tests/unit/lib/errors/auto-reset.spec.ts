import { expect, test } from "vite-plus/test";

import { AUTO_RESET_WINDOW_MS, AutoResets } from "#lib/errors/auto-reset.ts";

test("a page resets by itself once per window", () => {
	const resets = new AutoResets();
	expect(resets.allow("/orders", 0)).toBe(true);
	expect(resets.allow("/orders", 1_000)).toBe(false);
	expect(resets.allow("/orders", AUTO_RESET_WINDOW_MS - 1)).toBe(false);
	// The window is the one the first reset started, not moved by the refusals.
	expect(resets.allow("/orders", AUTO_RESET_WINDOW_MS)).toBe(true);
	expect(resets.allow("/orders", AUTO_RESET_WINDOW_MS + 1)).toBe(false);
});

test("another page has a window of its own", () => {
	const resets = new AutoResets();
	expect(resets.allow("/orders", 0)).toBe(true);
	expect(resets.allow("/customers", 1)).toBe(true);
	expect(resets.allow("/orders", 2)).toBe(false);
});

test("each boundary has windows of its own", () => {
	const one = new AutoResets();
	const other = new AutoResets();
	expect(one.allow("/orders", 0)).toBe(true);
	expect(other.allow("/orders", 0)).toBe(true);
});
