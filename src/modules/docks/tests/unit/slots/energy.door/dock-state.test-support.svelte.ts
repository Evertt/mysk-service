/**
 * Stand-ins for the docks' remote functions in `dock-state.svelte.spec.ts`: the door's dock (a
 * query that counts its refreshes) and the docks' live query, which, like SvelteKit's, gives a new
 * proxy over the same answer on every call.
 */
const door = $state({ current: null as Record<string, unknown> | null, refreshes: 0 });
const live = $state({ current: undefined as number | undefined });

export const fakes = { door, live };

export const getDoorDock = () => ({
	get current() {
		return door.current;
	},
	refresh() {
		door.refreshes++;
		return Promise.resolve();
	},
});

export const watchDocks = () => ({
	get current() {
		return live.current;
	},
});
