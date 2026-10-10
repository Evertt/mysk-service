<!--
	@component
	What the current tenant's modules add to a core page at `name` (see `slots` in
	`#lib/modules/manifests.ts`), with `props` passed on. Wrapped in a `div` with `class` (by default
	`contents`, so the components lay out as the page's own), or nothing if no module adds anything.

	Each module's part is rendered (and its component loaded, by `module-slot.svelte`) in a boundary
	of its own, so when it fails (its remote query throws, its chunk doesn't load) the page and the
	other modules' parts still render, and it shows a small card saying so, with a retry. The parts
	are server-rendered and awaited like the rest of the page, without a loading state.

	The error reaches the boundary through SvelteKit's `transformError`, which runs it through
	`handleError` (so the server logs it, and `failed` gets an `App.Error`). SvelteKit also takes it
	as the page's error: a page whose part failed on the server is answered with that status (500),
	and `page.error` is set, though the page renders as usual. Hydrating a part that failed on the
	server needs the fix in `patches/svelte@5.57.1.patch`.
-->
<script lang="ts" generics="Name extends SlotName">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import {
		type ModuleId,
		modules,
		type SlotName,
		type SlotProps,
		slotLoaders,
	} from "#lib/modules/manifests.ts";

	import ModuleSlot from "./module-slot.svelte";
	import { getCurrentTenant } from "./session.remote.ts";

	let {
		name,
		props,
		class: className = "contents",
	}: { name: Name; props: SlotProps[Name]; class?: string } = $props();

	const tenant = $derived(await getCurrentTenant());
	const contributions = $derived(slotLoaders(name, tenant.modules));

	const labelOf = (id: ModuleId) => modules.find((module) => module.id === id)?.label ?? id;
</script>

{#if contributions.length}
	<div class={className}>
		{#each contributions as { id, load } (id)}
			<svelte:boundary
				onerror={(error: unknown) =>
					console.error(`The ${id} module's part of the ${name} slot failed`, error)}
			>
				<ModuleSlot {load} {props} />

				{#snippet failed(_: unknown, reset: () => void)}
					<Card.Root size="sm" data-module-slot-failed={id}>
						<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
							<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
							<p class="flex-1">{m.common_error_module_part({ module: labelOf(id) })}</p>
							<Button variant="outline" size="sm" onclick={reset}>{m.common_try_again()}</Button>
						</Card.Content>
					</Card.Root>
				{/snippet}
			</svelte:boundary>
		{/each}
	</div>
{/if}
