<!--
	@component
	What the current tenant's modules add to a core page at `name` (see `slotLoaders()` in
	`#lib/modules/manifests.ts`), with `props` passed on. Wrapped in a `div` with `class` (by default
	`contents`, so the components lay out as the page's own), or nothing if no module adds anything.

	Each module's part is rendered in a boundary of its own, so when it fails (its remote query
	throws, its chunk doesn't load) the page and the other modules' parts still render, and it shows
	a small card saying so, with a retry. The parts are server-rendered and awaited like the rest of
	the page, without a loading state.

	The components are loaded together, up front: loading each in a component of its own (an async
	`$derived` per part) froze the browser after an order was deleted from its page (Svelte 5.57).
	A component that doesn't load is thrown inside its boundary, so it fails like one that throws.

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

	import { getCurrentTenant } from "./session.remote.ts";

	let {
		name,
		props,
		class: className = "contents",
	}: { name: Name; props: SlotProps[Name]; class?: string } = $props();

	/** How often each module's part was tried again: each time loads it again, in a new boundary. */
	const attempts = $state<Partial<Record<ModuleId, number>>>({});

	const tenant = $derived(await getCurrentTenant());
	const parts = $derived(
		await Promise.all(
			slotLoaders(name, tenant.modules).map(({ id, load }) => {
				const attempt = attempts[id] ?? 0;
				return load().then(
					({ default: Slot }) => ({ id, attempt, Slot, error: undefined }),
					(error: unknown) => ({ id, attempt, Slot: undefined, error }),
				);
			}),
		),
	);

	const labelOf = (id: ModuleId) => modules.find((module) => module.id === id)?.label ?? id;

	/** Fails the boundary it's rendered in with `error`. */
	const fail = (error: unknown): never => {
		throw error;
	};
</script>

{#if parts.length}
	<div class={className}>
		{#each parts as { id, attempt, Slot, error } (id)}
			{#key attempt}
				<svelte:boundary
					onerror={(error: unknown) =>
						console.error(`The ${id} module's part of the ${name} slot failed`, error)}
				>
					{#if Slot}
						<Slot {...props} />
					{:else}
						{fail(error)}
					{/if}

					{#snippet failed()}
						<Card.Root size="sm" data-module-slot-failed={id}>
							<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
								<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
								<p class="flex-1">{m.common_error_module_part({ module: labelOf(id) })}</p>
								<Button variant="outline" size="sm" onclick={() => (attempts[id] = attempt + 1)}>
									{m.common_try_again()}
								</Button>
							</Card.Content>
						</Card.Root>
					{/snippet}
				</svelte:boundary>
			{/key}
		{/each}
	</div>
{/if}
