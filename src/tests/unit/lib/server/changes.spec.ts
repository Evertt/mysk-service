import { describe, expect, it } from "vite-plus/test";

import { announceChange, changedAt, watchChanges } from "#lib/server/changes.ts";

/** Lets pending promise callbacks run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("watchChanges", () => {
	it("yields for changes of its types in its organization only", async () => {
		const changes = watchChanges("org-a", ["order"]);
		const seen: number[] = [];
		const done = (async () => {
			for await (const _ of changes) seen.push(seen.length + 1);
		})();
		announceChange("org-b", "order");
		announceChange("org-a", "customer");
		await tick();
		expect(seen).toEqual([]);
		announceChange("org-a", "order");
		await tick();
		expect(seen).toEqual([1]);
		changes.stop();
		await done;
	});

	it("watches from the call on, before the first next()", async () => {
		const changes = watchChanges("org-c", ["order"]);
		announceChange("org-c", "order");
		const first = await Promise.race([changes.next(), tick().then(() => "waiting")]);
		expect(first).toEqual({ value: undefined, done: false });
		changes.stop();
	});

	it("yields once for a burst that came while the consumer was busy", async () => {
		const changes = watchChanges("org-d", ["order"]);
		announceChange("org-d", "order");
		announceChange("org-d", "order");
		announceChange("org-d", "order");
		await changes.next();
		const second = await Promise.race([changes.next(), tick().then(() => "waiting")]);
		expect(second).toBe("waiting");
		changes.stop();
	});

	it("ends a consumer that waits for a change when stopped", async () => {
		const changes = watchChanges("org-e", ["order"]);
		const next = changes.next();
		changes.stop();
		expect(await next).toEqual({ value: undefined, done: true });
	});

	it("stops watching without ever being iterated (a live query during SSR)", async () => {
		const changes = watchChanges("org-f", ["order"]);
		changes.stop();
		announceChange("org-f", "order");
		expect(await changes.next()).toEqual({ value: undefined, done: true });
	});
});

it("changedAt answers when a type last changed, 0 if never", () => {
	expect(changedAt("org-g", ["order", "customer"])).toBe(0);
	announceChange("org-g", "customer");
	const at = changedAt("org-g", ["order", "customer"]);
	expect(at).toBeGreaterThan(0);
	expect(changedAt("org-g", ["order"])).toBe(0);
	expect(changedAt("org-h", ["customer"])).toBe(0);
});
