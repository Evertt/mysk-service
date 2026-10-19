import { describe, expect, it } from "vite-plus/test";

import { announceChange, changedAt, watchChanges, watchSubject } from "#lib/server/changes.ts";

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
		expect(first).toMatchObject({ value: { type: "order" }, done: false });
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
});

describe("watchSubject", () => {
	const anna = { id: "user-anna", name: "Anna" };

	it("yields the changes of its record, with who made them", async () => {
		const changes = watchSubject("org-i", { type: "order", id: "7" });
		const seen: unknown[] = [];
		const done = (async () => {
			for await (const change of changes) seen.push(change);
		})();
		announceChange("org-i", "order", { id: "8", action: "updated", user: anna });
		announceChange("org-i", "customer", { id: "7", action: "updated", user: anna });
		announceChange("org-j", "order", { id: "7", action: "updated", user: anna });
		announceChange("org-i", "order");
		await tick();
		expect(seen).toEqual([]);
		announceChange("org-i", "order", { id: "7", action: "updated", user: anna });
		await tick();
		expect(seen).toEqual([
			{ type: "order", id: "7", action: "updated", user: anna, at: expect.any(Number) },
		]);
		changes.stop();
		await done;
	});

	it("yields the latest of a burst that came while the consumer was busy", async () => {
		const changes = watchSubject("org-k", { type: "order", id: "7" });
		announceChange("org-k", "order", { id: "7", action: "updated", user: anna });
		announceChange("org-k", "order", { id: "7", action: "scheduled", user: anna });
		expect(await changes.next()).toMatchObject({ value: { action: "scheduled" } });
		const second = await Promise.race([changes.next(), tick().then(() => "waiting")]);
		expect(second).toBe("waiting");
		changes.stop();
	});

	it("keeps type watchers working on announcements that name a record", async () => {
		const changes = watchChanges("org-l", ["order"]);
		announceChange("org-l", "order", { id: "7", action: "updated", user: anna });
		expect(await changes.next()).toMatchObject({ value: { type: "order", id: "7" } });
		changes.stop();
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
