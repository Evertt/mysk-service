<!--
	@component
	What the current tenant's modules add to a core page at the slot `point` (see `defineSlot()` in
	`#lib/extensions/define.ts`), with `props` passed on: the contributions in
	`#lib/extensions/contributions.gen.ts` to that point, of the modules the tenant has, in registry
	order. Wrapped in a `div` with `class` (by default `contents`, so the components lay out as the
	page's own), or nothing if no module adds anything.

	Each contribution is rendered in a boundary of its own, so when it fails (its remote query
	throws, its chunk doesn't load) the page and the other contributions still render, and it shows
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
<script lang="ts" generics="Props extends Record<string, unknown>">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import { getCurrentTenant } from "#lib/auth/session.remote.ts";
	import { slotContributions } from "#lib/extensions/contributions.gen.ts";
	import type { SlotContribution, SlotPoint } from "#lib/extensions/define.ts";
	import { type ModuleId, modules } from "#lib/modules/manifests.ts";

	let {
		point,
		props,
		class: className = "contents",
	}: { point: SlotPoint<Props>; props: Props; class?: string } = $props();

	/** How often each contribution was tried again: each time loads it again, in a new boundary. */
	const attempts = $state<Record<string, number>>({});

	const tenant = $derived(await getCurrentTenant());
	const parts = $derived(
		await Promise.all(
			slotContributions
				.filter((entry) => entry.point === point.id && tenant.modules.includes(entry.module))
				.map(({ id, module, load }) => {
					const attempt = attempts[id] ?? 0;
					// A contribution to this point takes this point's props (`slotContribution()`).
					return (load as SlotContribution<Props>["load"])().then(
						({ default: Slot }) => ({ id, module, attempt, Slot, error: undefined }),
						(error: unknown) => ({ id, module, attempt, Slot: undefined, error }),
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
		{#each parts as { id, module, attempt, Slot, error } (id)}
			{#key attempt}
				<svelte:boundary
					onerror={(error: unknown) => console.error(`The ${id} contribution failed`, error)}
				>
					{#if Slot}
						<Slot {...props} />
					{:else}
						{fail(error)}
					{/if}

					{#snippet failed()}
						<Card.Root size="sm" data-extension-failed={id}>
							<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
								<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
								<p class="flex-1">{m.common_error_module_part({ module: labelOf(module) })}</p>
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
