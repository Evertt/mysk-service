import { flushSync } from "svelte";
import { expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import DockState from "#modules/docks/slots/energy.door/dock-state.svelte";

import { fakes } from "./dock-state.test-support.svelte.ts";

vi.mock("#modules/docks/docks.remote.ts", () => import("./dock-state.test-support.svelte.ts"));

/** The door's dock as `getDoorDock` answers it, a new object each time. */
const dockOf = (plate: string) => ({
	code: "DOCK 05",
	siteId: 1,
	reported: true,
	scpOnline: true,
	locked: false,
	occupied: true,
	plate,
});

test("asks for the dock again on each change to the docks, also one that comes with a new answer for the dock", async () => {
	fakes.door.current = dockOf("84-BNX-7");
	await render(DockState, { doorId: 1, code: "D-05", equipmentId: 7 });
	fakes.live.current = 100;
	flushSync();
	expect(fakes.door.refreshes).toBe(0);

	fakes.live.current = 200;
	flushSync();
	expect(fakes.door.refreshes).toBe(1);

	// The refreshed dock and the next change, in the same update.
	fakes.door.current = dockOf("12-ABC-3");
	fakes.live.current = 300;
	flushSync();
	expect(fakes.door.refreshes).toBe(2);
});
