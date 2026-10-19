/**
 * The record types the activity log and the live queries share: the type check (svelte-check) runs
 * the `@ts-expect-error`s below.
 */
import { expect, test } from "vite-plus/test";

import type { Subject } from "#lib/server/activity/index.ts";
import type { announceChange } from "#lib/server/changes.ts";

const logged = (subject: Subject) => subject.type;
const announced = (type: Parameters<typeof announceChange>[1]) => type;

test("the log names records of the core's and the modules' types, and no other", () => {
	const types = [
		logged({ type: "order", id: 1, label: "ORD-1" }),
		logged({ type: "energy_site", id: 1, label: "Plant" }),
		// @ts-expect-error energy's readings are announced for its live queries, never logged
		logged({ type: "energy_reading", id: 1, label: "" }),
		// @ts-expect-error no record type is called that
		logged({ type: "ordr", id: 1, label: "ORD-1" }),
	];
	// Only the type check tells them apart.
	expect(types).toEqual(["order", "energy_site", "energy_reading", "ordr"]);
});

test("a change is announced for a logged type or a module's live-only type, and no other", () => {
	const types = [
		announced("order"),
		announced("energy_reading"),
		// @ts-expect-error no record type is called that
		announced("energy_readings"),
	];
	expect(types).toEqual(["order", "energy_reading", "energy_readings"]);
});
