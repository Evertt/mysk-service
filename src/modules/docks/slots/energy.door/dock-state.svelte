<!--
	@component
	The docks module's part of the energy module's door card (`energy.door`), for a monitored door
	that's a dock's door: the dock's state, whether the Wheel-Lok is on and the plate of the truck at
	it, live (`watchDocks`), linking to the dock's board. Nothing for a door that's no dock's door, or
	no unit at all.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

	import { dockStateDisplay } from "../../display.ts";
	import { getDoorDock, watchDocks } from "../../docks.remote.ts";
	import { dockState } from "../../model.ts";

	let {
		equipmentId,
	}: {
		doorId: number;
		code: string;
		equipmentId: number | null;
	} = $props();

	// Read as it comes rather than awaited: the door cards come and go with the energy page's live
	// figures and its scope, and an await of each card's (on top of its slot's) holds them up.
	const query = $derived(equipmentId === null ? undefined : getDoorDock(equipmentId));
	const dock = $derived(query?.current ?? null);
	const state = $derived(dock && dockState(dock, dock.occupied));

	// Live, once it's a dock's: a change to the docks (the feed's events, an edit) asks again. On
	// whether it's a dock's, not on the dock itself: each answer is a new one, and each call of
	// `watchDocks()` a new handle, which `refreshOnChange()` would take for another live query.
	const docked = $derived(dock !== null);
	refreshOnChange(
		() => docked && watchDocks(),
		() => query?.refresh(),
	);
</script>

{#if dock && state}
	<a
		href="{resolve('/(app)/(modules)/docks')}?site={dock.siteId}"
		class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
		title={m.docks_door_card_link({ code: dock.code })}
		data-door-dock={dock.code}
	>
		<span class="font-mono font-medium">{dock.code}</span>
		{#if dock.reported}
			<EnumBadge display={dockStateDisplay} value={state} data-dock-state={state} />
			<span class="inline-flex items-center gap-1" data-door-dock-locked={dock.locked}>
				{#if dock.locked}
					<LockIcon class="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
					{m.docks_locked()}
				{:else}
					<LockOpenIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
					{m.docks_not_locked()}
				{/if}
			</span>
		{:else}
			<Badge variant="outline">{m.docks_no_state()}</Badge>
		{/if}
		{#if dock.plate}
			<span class="font-mono" data-door-dock-plate>{dock.plate}</span>
		{/if}
	</a>
{/if}
